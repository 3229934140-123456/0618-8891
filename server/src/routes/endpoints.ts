import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';
import { serializeEndpoint, parseJsonField } from '../utils';

const router = Router();

function getDocIdOfEndpoint(epId: string): string | null {
  const rows = db.prepare(`
    SELECT m.document_id FROM endpoints e
    INNER JOIN modules m ON e.module_id = m.id
    WHERE e.id = ?
  `).all(epId) as any[];
  return rows[0]?.document_id || null;
}

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
    notifySubscribers(docId, version, changes);
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
    const maxVer = db.prepare('SELECT MAX(version) as max FROM document_versions WHERE document_id = ?').get(docId) as any;
    const version = (maxVer?.max || 0) + 1;
    const id = uuid();
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version, content, change_summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, docId, version, JSON.stringify({ modules, endpoints }), summary, userId);
  } catch (e) {
    console.error('version error:', e);
  }
}

function notifySubscribers(docId: string, version: string, changes: string[]) {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as any;
    const subs = db.prepare('SELECT email FROM subscriptions WHERE document_id = ?').all(docId) as any[];
    if (subs.length === 0 || !doc) return;
    const subject = `【文档更新】${doc.title} v${version}`;
    subs.forEach((s) => {
      console.log(`[邮件通知] To: ${s.email}, Subject: ${subject}`);
      console.log(`  变更内容: ${changes.join(', ')}`);
    });
  } catch (e) {
    console.error('notify error:', e);
  }
}

router.post('/modules/:moduleId/endpoints', authMiddleware, (req: AuthRequest, res) => {
  const mod = db.prepare('SELECT document_id FROM modules WHERE id = ?').get(req.params.moduleId) as any;
  if (!mod) return res.status(404).json({ error: '模块不存在' });
  if (!checkDocumentAccess(mod.document_id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { name, description, method, path, parameters, request_body, response_schema, request_examples, response_examples } = req.body;
  const id = uuid();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM endpoints WHERE module_id = ?')
    .get(req.params.moduleId) as any;

  db.prepare(`
    INSERT INTO endpoints (id, module_id, name, description, method, path, parameters, request_body, response_schema, request_examples, response_examples, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.params.moduleId, name, description || '', method, path,
    JSON.stringify(parameters || []),
    JSON.stringify(request_body || null),
    JSON.stringify(response_schema || null),
    JSON.stringify(request_examples || {}),
    JSON.stringify(response_examples || {}),
    (maxSort.max || 0) + 1
  );

  addChangelog(mod.document_id, [`新增接口「${name}」 (${method} ${path})`]);
  saveVersion(mod.document_id, req.user!.id, `新增接口「${name}」`);

  const ep = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id);
  res.json(serializeEndpoint(ep));
});

router.put('/endpoints/:id', authMiddleware, (req: AuthRequest, res) => {
  const docId = getDocIdOfEndpoint(req.params.id);
  if (!docId) return res.status(404).json({ error: '接口不存在' });
  if (!checkDocumentAccess(docId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldEp = serializeEndpoint(db.prepare('SELECT * FROM endpoints WHERE id = ?').get(req.params.id));
  const { name, description, method, path, parameters, request_body, response_schema, request_examples, response_examples, sort_order } = req.body;

  db.prepare(`
    UPDATE endpoints SET name = ?, description = ?, method = ?, path = ?, parameters = ?, request_body = ?, response_schema = ?, request_examples = ?, response_examples = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name, description, method, path,
    JSON.stringify(parameters),
    JSON.stringify(request_body),
    JSON.stringify(response_schema),
    JSON.stringify(request_examples),
    JSON.stringify(response_examples),
    sort_order,
    req.params.id
  );

  const changes: string[] = [];
  if (oldEp.name !== name) changes.push(`接口「${oldEp.name}」重命名为「${name}」`);
  if (oldEp.method !== method || oldEp.path !== path) changes.push(`接口路径更新为 ${method} ${path}`);
  if (oldEp.description !== description) changes.push(`更新接口「${name}」描述`);
  if (JSON.stringify(oldEp.parameters) !== JSON.stringify(parameters)) changes.push(`更新接口「${name}」参数`);
  if (changes.length === 0) changes.push(`更新接口「${name}」`);

  addChangelog(docId, changes);
  saveVersion(docId, req.user!.id, changes.join('；'));

  const updated = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(req.params.id);
  res.json(serializeEndpoint(updated));
});

router.delete('/endpoints/:id', authMiddleware, (req: AuthRequest, res) => {
  const docId = getDocIdOfEndpoint(req.params.id);
  if (!docId) return res.status(404).json({ error: '接口不存在' });
  if (!checkDocumentAccess(docId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldEp = serializeEndpoint(db.prepare('SELECT * FROM endpoints WHERE id = ?').get(req.params.id));
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(req.params.id);

  addChangelog(docId, [`删除接口「${oldEp.name}」`]);
  saveVersion(docId, req.user!.id, `删除接口「${oldEp.name}」`);

  res.json({ success: true });
});

export default router;
