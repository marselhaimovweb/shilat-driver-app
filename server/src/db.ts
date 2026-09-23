import sql from 'mssql';
import { config } from './config';

/*
 * SQL Server 2008 connection notes:
 * - tdsVersion must match the server (7_3_A for 2008, 7_3_B for 2008 R2).
 * - SQL Server 2008 without TLS 1.2 patches only supports TLS 1.0, which modern
 *   Node/OpenSSL refuses by default. We allow it explicitly for the login handshake.
 */
const poolConfig: sql.config = {
  server: config.db.server,
  port: config.db.instanceName ? undefined : config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: {
    instanceName: config.db.instanceName,
    encrypt: config.db.encrypt,
    trustServerCertificate: config.db.trustServerCertificate,
    tdsVersion: config.db.tdsVersion,
    enableArithAbort: true,
    useUTC: false,
    cryptoCredentialsDetails: { minVersion: 'TLSv1', ciphers: 'DEFAULT@SECLEVEL=0' },
  },
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(poolConfig).connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

export type Params = Record<string, unknown>;

/** Binds parameters with explicit SQL types so nothing is left to driver guessing. */
function bind(request: sql.Request, params: Params) {
  for (const [name, value] of Object.entries(params)) {
    // nulls get a wide type: ISNULL(@x, Column) takes the type of @x, and a 1-char default would overflow
    if (value === null || value === undefined) request.input(name, sql.NVarChar(4000), null);
    else if (typeof value === 'boolean') request.input(name, sql.Bit, value);
    else if (typeof value === 'number')
      request.input(name, Number.isInteger(value) ? sql.Int : sql.Decimal(10, 2), value);
    else if (value instanceof Date) request.input(name, sql.DateTime, value);
    else if (Buffer.isBuffer(value)) request.input(name, sql.VarBinary(sql.MAX), value);
    else request.input(name, sql.NVarChar(sql.MAX), String(value));
  }
  return request;
}

type Runner = sql.ConnectionPool | sql.Transaction;

export async function query<T = Record<string, unknown>>(
  text: string,
  params: Params = {},
  runner?: Runner,
): Promise<T[]> {
  const target = runner ?? (await getPool());
  const result = await bind(new sql.Request(target as sql.ConnectionPool), params).query(text);
  return result.recordset as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: Params = {},
  runner?: Runner,
): Promise<T | undefined> {
  const rows = await query<T>(text, params, runner);
  return rows[0];
}

/** Runs several recordsets in one round trip (multiple SELECT statements). */
export async function queryMulti(text: string, params: Params = {}): Promise<Record<string, unknown>[][]> {
  const result = await bind(new sql.Request(await getPool()), params).query(text);
  return result.recordsets as Record<string, unknown>[][];
}

export async function transaction<T>(
  fn: (tx: sql.Transaction) => Promise<T>,
  isolation: sql.IIsolationLevel = sql.ISOLATION_LEVEL.READ_COMMITTED,
): Promise<T> {
  const tx = new sql.Transaction(await getPool());
  await tx.begin(isolation);
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* already rolled back by the server */
    }
    throw err;
  }
}

export { sql };
