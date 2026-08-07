import { createServer } from 'node:http';
import { createRequestHandler } from './app.mjs';
import { readServerConfig } from './config/env.mjs';
import { checkDatabase, closePool } from './db/pool.mjs';

const config = readServerConfig();
const server = createServer(createRequestHandler({ config, checkDatabaseFn: checkDatabase }));
server.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] ${config.serviceName} listening on port ${config.port}`, {
    environment: config.appEnv,
    corsOrigins: config.corsAllowedOrigins,
    databaseConfigured: true,
  });
});
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}; shutting down`);
  const hardStop = setTimeout(() => { console.error('[server] graceful shutdown timeout exceeded'); process.exit(1); }, 10000);
  hardStop.unref();
  server.close(async (error) => {
    try { await closePool(); } finally {
      clearTimeout(hardStop);
      if (error) { console.error('[server] shutdown error', { name: error.name, code: error.code }); process.exit(1); }
      process.exit(0);
    }
  });
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
