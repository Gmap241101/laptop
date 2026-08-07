import pg from 'pg';
import { readServerConfig, shouldUseDatabaseSsl } from '../config/env.mjs';

const { Pool } = pg;
let sharedPool;

const createPool = () => {
  const config = readServerConfig();
  const useSsl = shouldUseDatabaseSsl(config.databaseUrl, config.databaseSslMode);

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: config.dbPoolMax,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs,
    idleTimeoutMillis: config.dbIdleTimeoutMs,
    application_name: `${config.serviceName}-${config.appEnv}`,
  });

  pool.on('error', (error) => {
    console.error('[database] unexpected idle-client error', {
      name: error?.name,
      code: error?.code,
    });
  });

  return pool;
};

export const getPool = () => {
  if (!sharedPool) sharedPool = createPool();
  return sharedPool;
};

export const checkDatabase = async () => {
  const startedAt = Date.now();
  const result = await getPool().query(
    'SELECT current_database() AS database_name, NOW() AS database_time',
  );

  return {
    latencyMs: Date.now() - startedAt,
    databaseTime: result.rows[0]?.database_time ?? null,
  };
};

export const closePool = async () => {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
};
