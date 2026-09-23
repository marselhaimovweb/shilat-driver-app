import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodType } from 'zod';
import { config } from './config';
import { queryOne } from './db';

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

/*
 * Two kinds of accounts:
 *  - customer accounts (phone + SMS code). Role: CUSTOMER / STAFF / MANAGER / OWNER.
 *    Staff roles open the management panel inside the same app.
 *  - panel accounts (username + password, dbo.AdminUsers) for the web panel.
 * The staff role is always re-read from the database, so a demotion takes effect immediately.
 */
export type StaffRole = 'OWNER' | 'MANAGER' | 'STAFF';
export type UserRole = 'CUSTOMER' | StaffRole;

export interface AuthUser {
  sub: number;
  role: 'customer' | 'admin';
  adminRole?: StaffRole;
  name?: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.sub, role: user.role }, config.jwtSecret, { expiresIn: user.role === 'admin' ? '12h' : '90d' });
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
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as unknown as AuthUser;
    return { sub: Number(payload.sub), role: payload.role };
  } catch {
    return undefined;
  }
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  const user = readUser(req);
  if (!user || user.role !== 'customer') return next(new HttpError(401, 'יש להתחבר מחדש', 'UNAUTHORIZED'));
  queryOne<{ DeletedAt: Date | null; IsBlocked: boolean }>('SELECT DeletedAt, IsBlocked FROM dbo.Customers WHERE CustomerId = @id', { id: user.sub })
    .then((row) => {
      if (!row || row.DeletedAt) return next(new HttpError(401, 'יש להתחבר מחדש', 'UNAUTHORIZED'));
      req.user = user;
      next();
    })
    .catch(next);
}

const RANK: Record<StaffRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };

/** Resolves the staff role of whoever holds the token (panel account or promoted customer). */
export async function resolveStaff(user: AuthUser): Promise<{ role: StaffRole; name: string } | null> {
  if (user.role === 'admin') {
    const a = await queryOne<{ Role: StaffRole; FullName: string; IsActive: boolean }>(
      'SELECT Role, FullName, IsActive FROM dbo.AdminUsers WHERE AdminId = @id',
      { id: user.sub },
    );
    return a && a.IsActive ? { role: a.Role, name: a.FullName } : null;
  }
  const c = await queryOne<{ Role: UserRole; FullName: string | null; DeletedAt: Date | null; IsBlocked: boolean }>(
    'SELECT Role, FullName, DeletedAt, IsBlocked FROM dbo.Customers WHERE CustomerId = @id',
    { id: user.sub },
  );
  if (!c || c.DeletedAt || c.IsBlocked || c.Role === 'CUSTOMER') return null;
  return { role: c.Role, name: c.FullName ?? 'צוות' };
}

/** Management access. With a minimum role, lower roles get 403. */
export function requireAdmin(minRole: StaffRole = 'STAFF') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = readUser(req);
    if (!user) return next(new HttpError(401, 'יש להתחבר מחדש', 'UNAUTHORIZED'));
    resolveStaff(user)
      .then((staff) => {
        if (!staff) return next(new HttpError(403, 'אין לך הרשאת ניהול', 'FORBIDDEN'));
        if (RANK[staff.role] < RANK[minRole]) return next(new HttpError(403, 'אין לך הרשאה לפעולה זו', 'FORBIDDEN'));
        req.user = { ...user, adminRole: staff.role, name: staff.name };
        next();
      })
      .catch(next);
  };
}

export function clientIp(req: Request): string {
  return (req.ip ?? '').replace('::ffff:', '').slice(0, 45);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'נתונים לא תקינים', code: 'VALIDATION', details: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    return res.status(413).json({ error: 'הקובץ גדול מדי', code: 'TOO_LARGE' });
  }
  console.error(err);
  res.status(500).json({ error: 'אירעה שגיאה בשרת, נסו שוב', code: 'SERVER_ERROR' });
}
