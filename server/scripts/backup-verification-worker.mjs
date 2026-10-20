import { getPool, closePool } from '../src/db/pool.mjs';
import { createVerificationWorker } from '../src/settings/backup-verification-worker.mjs';

// Dedicated Heroku worker dyno; never invoked by a web request or release phase.
const pool = getPool();
const worker = createVerificationWorker(pool);
const heartbeat = async () => {
  await pool.query(`INSERT INTO app_runtime_metadata (key,value,updated_at)
    VALUES ($1,jsonb_build_object('environment',$2::text,'updatedAt',NOW()::text),NOW())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
    ['phase34_backup_verification_worker_heartbeat',process.env.APP_ENV]);
};
await heartbeat();
const pulse = setInterval(() => { void heartbeat().catch(() => {}); }, 8000);
let stop = false;
process.on('SIGTERM',()=> { stop=true; });
process.on('SIGINT',()=> { stop=true; });
try {
  while(!stop) {
    try { await worker.tick(); }
    catch(e) { console.error('[backup-verify] worker tick error',{code:e?.code||'failed'}); }
    if (!stop) await new Promise(resolve=>setTimeout(resolve,4000));
  }
} finally { clearInterval(pulse); await closePool(); }
