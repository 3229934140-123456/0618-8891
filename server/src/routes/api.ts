import { Router, Request } from 'express';
import { db } from '../db';
import { authMiddleware, optionalAuth, checkDocumentAccess, AuthRequest } from '../auth';
import { v4 as uuid } from 'uuid';
import YAML from 'yaml';

const router = Router();

router.post('/proxy', async (req, res) => {
  try {
    const { url, method, headers, body } = req.body;
    if (!url) return res.status(400).json({ error: 'URL 必填' });

    const fetchHeaders: Record<string, string> = {};
    if (headers) {
      for (const h of headers) {
        if (h.key && h.value) fetchHeaders[h.key] = h.value;
      }
    }

    const options: RequestInit = {
      method: method || 'GET',
      headers: fetchHeaders,
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const startTime = Date.now();
    const response = await fetch(url, options);
    const elapsed = Date.now() - startTime;

    const responseText = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });

    let parsedBody: any = responseText;
    try {
      parsedBody = JSON.parse(responseText);
    } catch {}

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: parsedBody,
      elapsed_ms: elapsed,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || '请求失败' });
  }
});

router.post('/:documentId/import-openapi', authMiddleware, async (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }

  try {
    const { spec } = req.body;
    let parsed: any;
    try {
      parsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
    } catch {
      parsed = YAML.parse(spec);
    }

    const modulesMap = new Map<string, string>();

    for (const [path, methods] of Object.entries<any>(parsed.paths || {})) {
      for (const [method, operation] of Object.entries<any>(methods || {})) {
        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
          const tags = operation.tags || ['默认'];
          const tagName = tags[0];

          let moduleId = modulesMap.get(tagName);
          if (!moduleId) {
            moduleId = uuid();
            const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM modules WHERE document_id = ?')
              .get(req.params.documentId) as any;
            db.prepare('INSERT INTO modules (id, document_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?)')
              .run(moduleId, req.params.documentId, tagName, '', maxSort.max + 1);
            modulesMap.set(tagName, moduleId);
          }

          const parameters = (operation.parameters || []).map((p: any) => ({
            name: p.name,
            in: p.in,
            type: p.schema?.type || 'string',
            required: !!p.required,
            description: p.description || '',
          }));

          const epId = uuid();
          const maxEpSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM endpoints WHERE module_id = ?')
            .get(moduleId) as any;

          let requestBody: any = null;
          if (operation.requestBody?.content) {
            const jsonContent = operation.requestBody.content['application/json'];
            if (jsonContent) {
              requestBody = jsonContent.schema || null;
            }
          }

          let responseSchema: any = null;
          const successResp = operation.responses?.['200'] || operation.responses?.['201'];
          if (successResp?.content?.['application/json']) {
            responseSchema = successResp.content['application/json'].schema || null;
          }

          db.prepare(`
            INSERT INTO endpoints (id, module_id, name, description, method, path, parameters, request_body, response_schema, request_examples, response_examples, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            epId, moduleId,
            operation.summary || `${method.toUpperCase()} ${path}`,
            operation.description || '',
            method.toUpperCase(),
            path,
            JSON.stringify(parameters),
            JSON.stringify(requestBody),
            JSON.stringify(responseSchema),
            JSON.stringify({}),
            JSON.stringify({}),
            maxEpSort.max + 1
          );
        }
      }
    }

    const moduleCount = modulesMap.size;
    const endpointCount = Array.from(modulesMap.values()).reduce((sum, mid) => {
      const cnt = db.prepare('SELECT COUNT(*) as c FROM endpoints WHERE module_id = ?').get(mid) as any;
      return sum + (cnt?.c || 0);
    }, 0);

    const changes = [`从 OpenAPI 规范导入：${moduleCount} 个模块，${endpointCount} 个接口`];
    addChangelog(req.params.documentId, changes);
    saveVersion(req.params.documentId, req.user!.id, changes[0]);

    res.json({ success: true, imported_modules: moduleCount, imported_endpoints: endpointCount });
  } catch (e: any) {
    res.status(400).json({ error: '解析失败: ' + e.message });
  }
});

function addChangelog(docId: string, changes: string[]) {
  try {
    const logs = db.prepare('SELECT * FROM changelogs WHERE document_id = ? ORDER BY created_at DESC').all(docId);
    let version = '1.0.0';
    if (logs.length > 0) {
      const lastVer = logs[0].version.split('.').map(Number);
      lastVer[2] = (lastVer[2] || 0) + 1;
      version = lastVer.join('.');
    }
    const id = uuid();
    db.prepare(`INSERT INTO changelogs (id, document_id, version, changes) VALUES (?, ?, ?, ?)`)
      .run(id, docId, version, JSON.stringify(changes));
  } catch (e) {
    console.error('changelog error:', e);
  }
}

function saveVersion(docId: string, userId: string, summary: string) {
  try {
    const modules = db.prepare('SELECT * FROM modules WHERE document_id = ? ORDER BY sort_order').all(docId);
    const endpoints = db.prepare(`
      SELECT e.* FROM endpoints e
      INNER JOIN modules m ON e.module_id = m.id
      WHERE m.document_id = ?
    `).all(docId);
    const maxRow = db.prepare('SELECT version FROM document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 1').get(docId) as any;
    const version = (maxRow?.version || 0) + 1;
    const id = uuid();
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version, content, change_summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, docId, version, JSON.stringify({ modules, endpoints }), summary, userId);
  } catch (e) {
    console.error('version error:', e);
  }
}

export default router;
