import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';
import { serializeEndpoint } from '../utils';
import { saveVersion, addChangelog } from './versions';

const router = Router();

function getDocIdOfEndpoint(epId: string): string | null {
  const rows = db.prepare(`
    SELECT m.document_id FROM endpoints e
    INNER JOIN modules m ON e.module_id = m.id
    WHERE e.id = ?
  `).all(epId) as any[];
  return rows[0]?.document_id || null;
}

function getNextVersion(docId: string): string {
  const logs = db.prepare('SELECT * FROM changelogs WHERE document_id = ? ORDER BY created_at DESC').all(docId);
  if (logs.length === 0) return '1.0.0';
  const parts = (logs[0].version || '1.0.0').split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

router.post('/modules/:moduleId/endpoints', authMiddleware, async (req: AuthRequest, res) => {
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

  const version = getNextVersion(mod.document_id);
  saveVersion(mod.document_id, req.user!.id, `新增接口「${name}」`);
  await addChangelog(mod.document_id, req.user!.id, version, [`新增接口「${name}」 (${method} ${path})`]);

  const ep = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id);
  res.json(serializeEndpoint(ep));
});

router.put('/endpoints/:id', authMiddleware, async (req: AuthRequest, res) => {
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

  const version = getNextVersion(docId);
  addChangelog(docId, req.user!.id, version, changes);
  saveVersion(docId, req.user!.id, changes.join('；'));

  const updated = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(req.params.id);
  res.json(serializeEndpoint(updated));
});

router.delete('/endpoints/:id', authMiddleware, async (req: AuthRequest, res) => {
  const docId = getDocIdOfEndpoint(req.params.id);
  if (!docId) return res.status(404).json({ error: '接口不存在' });
  if (!checkDocumentAccess(docId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldEp = serializeEndpoint(db.prepare('SELECT * FROM endpoints WHERE id = ?').get(req.params.id));
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(req.params.id);

  const version = getNextVersion(docId);
  addChangelog(docId, req.user!.id, version, [`删除接口「${oldEp.name}」`]);
  saveVersion(docId, req.user!.id, `删除接口「${oldEp.name}」`);

  res.json({ success: true });
});

export default router;
