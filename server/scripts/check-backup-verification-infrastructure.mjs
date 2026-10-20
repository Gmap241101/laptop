/** Read-only infrastructure preflight. Never provisions or resets anything. */
import { spawn } from 'node:child_process';
import pg from 'pg';
import { getWebBackupConfiguration } from '../src/settings/backup-verification-runtime.mjs';

const cfg = getWebBackupConfiguration();
const checks = [];
const record = (name,passed,details) => checks.push({name,status:passed?'PASS':'FAIL',detail:details||undefined});
record('configuration',cfg.ready);
if (!cfg.ready) {
  console.log(JSON.stringify({overall:'BLOCKED',checks},null,2));
  process.exitCode=2;
} else {
  const version = (command) => new Promise(resolve=>{
    const p = spawn(command,['--version'],{stdio:['ignore','pipe','ignore']});
    let output='';p.stdout.on('data',b=> {output+=b.toString();});
    p.once('error',()=>resolve(null));p.once('close',code=>resolve(code===0?output.trim().slice(0,90):null));
  });
  for(const [name,cmd] of [['pg_dump',process.env.PG_DUMP_BIN||'pg_dump'],['pg_restore',process.env.PG_RESTORE_BIN||'pg_restore']]) {
    const v=await version(cmd); record(name,Boolean(v),v||'not installed');
  }
  const connectionString=cfg.target;
  const client = new pg.Client({connectionString,ssl:new URL(connectionString).searchParams.get('sslmode')==='disable'?false:{rejectUnauthorized:false}});
  try {
    await client.connect();
    const row=(await client.query('SELECT marker_id,environment,resource_id FROM backup_guard.disposable_target')).rows;
    record('target marker',row.length===1 && row[0].marker_id===cfg.expectedTarget &&
      row[0].environment===cfg.environment && row[0].resource_id===cfg.targetResourceId);
  } catch { record('target marker',false,'unreachable or marker missing'); }
  finally { await client.end().catch(()=>{}); }
  const allPass=checks.every(c=>c.status==='PASS');
  console.log(JSON.stringify({overall:allPass?'READY':'BLOCKED',checks},null,2));
  if (!allPass) process.exitCode=2;
}
