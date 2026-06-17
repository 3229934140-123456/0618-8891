import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

function parseJsonField(val: any, fallback: any) {
  if (!val) return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return fallback;
  }
}

function serializeEndpoint(row: any) {
  return {
    ...row,
    parameters: parseJsonField(row.parameters, []),
    request_body: parseJsonField(row.request_body, null),
    response_schema: parseJsonField(row.response_schema, null),
    request_examples: parseJsonField(row.request_examples, {}),
    response_examples: parseJsonField(row.response_examples, {}),
  };
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
    maxSort.max + 1
  );
  const ep = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id);
  res.json(serializeEndpoint(ep));
});

router.put('/endpoints/:id', authMiddleware, (req: AuthRequest, res) => {
  const ep = db.prepare(`
    SELECT m.document_id FROM endpoints e
    INNER JOIN modules m ON e.module_id = m.id
    WHERE e.id = ?
  `).get(req.params.id) as any;
  if (!ep) return res.status(404).json({ error: '接口不存在' });
  if (!checkDocumentAccess(ep.document_id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
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
  const updated = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(req.params.id);
  res.json(serializeEndpoint(updated));
});

router.delete('/endpoints/:id', authMiddleware, (req: AuthRequest, res) => {
  const ep = db.prepare(`
    SELECT m.document_id FROM endpoints e
    INNER JOIN modules m ON e.module_id = m.id
    WHERE e.id = ?
  `).get(req.params.id) as any;
  if (!ep) return res.status(404).json({ error: '接口不存在' });
  if (!checkDocumentAccess(ep.document_id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
