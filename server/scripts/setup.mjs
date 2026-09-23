/*
 * Windows installer helper (run by install.bat / build-apk.bat).
 *
 *   node scripts/setup.mjs db    -> asks for SQL Server details, creates the CarWash
 *                                   database + app login and writes server/.env
 *   node scripts/setup.mjs ip    -> prints this computer's LAN address
 *   node scripts/setup.mjs eas <url> -> writes the server address into mobile/eas.json
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(serverDir, '..');
const envPath = path.join(serverDir, '.env');

function lanIp() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) candidates.push(a.address);
    }
  }
  return candidates.find((a) => a.startsWith('192.168.')) ?? candidates[0] ?? 'localhost';
}

const secret = () => crypto.randomBytes(32).toString('hex');
// SQL Server password policy: upper + lower + digit + symbol
const dbPassword = () => `Cw_${crypto.randomBytes(12).toString('base64url')}9a!`;

// line iterator buffers input, so answers can also be piped in
let lines;
async function ask(rl, question, fallback = '') {
  lines ??= rl[Symbol.asyncIterator]();
  process.stdout.write(fallback ? `${question} [${fallback}]: ` : `${question}: `);
  const next = await lines.next();
  if (next.done) throw new Error('input ended');
  return next.value.trim() || fallback;
}

function splitBatches(script) {
  return script
    .replace(/^﻿/, '')
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
}

async function runFile(pool, file) {
  const batches = splitBatches(fs.readFileSync(path.join(rootDir, 'database', file), 'utf8'));
  for (const batch of batches) {
    // the pool has a single connection, so a USE batch carries over to the next batches
    await pool.request().batch(batch);
  }
  console.log(`  OK  ${file} (${batches.length} batches)`);
}

async function setupDb() {
  const rl = readline.createInterface({ input: process.stdin });
  if (fs.existsSync(envPath)) {
    const again = await ask(rl, 'server\\.env already exists. Re-run database setup and overwrite it? (y/n)', 'n');
    if (again.toLowerCase() !== 'y') {
      rl.close();
      console.log('Keeping the existing settings.');
      return;
    }
  }

  console.log('\n=== SQL Server connection ===');
  console.log('SQL Server must allow "SQL Server and Windows Authentication" (mixed mode) and TCP/IP.');
  const server = await ask(rl, 'SQL Server computer name', 'localhost');
  const instance = await ask(rl, 'Instance name (e.g. SQLEXPRESS; type - for the default instance)', 'SQLEXPRESS');
  const instanceName = instance === '-' ? '' : instance;
  const port = instanceName ? '' : await ask(rl, 'TCP port', '1433');
  const version = await ask(rl, 'SQL Server version: 1 = 2008, 2 = 2008 R2, 3 = 2012 or newer', '1');
  const tdsVersion = { 1: '7_3_A', 2: '7_3_B', 3: '7_4' }[version] ?? '7_3_A';
  const adminUser = await ask(rl, 'SQL admin login (used once, to create the database)', 'sa');
  const adminPassword = await ask(rl, `Password for ${adminUser}`);

  console.log('\n=== App owner account (for the management panel) ===');
  const ownerUser = await ask(rl, 'Admin username', 'admin');
  let ownerPassword = '';
  while (ownerPassword.length < 8) ownerPassword = await ask(rl, 'Admin password (at least 8 characters)');
  const ownerName = await ask(rl, 'Admin full name', 'Owner');
  rl.close();

  const base = {
    server,
    user: adminUser,
    password: adminPassword,
    port: instanceName ? undefined : Number(port),
    options: {
      instanceName: instanceName || undefined,
      encrypt: false,
      trustServerCertificate: true,
      tdsVersion,
      enableArithAbort: true,
      cryptoCredentialsDetails: { minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=0' },
    },
    connectionTimeout: 20000,
    requestTimeout: 120000,
  };

  console.log('\nConnecting to SQL Server...');
  let pool;
  try {
    pool = await new sql.ConnectionPool({ ...base, database: 'master', pool: { max: 1, min: 0 } }).connect();
  } catch (err) {
    console.error(`\nCould not connect: ${err.message}`);
    console.error('Check: 1) SQL Server service is running  2) TCP/IP is enabled in "SQL Server Configuration Manager"');
    console.error('       3) "SQL Server Browser" service is running (for named instances)  4) mixed-mode login and the sa password');
    process.exit(1);
  }

  console.log('Creating / updating the CarWash database...');
  for (const file of ['01_schema.sql', '02_seed.sql', '03_v2.sql']) await runFile(pool, file);

  const appUser = 'carwash_app';
  const appPassword = dbPassword();
  const esc = (s) => s.replace(/'/g, "''");
  await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'${appUser}')
  CREATE LOGIN [${appUser}] WITH PASSWORD = N'${esc(appPassword)}', DEFAULT_DATABASE = [CarWash], CHECK_POLICY = OFF;
ELSE
  ALTER LOGIN [${appUser}] WITH PASSWORD = N'${esc(appPassword)}';`);
  await pool.request().batch(`
USE CarWash;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'${appUser}')
  CREATE USER [${appUser}] FOR LOGIN [${appUser}];
EXEC sp_addrolemember N'db_datareader', N'${appUser}';
EXEC sp_addrolemember N'db_datawriter', N'${appUser}';`);
  await pool.close();
  console.log(`  OK  login "${appUser}" (password generated and stored in server\\.env)`);

  const ip = lanIp();
  const env = `# generated by install.bat on ${new Date().toISOString()}
PORT=4000
CORS_ORIGINS=*
JWT_SECRET=${secret()}
WEB_DIR=../web
NODE_ENV=production

DB_SERVER=${server}
DB_PORT=${port || 1433}
DB_INSTANCE=${instanceName}
DB_NAME=CarWash
DB_USER=${appUser}
DB_PASSWORD=${appPassword}
DB_TDS_VERSION=${tdsVersion}
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true

ADMIN_USERNAME=${ownerUser}
ADMIN_PASSWORD=${ownerPassword}
ADMIN_FULLNAME=${ownerName}

# no SMS company yet: login codes are printed in the server window
SMS_PROVIDER=console
OTP_DEV_MODE=false

# public https address for the clearing company callbacks (set when going live)
PUBLIC_URL=http://${ip}:4000
# encrypts the clearing-company credentials - back this file up, do not lose it
SETTINGS_ENCRYPTION_KEY=${secret()}
`;
  fs.writeFileSync(envPath, env);
  console.log(`\nSaved settings to ${envPath}`);
}

function writeEas(url) {
  const easPath = path.join(rootDir, 'mobile', 'eas.json');
  const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
  eas.build.apk.env = { ...(eas.build.apk.env ?? {}), EXPO_PUBLIC_API_URL: url };
  fs.writeFileSync(easPath, JSON.stringify(eas, null, 2) + '\n');
  console.log(`APK will connect to ${url}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'db') await setupDb();
else if (cmd === 'ip') console.log(lanIp());
else if (cmd === 'eas' && arg) writeEas(arg.replace(/\/$/, ''));
else {
  console.log('usage: node scripts/setup.mjs db | ip | eas <url>');
  process.exit(1);
}
