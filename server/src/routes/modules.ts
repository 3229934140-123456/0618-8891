import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

router.post('/:documentId/modules', authMiddleware, (req: AuthRequest, res) => {
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
  `).run(id, documentId, name, description || '', maxSort.max + 1);
  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(id);
  res.json(mod);
});

router.put('/modules/:id', authMiddleware, (req: AuthRequest, res) => {
  const mod = db.prepare('SELECT document_id FROM modules WHERE id = ?').get(req.params.id) as any;
  if (!mod) return res.status(404).json({ error: '模块不存在' });
  if (!checkDocumentAccess(mod.document_id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { name, description, sort_order } = req.body;
  db.prepare(`
    UPDATE modules SET name = ?, description = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(name, description, sort_order, req.params.id);
  const updated = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/modules/:id', authMiddleware, (req: AuthRequest, res) => {
  const mod = db.prepare('SELECT document_id FROM modules WHERE id = ?').get(req.params.id) as any;
  if (!mod) return res.status(404).json({ error: '模块不存在' });
  if (!checkDocumentAccess(mod.document_id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
