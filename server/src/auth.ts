import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'api-doc-platform-secret-key-2024';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string };
}

export function generateToken(user: { id: string; email: string; name: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string };
      req.user = decoded;
    } catch {}
  }
  next();
}

export function checkDocumentAccess(documentId: string, userId: string | undefined, requireEdit: boolean = false): boolean {
  const doc = db.prepare('SELECT visibility, created_by FROM documents WHERE id = ?').get(documentId) as any;
  if (!doc) return false;
  if (doc.visibility === 'public') {
    return !requireEdit || doc.created_by === userId || isMemberEditor(documentId, userId);
  }
  if (!userId) return false;
  if (doc.visibility === 'internal') {
    if (!requireEdit) return true;
    if (doc.created_by === userId) return true;
    return isMemberEditor(documentId, userId);
  }
  if (doc.created_by === userId) return true;
  const member = db.prepare('SELECT role FROM document_members WHERE document_id = ? AND user_id = ?')
    .get(documentId, userId) as any;
  if (!member) return false;
  if (requireEdit && member.role === 'viewer') return false;
  return true;
}

function isMemberEditor(documentId: string, userId: string | undefined): boolean {
  if (!userId) return false;
  const member = db.prepare('SELECT role FROM document_members WHERE document_id = ? AND user_id = ?')
    .get(documentId, userId) as any;
  return !!member && member.role !== 'viewer';
}
