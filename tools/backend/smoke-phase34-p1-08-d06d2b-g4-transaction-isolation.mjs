// G4-LOCAL-SAFE offline tests only. No pg driver, DB, auth, or provider calls.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createG4WrappedPool,createG4SchemaName,validateLocalConnection,G4_CONFIRM} from './g4-local-pg-core.mjs';
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const same=(left,right,message)=>{assert.deepEqual(left,right,message);checks++;};
const blocked=async(fn,code)=>{
  let caught;try{await fn();}catch(error){caught=error;}
  check(Boolean(caught),`error expected ${code}`);
  if(code)check(String(caught?.message||'').includes(code),`expected ${code}`);
};
const schema=createG4SchemaName(Buffer.from('1337133713371337','hex'));
const local=`postgresql://testoperator:testpass@127.0.0.1:5432/rental_restore_20261020_112826`;
for(const path of [
  '?sslmode=require','?options=-c%20search_path%3Dpublic','?application_name=abc',
  '?host=/var/run/postgresql','?service=production','?hostaddr=10.1.1.1',
  '#remote-override','?host=another&port=5432','?target_session_attrs=read-write',
  '?connect_timeout=99']){
  let caught;try{validateLocalConnection(local+path);}catch(e){caught=e;}
  check(Boolean(caught),`ambiguous connection override blocked: ${path}`);
}
const valid=validateLocalConnection(local,{mode:'execute-local',confirm:G4_CONFIRM,requestedExecution:true});
same(valid.canConnect,true);same(valid.createsDatabase,false);same(valid.retainedProviders,['brevo','resend']);
const events=[];
function fakePool({failSet=false,failRollback=false}={}){
  let issued=0;
  return {async connect(){const id=++issued;events.push(`checkout:${id}`);
    return {async query(sql){const q=String(sql);events.push(`${id}:${q}`);
      if(failSet && q.startsWith('SET LOCAL search_path'))throw Error('setlocal-failed');
      if(failRollback && q==='ROLLBACK')throw Error('rollback-failed');
      return {rows:[],rowCount:0};},
      release(broken){events.push(`release:${id}:${Boolean(broken)}`);}};}};
}
const wrapped=createG4WrappedPool(fakePool(),schema);
const tx1=await wrapped.connect();
await blocked(()=>tx1.query('SELECT 1'),'g4_outside_transaction_forbidden');
await tx1.query('BEGIN');
same(events.slice(0,3),['checkout:1','1:BEGIN',`1:SET LOCAL search_path TO "${schema}", pg_catalog`]);
await blocked(()=>tx1.query('BEGIN'),'g4_nested_transaction_forbidden');
await tx1.query('SELECT 1');await tx1.query('COMMIT');tx1.release();
same(events.slice(-3),['1:SELECT 1','1:COMMIT','release:1:false']);
check(!events.some(e=>e.includes(':SET search_path TO ')),'no session-scope SET');
const tx2=await wrapped.connect();await tx2.query('BEGIN');await tx2.query('ROLLBACK');tx2.release();
check(events.includes('release:2:false'),'rollback returns clean connection');
check(events.filter(x=>x.includes('SET LOCAL search_path')).length===2,'search path set each tx only');
const tx3=await wrapped.connect();await tx3.query('BEGIN');tx3.release();
check(events.includes('release:3:true'),'unfinished tx connection discarded');
const tx4=await createG4WrappedPool(fakePool({failSet:true}),schema).connect();
await blocked(()=>tx4.query('BEGIN'),'setlocal-failed');tx4.release();
check(events.some(e=>e.endsWith(':ROLLBACK')),'SET LOCAL failure triggers rollback');
check(events.at(-1).startsWith('release:') && events.at(-1).endsWith(':false'),'failed SET rollback cleans connection');
const tx5=await createG4WrappedPool(fakePool({failSet:true,failRollback:true}),schema).connect();
await blocked(()=>tx5.query('BEGIN'),'setlocal-failed');tx5.release();
check(events.at(-1).endsWith(':true'),'failed SET and rollback discards connection');
await blocked(()=>createG4WrappedPool({},schema).connect(),'g4_pool_connect_required');
await blocked(()=>createG4WrappedPool(wrapped,'public').connect(),'g4_schema_name_invalid');
const root=process.cwd();
for(const filename of ['server/src/mail/resend-provider.mjs','server/src/mail/brevo-provider.mjs','server/src/index.mjs']){
 const content=readFileSync(filename,'utf8');
 check(!content.includes('g4-local-pg-core')&&!content.includes('g4-transaction-isolation'),'test is offline only');
}
const core=readFileSync('tools/backend/g4-local-pg-core.mjs','utf8');
for(const taboo of ['fetch(', 'RESEND_API_KEY','BREVO_API_KEY','CREATE DATABASE','heroku pg:psql']){
 check(!core.includes(taboo),`no live vendor or DB provisioning ${taboo}`);
}
const cli=spawnSync(process.execPath,['tools/backend/run-phase34-p1-08-d06d2b-g4-local.mjs','--plan'],{encoding:'utf8'});
same(cli.status,0);same(JSON.parse(cli.stdout).actuallyTestedPostgres,false);
const migrations=readdirSync('server/migrations');check(!migrations.some(x=>/^050/.test(x)),'no applied migration 050');
console.log(`[Phase34 D06-D2B G4-LOCAL-SAFE] PASS (${checks} assertions; session-local only; no DB connection; Brevo and Resend retained)`);
