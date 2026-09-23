import 'dotenv/config';

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

const bool = (value: string) => value.toLowerCase() === 'true';

export const config = {
  port: Number(env('PORT', '4000')),
  corsOrigins: env('CORS_ORIGINS', '*').split(',').map((s) => s.trim()),
  jwtSecret: env('JWT_SECRET', 'dev-only-secret'),
  isProduction: process.env.NODE_ENV === 'production',
  timeZone: 'Asia/Jerusalem',

  db: {
    server: env('DB_SERVER', 'localhost'),
    port: Number(env('DB_PORT', '1433')),
    instanceName: process.env.DB_INSTANCE || undefined,
    database: env('DB_NAME', 'CarWash'),
    user: env('DB_USER', 'sa'),
    password: env('DB_PASSWORD', ''),
    tdsVersion: env('DB_TDS_VERSION', '7_3_A'),
    encrypt: bool(env('DB_ENCRYPT', 'false')),
    trustServerCertificate: bool(env('DB_TRUST_SERVER_CERT', 'true')),
  },

  admin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', 'ChangeMe123!'),
    fullName: env('ADMIN_FULLNAME', 'מנהל המערכת'),
  },

  smsProvider: env('SMS_PROVIDER', 'console'),
  otpDevMode: bool(env('OTP_DEV_MODE', 'false')),
  /** public https address of this API - used for payment webhooks and return pages */
  publicUrl: env('PUBLIC_URL', 'http://localhost:4000').replace(/\/$/, ''),
};

if (config.isProduction && config.jwtSecret === 'dev-only-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
if (config.isProduction && config.otpDevMode) {
  throw new Error('OTP_DEV_MODE must be false in production');
}
