import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authMiddleware, optionalAuth, checkDocumentAccess, AuthRequest } from '../auth';
import { serializeEndpointList } from '../utils';
import { sendMail, buildChangelogEmail, buildNotificationEmail } from '../mail';

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

function parseContentField(val: any): any {
  if (!val) return { modules: [], endpoints: [] };
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return { modules: [], endpoints: [] }; }
  }
  return val;
}

function getDocumentSnapshot(documentId: string): any {
  const modules = db.prepare('SELECT * FROM modules WHERE document_id = ? ORDER BY sort_order, id').all(documentId);
  const endpoints = serializeEndpointList(
    db.prepare('SELECT * FROM endpoints WHERE document_id = ?').all(documentId)
  );
  return { modules, endpoints };
}

export function saveVersion(documentId: string, userId: string, changeSummary: string = '') {
  const content = getDocumentSnapshot(documentId);
  const maxRow = db.prepare('SELECT MAX(version) as v FROM document_versions WHERE document_id = ?').get(documentId);
  const id = uuid();
  const version = (maxRow?.v ?? 0) + 1;
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, content, change_summary, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, documentId, version, JSON.stringify(content), changeSummary, userId);
  return { id, version };
}

export async function addChangelog(documentId: string, userId: string, versionStr: string, changes: string[]) {
  const id = uuid();
  db.prepare(`
    INSERT INTO changelogs (id, document_id, version, changes) VALUES (?, ?, ?, ?)
  `).run(id, documentId, versionStr, JSON.stringify(changes));
  await notifySubscribers(documentId, versionStr, changes);
  return { id };
}

export async function notifySubscribers(documentId: string, version: string, changes: string[] | string) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
  if (!doc) return;
  const subs = db.prepare(`
    SELECT s.* FROM subscriptions s
    INNER JOIN documents d ON s.document_id = d.id
    WHERE s.document_id = ?
  `).all(documentId) as any[];
  if (!subs || subs.length === 0) return;

  const now = Date.now();
  const { subject, html, text } = buildChangelogEmail(doc, version, changes);
  for (const s of subs) {
    const freq = s.notify_frequency || 'instant';
    if (freq === 'none') continue;
    if (freq === 'daily' || freq === 'weekly') {
      if (!s.last_sent_at || (now - new Date(s.last_sent_at).getTime()) > (freq === 'daily' ? 24 : 24 * 7) * 3600 * 1000) {
        await sendMail(s.email, subject, html, text);
        db.prepare('UPDATE subscriptions SET last_sent_at = ? WHERE id = ?').run(new Date().toISOString(), s.id);
      } else {
        console.log(`[频率限制] 跳过 ${s.email} (${freq})`);
      }
    } else {
      await sendMail(s.email, subject, html, text);
      db.prepare('UPDATE subscriptions SET last_sent_at = ? WHERE id = ?').run(new Date().toISOString(), s.id);
    }
  }
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
    id: v.id,
    version: v.version,
    change_summary: v.change_summary,
    created_at: v.created_at,
    created_by: v.created_by,
    user: { name: v.user_name, id: v.created_by },
  }));
  res.json(versions);
});

router.get('/:documentId/versions/:version', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const versionParam = req.params.version;
  let row: any;
  if (/^\d+$/.test(versionParam)) {
    row = db.prepare('SELECT * FROM document_versions WHERE document_id = ? AND version = ?')
      .get(req.params.documentId, parseInt(versionParam));
  } else {
    row = db.prepare('SELECT * FROM document_versions WHERE id = ?').get(versionParam);
  }
  if (!row) return res.status(404).json({ error: '版本不存在' });
  const content = parseContentField(row.content);
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.created_by);
  res.json({
    id: row.id,
    version: row.version,
    change_summary: row.change_summary,
    created_at: row.created_at,
    created_by: row.created_by,
    user,
    content,
  });
});

router.get('/:documentId/diff', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id)) {
    return res.status(403).json({ error: '无权限访问' });
  }
  const { from, to } = req.query as { from?: string; to?: string };
  const docId = req.params.documentId;

  let fromVersion: any, toVersion: any;
  if (!from && !to) {
    const all = db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 2').all(docId);
    if (all.length === 0) return res.json({ diff: { addedModules: [], removedModules: [], changedModules: [], addedEndpoints: [], removedEndpoints: [], changedEndpoints: [] }, from: null, to: null });
    if (all.length === 1) {
      toVersion = all[0];
      fromVersion = null;
    } else {
      toVersion = all[0];
      fromVersion = all[1];
    }
  } else {
    if (to) {
      toVersion = /^\d+$/.test(to)
        ? db.prepare('SELECT * FROM document_versions WHERE document_id = ? AND version = ?').get(docId, parseInt(to))
        : db.prepare('SELECT * FROM document_versions WHERE id = ?').get(to);
    } else {
      toVersion = db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 1').get(docId);
    }
    if (from) {
      fromVersion = /^\d+$/.test(from)
        ? db.prepare('SELECT * FROM document_versions WHERE document_id = ? AND version = ?').get(docId, parseInt(from))
        : db.prepare('SELECT * FROM document_versions WHERE id = ?').get(from);
    } else {
      fromVersion = null;
    }
  }
  if (!toVersion) return res.status(404).json({ error: '目标版本不存在' });

  const fromContent = fromVersion ? parseContentField(fromVersion.content) : { modules: [], endpoints: [] };
  const toContent = parseContentField(toVersion.content);

  const fromModMap = new Map(fromContent.modules.map((m: any) => [m.id, m]));
  const toModMap = new Map(toContent.modules.map((m: any) => [m.id, m]));
  const fromEpMap = new Map(fromContent.endpoints.map((e: any) => [e.id, e]));
  const toEpMap = new Map(toContent.endpoints.map((e: any) => [e.id, e]));

  const addedModules: any[] = [];
  const removedModules: any[] = [];
  const changedModules: any[] = [];
  for (const m of toContent.modules) {
    if (!fromModMap.has(m.id)) addedModules.push({ id: m.id, title: m.title });
    else {
      const prev = fromModMap.get(m.id) as any;
      const changes: string[] = [];
      if (prev.title !== m.title) changes.push(`标题: "${prev.title}" → "${m.title}"`);
      if (prev.description !== m.description) changes.push('描述已更新');
      if (changes.length > 0) changedModules.push({ id: m.id, title: m.title, changes });
    }
  }
  for (const m of fromContent.modules) {
    if (!toModMap.has(m.id)) removedModules.push({ id: m.id, title: m.title });
  }

  const addedEndpoints: any[] = [];
  const removedEndpoints: any[] = [];
  const changedEndpoints: any[] = [];
  for (const e of toContent.endpoints) {
    if (!fromEpMap.has(e.id)) {
      addedEndpoints.push({ id: e.id, method: e.method, path: e.path, title: e.title });
    } else {
      const prev = fromEpMap.get(e.id) as any;
      const changes: string[] = [];
      if (prev.title !== e.title) changes.push(`标题: "${prev.title}" → "${e.title}"`);
      if (prev.method !== e.method) changes.push(`方法: ${prev.method} → ${e.method}`);
      if (prev.path !== e.path) changes.push(`路径: ${prev.path} → ${e.path}`);
      if (JSON.stringify(prev.parameters || []) !== JSON.stringify(e.parameters || [])) changes.push('参数定义已更新');
      if (JSON.stringify(prev.response_schema || {}) !== JSON.stringify(e.response_schema || {})) changes.push('响应结构已更新');
      if (changes.length > 0) changedEndpoints.push({ id: e.id, method: e.method, path: e.path, title: e.title, changes });
    }
  }
  for (const e of fromContent.endpoints) {
    if (!toEpMap.has(e.id)) removedEndpoints.push({ id: e.id, method: e.method, path: e.path, title: e.title });
  }

  res.json({
    from: fromVersion ? { id: fromVersion.id, version: fromVersion.version, created_at: fromVersion.created_at } : null,
    to: { id: toVersion.id, version: toVersion.version, created_at: toVersion.created_at },
    diff: {
      addedModules, removedModules, changedModules,
      addedEndpoints, removedEndpoints, changedEndpoints,
    },
  });
});

router.post('/:documentId/versions', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { change_summary } = req.body;
  const result = saveVersion(req.params.documentId, req.user!.id, change_summary || '手动保存版本');
  res.json(result);
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

router.post('/:documentId/changelogs', authMiddleware, async (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限编辑' });
  }
  const { version, changes } = req.body;
  let versionStr = version;
  if (!versionStr) {
    const v = saveVersion(req.params.documentId, req.user!.id, Array.isArray(changes) ? changes.join(', ') : String(changes));
    versionStr = String(v.version);
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO changelogs (id, document_id, version, changes) VALUES (?, ?, ?, ?)
  `).run(id, req.params.documentId, versionStr, JSON.stringify(changes));
  await notifySubscribers(req.params.documentId, versionStr, changes);
  res.json({ id, version: versionStr, changes });
});

router.get('/:documentId/subscriptions', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限管理' });
  }
  const subs = db.prepare('SELECT * FROM subscriptions WHERE document_id = ? ORDER BY created_at DESC')
    .all(req.params.documentId)
    .map((s: any) => ({
      id: s.id,
      email: s.email,
      notify_frequency: s.notify_frequency || 'instant',
      last_sent_at: s.last_sent_at,
      created_at: s.created_at,
    }));
  res.json(subs);
});

router.post('/:documentId/subscribe', (req, res) => {
  const { email, notify_frequency } = req.body;
  if (!email) return res.status(400).json({ error: '邮箱必填' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  try {
    const existing = db.prepare('SELECT id FROM subscriptions WHERE document_id = ? AND email = ?')
      .get(req.params.documentId, email);
    const freq = notify_frequency || 'instant';
    if (existing) {
      db.prepare('UPDATE subscriptions SET notify_frequency = ? WHERE id = ?').run(freq, existing.id);
      return res.json({ success: true, message: '已更新订阅设置' });
    }
    const id = uuid();
    db.prepare('INSERT INTO subscriptions (id, document_id, email, notify_frequency) VALUES (?, ?, ?, ?)')
      .run(id, req.params.documentId, email, freq);
    res.json({ success: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:documentId/subscriptions/:id', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限管理' });
  }
  db.prepare('DELETE FROM subscriptions WHERE id = ? AND document_id = ?').run(req.params.id, req.params.documentId);
  res.json({ success: true });
});

router.patch('/:documentId/subscriptions/:id', authMiddleware, (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限管理' });
  }
  const { notify_frequency } = req.body;
  db.prepare('UPDATE subscriptions SET notify_frequency = ? WHERE id = ? AND document_id = ?')
    .run(notify_frequency || 'instant', req.params.id, req.params.documentId);
  res.json({ success: true });
});

router.post('/:documentId/subscriptions/:id/test', authMiddleware, async (req: AuthRequest, res) => {
  if (!checkDocumentAccess(req.params.documentId, req.user!.id, true)) {
    return res.status(403).json({ error: '无权限管理' });
  }
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND document_id = ?')
    .get(req.params.id, req.params.documentId) as any;
  if (!sub) return res.status(404).json({ error: '订阅不存在' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  const { subject, html, text } = buildNotificationEmail(doc, '测试', ['这是一封测试通知邮件，确认您可以正常接收文档更新通知。']);
  const ok = await sendMail(sub.email, subject, html, text);
  res.json({ success: ok });
});

router.get('/:documentId/collaborators', authMiddleware, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT created_by FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.created_by !== req.user?.id) {
    return res.status(403).json({ error: '只有创建者可以管理协作者' });
  }
  const members = db.prepare(`
    SELECT dm.*, u.name as user_name, u.email as user_email
    FROM document_members dm
    INNER JOIN users u ON dm.user_id = u.id
    WHERE dm.document_id = ?
    ORDER BY dm.created_at ASC
  `).all(req.params.documentId);
  res.json(members.map((m: any) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    user: { id: m.user_id, name: m.user_name, email: m.user_email },
    created_at: m.created_at,
  })));
});

router.post('/:documentId/collaborators', authMiddleware, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT created_by FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.created_by !== req.user?.id) {
    return res.status(403).json({ error: '只有创建者可以邀请协作者' });
  }
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: '邮箱必填' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user) return res.status(404).json({ error: '用户不存在，请先注册' });
  if (user.id === doc.created_by) return res.status(400).json({ error: '文档创建者默认为所有者' });
  const existing = db.prepare('SELECT id FROM document_members WHERE document_id = ? AND user_id = ?')
    .get(req.params.documentId, user.id);
  if (existing) {
    db.prepare('UPDATE document_members SET role = ? WHERE id = ?').run(role || 'viewer', existing.id);
    return res.json({ success: true, id: existing.id, user: { id: user.id, name: user.name, email: user.email }, role: role || 'viewer' });
  }
  const id = uuid();
  db.prepare('INSERT INTO document_members (id, document_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(id, req.params.documentId, user.id, role || 'viewer');
  res.json({ success: true, id, user: { id: user.id, name: user.name, email: user.email }, role: role || 'viewer' });
});

router.patch('/:documentId/collaborators/:id', authMiddleware, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT created_by FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.created_by !== req.user?.id) {
    return res.status(403).json({ error: '只有创建者可以管理协作者' });
  }
  const { role } = req.body;
  db.prepare('UPDATE document_members SET role = ? WHERE id = ? AND document_id = ?')
    .run(role || 'viewer', req.params.id, req.params.documentId);
  res.json({ success: true });
});

router.delete('/:documentId/collaborators/:id', authMiddleware, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT created_by FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  if (doc.created_by !== req.user?.id) {
    return res.status(403).json({ error: '只有创建者可以移除协作者' });
  }
  db.prepare('DELETE FROM document_members WHERE id = ? AND document_id = ?').run(req.params.id, req.params.documentId);
  res.json({ success: true });
});

router.get('/:documentId/permissions', authMiddleware, (req: AuthRequest, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.documentId) as any;
  if (!doc) return res.status(404).json({ error: '文档不存在' });
  const userId = req.user?.id;
  const canView = checkDocumentAccess(req.params.documentId, userId);
  const canEdit = checkDocumentAccess(req.params.documentId, userId, true);
  const isOwner = doc.created_by === userId;
  res.json({ canView, canEdit, isOwner, visibility: doc.visibility });
});

export default router;
