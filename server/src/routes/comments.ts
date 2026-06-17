import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, optionalAuth, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

router.get('/:documentId/comments', optionalAuth, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT visibility FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.visibility !== 'public' && !checkDocumentAccess(req.params.documentId, req.user?.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.email as user_email
    FROM comments c
    INNER JOIN users u ON c.created_by = u.id
    WHERE c.document_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.documentId).map((c: any) => ({
    ...c,
    user: { name: c.user_name, email: c.user_email }
  }));
  res.json(comments);
});

router.post('/:documentId/comments', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const { target_type, target_id, content } = req.body;
  const id = uuid();
  db.prepare(`
    INSERT INTO comments (id, document_id, target_type, target_id, content, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.documentId, target_type, target_id, content, req.user!.id);
  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.email as user_email
    FROM comments c INNER JOIN users u ON c.created_by = u.id WHERE c.id = ?
  `).get(id) as any;
  res.json({ ...comment, user: { name: comment.user_name, email: comment.user_email } });
});

router.delete('/comments/:id', authMiddleware, (req: AuthRequest, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id) as any;
  if (!comment) return res.status(404).json({ error: '评论不存在' });
  if (comment.created_by !== req.user!.id) {
    return res.status(403).json({ error: '只能删除自己的评论' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
