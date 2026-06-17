import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, optionalAuth, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

function parseChangesField(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return [val];
    }
  }
  return [val];
}

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
  const maxRow = db.prepare('SELECT version FROM document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 1')
    .get(req.params.documentId) as any;
  const id = uuid();
  const version = (maxRow?.version || 0) + 1;
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, content, change_summary, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.documentId, version, JSON.stringify(content), change_summary || '', req.user!.id);
  res.json({ id, version });
});

router.get('/:documentId/changelogs', optionalAuth, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT visibility FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.visibility !== 'public' && !req.user) {
    return res.status(403).json({ error: '请先登录' });
  }
  if (doc.visibility === 'private' && !checkDocumentAccess(req.params.documentId, req.user?.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const logs = db.prepare('SELECT * FROM changelogs WHERE document_id = ? ORDER BY created_at DESC')
    .all(req.params.documentId)
    .map((log: any) => ({
      ...log,
      changes: parseChangesField(log.changes),
    }));
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

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.documentId) as any;
  const subs = db.prepare('SELECT email FROM subscriptions WHERE document_id = ?').all(req.params.documentId) as any[];
  if (subs.length > 0 && doc) {
    const subject = `【文档更新】${doc.title} v${version}`;
    subs.forEach((s) => {
      console.log(`[邮件通知] To: ${s.email}, Subject: ${subject}`);
      console.log(`  变更内容: ${Array.isArray(changes) ? changes.join(', ') : changes}`);
    });
  }

  res.json({ id, version, changes });
});

router.post('/:documentId/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '邮箱必填' });
  try {
    const existing = db.prepare('SELECT id FROM subscriptions WHERE document_id = ? AND email = ?')
      .get(req.params.documentId, email);
    if (existing) {
      return res.json({ success: true, message: '已订阅' });
    }
    const id = uuid();
    db.prepare('INSERT INTO subscriptions (id, document_id, email) VALUES (?, ?, ?)')
      .run(id, req.params.documentId, email);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
