import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

router.get('/:documentId/versions', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const versions = db.prepare(`
    SELECT v.*, u.name as user_name
    FROM document_versions v
    INNER JOIN users u ON v.created_by = u.id
    WHERE v.document_id = ?
    ORDER BY v.version DESC
  `).all(req.params.documentId).map((v: any) => ({
    ...v,
    user: { name: v.user_name }
  }));
  res.json(versions);
});

router.post('/:documentId/versions', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { content, change_summary } = req.body;
  const maxVer = db.prepare('SELECT COALESCE(MAX(version), 0) as max FROM document_versions WHERE document_id = ?')
    .get(req.params.documentId) as any;
  const id = uuid();
  const version = maxVer.max + 1;
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, content, change_summary, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.documentId, version, JSON.stringify(content), change_summary || '', req.user!.id);
  res.json({ id, version });
});

router.get('/:documentId/changelogs', (req, res) => {
  const doc = db.prepare('SELECT visibility FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  const logs = db.prepare('SELECT * FROM changelogs WHERE document_id = ? ORDER BY created_at DESC')
    .all(req.params.documentId);
  res.json(logs);
});

router.post('/:documentId/changelogs', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { version, changes } = req.body;
  const id = uuid();
  db.prepare(`
    INSERT INTO changelogs (id, document_id, version, changes) VALUES (?, ?, ?, ?)
  `).run(id, req.params.documentId, version, JSON.stringify(changes));
  res.json({ id, version, changes });
});

router.post('/:documentId/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '邮箱必填' });
  try {
    const id = uuid();
    db.prepare('INSERT INTO subscriptions (id, document_id, email) VALUES (?, ?, ?)')
      .run(id, req.params.documentId, email);
    res.json({ success: true });
  } catch {
    res.json({ success: true, message: '已订阅' });
  }
});

export default router;
