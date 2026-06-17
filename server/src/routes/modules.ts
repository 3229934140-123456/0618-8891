import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';
import { saveVersion, addChangelog } from './versions';

const router = Router();

function getDocIdOfModule(moduleId: string): string | null {
  const m = db.prepare('SELECT document_id FROM modules WHERE id = ?').get(moduleId) as any;
  return m?.document_id || null;
}

function getNextVersion(docId: string): string {
  const logs = db.prepare('SELECT * FROM changelogs WHERE document_id = ? ORDER BY created_at DESC').all(docId);
  if (logs.length === 0) return '1.0.0';
  const parts = (logs[0].version || '1.0.0').split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

router.post('/:documentId/modules', authMiddleware, async (req: AuthRequest, res) => {
  const { documentId } = req.params;
  if (!checkDocumentAccess(documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { name, description } = req.body;
  const id = uuid();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM modules WHERE document_id = ?')
    .get(documentId) as any;
  db.prepare(`
    INSERT INTO modules (id, document_id, name, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, documentId, name, description || '', (maxSort.max || 0) + 1);

  const version = getNextVersion(documentId);
  saveVersion(documentId, req.user!.id, `新增模块「${name}」`);
  await addChangelog(documentId, req.user!.id, version, [`新增模块「${name}」`]);

  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(id);
  res.json(mod);
});

router.put('/modules/:id', authMiddleware, async (req: AuthRequest, res) => {
  const docId = getDocIdOfModule(req.params.id);
  if (!docId) return res.status(404).json({ error: '模块不存在' });
  if (!checkDocumentAccess(docId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldMod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id) as any;
  const { name, description, sort_order } = req.body;
  db.prepare(`
    UPDATE modules SET name = ?, description = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(name, description, sort_order, req.params.id);

  const changes: string[] = [];
  if (oldMod.name !== name) changes.push(`模块「${oldMod.name}」重命名为「${name}」`);
  if (oldMod.description !== description) changes.push(`更新模块「${name}」描述`);
  if (changes.length > 0) {
    const version = getNextVersion(docId);
    addChangelog(docId, req.user!.id, version, changes);
    saveVersion(docId, req.user!.id, changes.join('；'));
  }

  const updated = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/modules/:id', authMiddleware, async (req: AuthRequest, res) => {
  const docId = getDocIdOfModule(req.params.id);
  if (!docId) return res.status(404).json({ error: '模块不存在' });
  if (!checkDocumentAccess(docId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldMod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id) as any;
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);

  const version = getNextVersion(docId);
  addChangelog(docId, req.user!.id, version, [`删除模块「${oldMod.name}」`]);
  saveVersion(docId, req.user!.id, `删除模块「${oldMod.name}」`);

  res.json({ success: true });
});

export default router;
