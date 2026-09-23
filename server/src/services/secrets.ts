import crypto from 'node:crypto';
import { config } from '../config';

/*
 * Payment-provider credentials are stored encrypted (AES-256-GCM) in the
 * Settings table so a database dump does not expose them.
 * Key: SETTINGS_ENCRYPTION_KEY, falling back to a hash of JWT_SECRET.
 */
const key = crypto.createHash('sha256').update(process.env.SETTINGS_ENCRYPTION_KEY || config.jwtSecret).digest();
const PREFIX = 'enc:v1:';

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** "abcd1234" -> "••••1234" for display in the admin panel. */
export const maskSecret = (plain: string) => (plain ? `••••${plain.slice(-4)}` : '');
