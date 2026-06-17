import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, optionalAuth, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const docs = db.prepare(`
    SELECT d.* FROM documents d
    LEFT JOIN document_members dm ON d.id = dm.document_id AND dm.user_id = ?
    WHERE d.created_by = ? OR dm.user_id = ? OR d.visibility = 'public'
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `).all(req.user!.id, req.user!.id, req.user!.id);
  res.json(docs);
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { title, description, base_url, visibility } = req.body;
  const id = uuid();
  db.prepare(`
    INSERT INTO documents (id, title, description, base_url, visibility, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title || '未命名文档', description || '', base_url || '', visibility || 'private', req.user!.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  res.json(doc);
});

router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.visibility !== 'public' && !checkDocumentAccess(req.params.id, req.user?.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const modules = db.prepare('SELECT * FROM modules WHERE document_id = ? ORDER BY sort_order, created_at')
    .all(req.params.id);
  const endpoints = db.prepare(`
    SELECT e.* FROM endpoints e
    INNER JOIN modules m ON e.module_id = m.id
    WHERE m.document_id = ?
    ORDER BY e.sort_order, e.created_at
  `).all(req.params.id);
  res.json({ ...doc, modules, endpoints });
});

router.put('/:id', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { title, description, base_url, visibility } = req.body;
  db.prepare(`
    UPDATE documents SET title = ?, description = ?, base_url = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, base_url, visibility, req.params.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json(doc);
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT created_by FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc || doc.created_by !== req.user!.id) {
    return res.status(403).json({ error: '无权限删除' });
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
