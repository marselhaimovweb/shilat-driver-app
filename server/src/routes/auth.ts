import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { query, queryOne } from '../db';
import { badRequest, HttpError, parse, signToken } from '../http';
import { getFeatures, getSettings } from '../services/settings';
import { sendSms } from '../services/sms';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

/** Normalizes Israeli mobile numbers to 05XXXXXXXX. */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (!/^05\d{8}$/.test(digits)) throw badRequest('מספר טלפון נייד לא תקין');
  return digits;
}

const phoneSchema = z.object({ phone: z.string().min(9).max(20) });

authRouter.post('/otp/request', limiter, async (req, res) => {
  const phone = normalizePhone(parse(phoneSchema, req.body).phone);
  const features = await getFeatures();
  if (!features.NEW_REGISTRATIONS) {
    const exists = await queryOne('SELECT 1 AS x FROM dbo.Customers WHERE Phone = @phone', { phone });
    if (!exists) throw new HttpError(403, 'ההרשמה ללקוחות חדשים סגורה כרגע', 'REGISTRATION_CLOSED');
  }

  const recent = await queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM dbo.OtpCodes WHERE Phone = @phone AND CreatedAt > DATEADD(minute, -10, GETDATE())',
    { phone },
  );
  if ((recent?.n ?? 0) >= 5) throw new HttpError(429, 'יותר מדי ניסיונות, נסו שוב בעוד מספר דקות');

  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  await query(
    `INSERT INTO dbo.OtpCodes (Phone, CodeHash, ExpiresAt) VALUES (@phone, @hash, DATEADD(minute, 5, GETDATE()))`,
    { phone, hash: await bcrypt.hash(code, 8) },
  );
  const { businessName } = await getSettings();
  await sendSms(phone, `${businessName}: קוד האימות שלך הוא ${code}`);
  res.json({ ok: true, ...(config.otpDevMode ? { devCode: code } : {}) });
});

const verifySchema = z.object({
  phone: z.string(),
  code: z.string().regex(/^\d{4}$/),
  fullName: z.string().trim().min(2).max(100).optional(),
});

authRouter.post('/otp/verify', limiter, async (req, res) => {
  const body = parse(verifySchema, req.body);
  const phone = normalizePhone(body.phone);
  const otp = await queryOne<{ OtpId: number; CodeHash: string; Attempts: number }>(
    `SELECT TOP 1 OtpId, CodeHash, Attempts FROM dbo.OtpCodes
     WHERE Phone = @phone AND UsedAt IS NULL AND ExpiresAt > GETDATE()
     ORDER BY OtpId DESC`,
    { phone },
  );
  if (!otp || otp.Attempts >= 5) throw badRequest('הקוד פג תוקף, בקשו קוד חדש', 'OTP_EXPIRED');
  if (!(await bcrypt.compare(body.code, otp.CodeHash))) {
    await query('UPDATE dbo.OtpCodes SET Attempts = Attempts + 1 WHERE OtpId = @id', { id: otp.OtpId });
    throw badRequest('קוד שגוי', 'OTP_INVALID');
  }
  await query('UPDATE dbo.OtpCodes SET UsedAt = GETDATE() WHERE OtpId = @id', { id: otp.OtpId });

  let customer = await queryOne<{ id: number; fullName: string | null; isBlocked: boolean; role?: string }>(
    'SELECT CustomerId AS id, FullName AS fullName, IsBlocked AS isBlocked, Role AS role FROM dbo.Customers WHERE Phone = @phone',
    { phone },
  );
  const isNew = !customer;
  if (!customer) {
    customer = await queryOne(
      `INSERT INTO dbo.Customers (Phone, FullName) VALUES (@phone, @fullName);
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS id, @fullName AS fullName, CAST(0 AS BIT) AS isBlocked, 'CUSTOMER' AS role;`,
      { phone, fullName: body.fullName ?? null },
    );
  } else if (body.fullName && !customer.fullName) {
    await query('UPDATE dbo.Customers SET FullName = @fullName WHERE CustomerId = @id', { id: customer.id, fullName: body.fullName });
    customer.fullName = body.fullName;
  }
  await query('UPDATE dbo.Customers SET LastLoginAt = GETDATE() WHERE CustomerId = @id', { id: customer!.id });

  res.json({
    token: signToken({ sub: customer!.id, role: 'customer' }),
    isNew,
    customer: { id: customer!.id, phone, fullName: customer!.fullName, role: customer!.role ?? 'CUSTOMER' },
  });
});

const adminSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

authRouter.post('/admin/login', limiter, async (req, res) => {
  const body = parse(adminSchema, req.body);
  const admin = await queryOne<{ AdminId: number; PasswordHash: string; FullName: string; Role: 'OWNER' | 'MANAGER' | 'STAFF' }>(
    'SELECT AdminId, PasswordHash, FullName, Role FROM dbo.AdminUsers WHERE Username = @username AND IsActive = 1',
    { username: body.username },
  );
  if (!admin || !(await bcrypt.compare(body.password, admin.PasswordHash))) {
    throw new HttpError(401, 'שם משתמש או סיסמה שגויים', 'BAD_CREDENTIALS');
  }
  await query('UPDATE dbo.AdminUsers SET LastLoginAt = GETDATE() WHERE AdminId = @id', { id: admin.AdminId });
  res.json({
    token: signToken({ sub: admin.AdminId, role: 'admin', adminRole: admin.Role, name: admin.FullName }),
    admin: { id: admin.AdminId, fullName: admin.FullName, role: admin.Role },
  });
});

/** Creates the first owner account from the environment when the table is empty. */
export async function ensureFirstAdmin() {
  const any = await queryOne('SELECT TOP 1 AdminId FROM dbo.AdminUsers');
  if (any) return;
  await query(
    `INSERT INTO dbo.AdminUsers (Username, PasswordHash, FullName, Role) VALUES (@username, @hash, @fullName, 'OWNER')`,
    { username: config.admin.username, hash: await bcrypt.hash(config.admin.password, 10), fullName: config.admin.fullName },
  );
  console.log(`[setup] created admin user "${config.admin.username}" - change the password after first login`);
}
