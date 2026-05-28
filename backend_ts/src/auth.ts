import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-only-change-before-cloud';

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(sub: number) {
  return jwt.sign({ sub }, JWT_SECRET, { expiresIn: '12h' });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Try Authorization header first
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts[0].toLowerCase() === 'bearer' && parts[1]) {
      token = parts[1];
    }
  }
  // Fallback to HttpOnly cookie named 'jwt'
  if (!token && (req as any).cookies && (req as any).cookies.jwt) {
    token = (req as any).cookies.jwt;
  }
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    (req as any).user = { id: Number(payload.sub) };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function parseNotificationPrefs(value: unknown) {
  if (typeof value === 'string') return value;
  if (value == null) return '{}';
  return JSON.stringify(value);
}
