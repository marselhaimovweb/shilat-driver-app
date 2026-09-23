import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodType } from 'zod';
import { config } from './config';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const notFound = (message = 'לא נמצא') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code?: string) => new HttpError(409, message, code);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export interface AuthUser {
  sub: number;
  role: 'customer' | 'admin';
  adminRole?: 'OWNER' | 'MANAGER' | 'STAFF';
  name?: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: user.role === 'admin' ? '12h' : '90d' });
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

function readUser(req: Request): AuthUser | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    return jwt.verify(header.slice(7), config.jwtSecret) as unknown as AuthUser;
  } catch {
    return undefined;
  }
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  const user = readUser(req);
  if (!user || user.role !== 'customer') return next(new HttpError(401, 'יש להתחבר מחדש', 'UNAUTHORIZED'));
  req.user = user;
  next();
}

export function requireAdmin(...roles: NonNullable<AuthUser['adminRole']>[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = readUser(req);
    if (!user || user.role !== 'admin') return next(new HttpError(401, 'יש להתחבר מחדש', 'UNAUTHORIZED'));
    if (roles.length && (!user.adminRole || !roles.includes(user.adminRole))) {
      return next(new HttpError(403, 'אין לך הרשאה לפעולה זו', 'FORBIDDEN'));
    }
    req.user = user;
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'נתונים לא תקינים', code: 'VALIDATION', details: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  res.status(500).json({ error: 'אירעה שגיאה בשרת, נסו שוב', code: 'SERVER_ERROR' });
}
