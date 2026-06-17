import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, optionalAuth, checkDocumentAccess, AuthRequest } from '../auth';
import { serializeEndpointList } from '../utils';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const allDocs = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all() as any[];
  const visibleDocs = allDocs.filter((d) => {
    if (d.visibility === 'public' || d.visibility === 'internal') return true;
    if (d.created_by === req.user!.id) return true;
    const member = db.prepare('SELECT * FROM document_members WHERE document_id = ? AND user_id = ?')
      .get(d.id, req.user!.id);
    return !!member;
  });
  res.json(visibleDocs);
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { title, description, base_url, visibility } = req.body;
  const id = uuid();
  db.prepare(`
    INSERT INTO documents (id, title, description, base_url, visibility, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title || '未命名文档', description || '', base_url || '', visibility || 'private', req.user!.id);

  addChangelog(id, '1.0.0', ['创建文档']);

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  res.json(doc);
});

router.get('/:id', optionalAuth, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });

  const canView = (() => {
    if (doc.visibility === 'public') return true;
    if (!req.user) return false;
    if (doc.visibility === 'internal') return true;
    if (doc.created_by === req.user.id) return true;
    const member = db.prepare('SELECT * FROM document_members WHERE document_id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    return !!member;
  })();

  if (!canView) {
    return res.status(403).json({ error: '无权限访问' });
  }

  const modules = db.prepare('SELECT * FROM modules WHERE document_id = ? ORDER BY sort_order, created_at')
    .all(req.params.id);
  const endpointsRaw = db.prepare(`
    SELECT e.* FROM endpoints e
    INNER JOIN modules m ON e.module_id = m.id
    WHERE m.document_id = ?
    ORDER BY e.sort_order, e.created_at
  `).all(req.params.id);

  const endpoints = serializeEndpointList(endpointsRaw);
  res.json({ ...doc, modules, endpoints });
});

router.put('/:id', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.id, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  const { title, description, base_url, visibility } = req.body;
  db.prepare(`
    UPDATE documents SET title = ?, description = ?, base_url = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, base_url, visibility, req.params.id);

  const changes: string[] = [];
  if (oldDoc.title !== title) changes.push(`更新文档标题为「${title}」`);
  if (oldDoc.description !== description) changes.push('更新文档描述');
  if (oldDoc.base_url !== base_url) changes.push(`更新基础 URL 为 ${base_url}`);
  if (oldDoc.visibility !== visibility) changes.push(`可见性改为「${visibility}」`);

  if (changes.length > 0) {
    addChangelog(req.params.id, null, changes);
    saveVersion(req.params.id, req.user!.id, changes.join('；'));
  }

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

function saveVersion(docId: string, userId: string, summary: string) {
  try {
    const modules = db.prepare('SELECT * FROM modules WHERE document_id = ? ORDER BY sort_order').all(docId);
    const endpoints = db.prepare('SELECT * FROM endpoints WHERE module_id IN (SELECT id FROM modules WHERE document_id = ?)').all(docId);
    const maxVer = db.prepare('SELECT MAX(version) as max FROM document_versions WHERE document_id = ?').get(docId) as any;
    const version = (maxVer?.max || 0) + 1;
    const id = uuid();
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version, content, change_summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, docId, version, JSON.stringify({ modules, endpoints }), summary, userId);
  } catch (e) {
    console.error('save version error:', e);
  }
}

function addChangelog(docId: string, ver: string | null, changes: string[]) {
  try {
    const logs = db.prepare('SELECT * FROM changelogs WHERE document_id = ? ORDER BY created_at DESC').all(docId);
    let version: string;
    if (ver) {
      version = ver;
    } else if (logs.length > 0) {
      const lastVer = logs[0].version.split('.').map(Number);
      lastVer[2] = (lastVer[2] || 0) + 1;
      version = lastVer.join('.');
    } else {
      version = '1.0.0';
    }
    const id = uuid();
    db.prepare(`
      INSERT INTO changelogs (id, document_id, version, changes) VALUES (?, ?, ?, ?)
    `).run(id, docId, version, JSON.stringify(changes));

    notifySubscribers(docId, version, changes);
  } catch (e) {
    console.error('add changelog error:', e);
  }
}

function notifySubscribers(docId: string, version: string, changes: string[]) {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as any;
    const subs = db.prepare('SELECT email FROM subscriptions WHERE document_id = ?').all(docId) as any[];
    if (subs.length === 0 || !doc) return;

    const subject = `【文档更新】${doc.title} v${version}`;
    const text = `${doc.title} 有新的更新：\n\n${changes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n---\n订阅了此文档的更新通知。`;

    subs.forEach((s) => {
      console.log(`[邮件通知] To: ${s.email}, Subject: ${subject}`);
    });
  } catch (e) {
    console.error('notify error:', e);
  }
}

export { saveVersion, addChangelog };
export default router;
