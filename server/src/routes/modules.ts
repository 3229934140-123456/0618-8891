import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, checkDocumentAccess, AuthRequest } from '../auth';

const router = Router();

function getDocIdOfModule(moduleId: string): string | null {
  const m = db.prepare('SELECT document_id FROM modules WHERE id = ?').get(moduleId) as any;
  return m?.document_id || null;
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
  `).run(id, documentId, name, description || '', (maxSort.max || 0) + 1);

  addChangelog(documentId, [`新增模块「${name}」`]);
  saveVersion(documentId, req.user!.id, `新增模块「${name}」`);

  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(id);
  res.json(mod);
});

router.put('/modules/:id', authMiddleware, (req: AuthRequest, res) => {
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
    addChangelog(docId, changes);
    saveVersion(docId, req.user!.id, changes.join('；'));
  }

  const updated = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/modules/:id', authMiddleware, (req: AuthRequest, res) => {
  const docId = getDocIdOfModule(req.params.id);
  if (!docId) return res.status(404).json({ error: '模块不存在' });
  if (!checkDocumentAccess(docId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const oldMod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id) as any;
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);

  addChangelog(docId, [`删除模块「${oldMod.name}」`]);
  saveVersion(docId, req.user!.id, `删除模块「${oldMod.name}」`);

  res.json({ success: true });
});

export default router;
