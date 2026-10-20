import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { getWebBackupConfiguration } from '../../server/src/settings/backup-verification-runtime.mjs';
import { requireRecentReverification, createBackupVerificationJobs } from '../../server/src/settings/backup-verification-jobs.mjs';
import { createEncryptedS3ArchiveStore, encryptArchive, decryptArchive, sha256File } from '../../server/src/settings/backup-verification-object-store.mjs';
import { assertDisposableTarget } from '../../server/src/settings/backup-verification-guard.mjs';
import { describeResetBackupProof } from '../../server/src/settings/system-reset-backup-proof.mjs';

const config = { APP_ENV:'staging',BACKUP_VERIFY_ENABLED:'true',
  DATABASE_URL:'postgres://source:pw@source.example.net/live?sslmode=require',
  BACKUP_VERIFY_TARGET_DATABASE_URL:'postgres://disposable:pw@verify.example.net/scratch?sslmode=require',
  BACKUP_VERIFY_TARGET_MARKER_ID:randomUUID(), BACKUP_SOURCE_RESOURCE_ID:'source-cluster',BACKUP_TARGET_RESOURCE_ID:'isolated-cluster',
  BACKUP_S3_ENDPOINT:'https://s3.ap-northeast-2.amazonaws.com', BACKUP_S3_BUCKET:'backup-bucket-1',BACKUP_S3_REGION:'ap-northeast-2',
  BACKUP_S3_ACCESS_KEY_ID:'TEST',BACKUP_S3_SECRET_ACCESS_KEY:'DO_NOT_USE_TEST',
  BACKUP_ENCRYPTION_KEY_HEX:randomBytes(32).toString('hex'),BACKUP_MAX_ARCHIVE_BYTES:'1048576' };
assert.equal(getWebBackupConfiguration(config).ready,true);
assert.equal(getWebBackupConfiguration({...config,DATABASE_URL:config.BACKUP_VERIFY_TARGET_DATABASE_URL}).ready,false);
assert.equal(getWebBackupConfiguration({...config,BACKUP_VERIFY_TARGET_DATABASE_URL:'postgres://disposable:pw@source.example.net/scratch'}).ready,false);
assert.equal(getWebBackupConfiguration({...config,BACKUP_VERIFY_ENABLED:'false'}).ready,false);
assert.equal(getWebBackupConfiguration({...config,BACKUP_ENCRYPTION_KEY_HEX:'abc'}).ready,false);
assert.equal(getWebBackupConfiguration({...config,BACKUP_S3_ENDPOINT:'http://127.0.0.1'}).ready,false);
assert.throws(()=>requireRecentReverification({factorVerificationAge:[6,-1],reverificationId:'verify_abcdef012345',sessionId:'sess'}));
assert.throws(()=>requireRecentReverification({factorVerificationAge:[0,-1],sessionId:'sess'}));
assert.throws(()=>requireRecentReverification({factorVerificationAge:[-1,-1],reverificationId:'verify_abcdef012345',sessionId:'sess'}));
assert.equal(requireRecentReverification({factorVerificationAge:[0,-1],reverificationId:'verify_abcdef012345',sessionId:'sess'}),'verify_abcdef012345');

const dummyProof={type:'full-pg-dump-isolated-restore-v2',databaseName:'live',verifiedAt:new Date().toISOString(),
  dumpSha256:'a'.repeat(64),tableCountsSha256:'b'.repeat(64),verifiedTableCount:42,
  jobId:randomUUID(),environment:'staging',objectSha256:'c'.repeat(64)};
dummyProof.objectKey=`phase34/staging/${dummyProof.jobId}.pgdump.aesgcm`;
assert.equal(describeResetBackupProof(dummyProof,'live').valid,true);
assert.equal(describeResetBackupProof({...dummyProof,objectKey:'../evil'},'live').valid,false);
assert.equal(describeResetBackupProof(dummyProof,'other').valid,false);

const checkedConfig={...getWebBackupConfiguration(config),targetResourceId:'isolated-cluster'};
const sampleSource={async query(sql){ if(sql.includes('current_database()'))return {rows:[{name:'live',actor:'source'}]};return {rows:[{marker:null}]};}};
const sampleTarget={async query(sql){ if(sql.includes('current_database()'))return {rows:[{name:'scratch',actor:'disposable'}]};return {rows:[{marker_id:config.BACKUP_VERIFY_TARGET_MARKER_ID,environment:'staging',resource_id:'isolated-cluster'}]};}};
assert.equal((await assertDisposableTarget(sampleSource,sampleTarget,checkedConfig)).targetName,'scratch');
await assert.rejects(assertDisposableTarget(sampleSource,{async query(sql){if(sql.includes('current_database()'))return {rows:[{name:'live',actor:'source'}]};return sampleTarget.query(sql);}},checkedConfig),/backup_target_not_isolated/);
await assert.rejects(assertDisposableTarget(sampleSource,{async query(sql){if(sql.includes('current_database()'))return {rows:[{name:'scratch',actor:'disposable'}]};return {rows:[{marker_id:'invalid',environment:'staging',resource_id:'isolated-cluster'}]};}},checkedConfig),/backup_target_marker_mismatch/);

const dir=await mkdtemp(join(tmpdir(),'rental-backup-test-'));
try {
  const source=join(dir,'source'),crypted=join(dir,'crypted'),result=join(dir,'result');
  await writeFile(source,randomBytes(32768));
  const encrypted=await encryptArchive(source,crypted,config.BACKUP_ENCRYPTION_KEY_HEX);
  assert.equal(await sha256File(crypted),encrypted.sha256);
  assert.equal(await decryptArchive(crypted,result,config.BACKUP_ENCRYPTION_KEY_HEX),await sha256File(source));
  assert.notEqual(await sha256File(crypted),await sha256File(source));
  const downloaded=join(dir,'downloaded');
  let objectBytes=null, objectHeaders=null;
  const fakeFetch=async (_url,options) => {
    if(options.method==='PUT') {
      const chunks=[];
      for await (const chunk of options.body) chunks.push(Buffer.from(chunk));
      objectBytes=Buffer.concat(chunks);
      objectHeaders=options.headers;
      return new Response(null,{status:200});
    }
    if(options.method==='HEAD') return new Response(null,{status:200,headers:{
      'x-amz-meta-archive-sha256': objectHeaders['x-amz-meta-archive-sha256'],
      'x-amz-meta-backup-environment':'staging',
      'x-amz-checksum-sha256':objectHeaders['x-amz-checksum-sha256'],
    }});
    if(options.method==='GET') return new Response(objectBytes,{status:200});
    throw Error('unexpected_method');
  };
  const store=createEncryptedS3ArchiveStore(getWebBackupConfiguration(config),{fetchImpl:fakeFetch});
  const key=`phase34/staging/${randomUUID()}.pgdump.aesgcm`;
  await store.upload(key,crypted,await sha256File(source));
  await store.verifyPresence(key,encrypted.sha256);
  await store.download(key,downloaded,encrypted.sha256);
  assert.equal(await sha256File(downloaded),encrypted.sha256);
  await assert.rejects(store.verifyPresence(key,'f'.repeat(64)),/backup_store_object_changed/);
  await assert.rejects(decryptArchive(crypted,join(dir,'wrong'),randomBytes(32).toString('hex')));
} finally {await rm(dir,{recursive:true,force:true});}

let queries=[];
const pool={
  async query(sql,params){queries.push({sql,params}); if(sql.includes('INSERT INTO app_backup_verification_jobs')) return {rows:[{
    id:params[0],environment:params[1],status:'queued',phase:'queued',created_at:new Date()}]};
    if(sql.includes('FROM app_runtime_metadata')) return {rows:[{value:{environment:'staging',updatedAt:new Date().toISOString()}}]}; if(sql.includes('SELECT *')) return {rows:[]}; return {rows:[]};},
};
const jobService=createBackupVerificationJobs(pool,{runtime:()=>({...getWebBackupConfiguration(config),ready:true})});
const job=await jobService.start({auth:{sessionId:'sess_x',factorVerificationAge:[0,-1],reverificationId:'verify_abcdef012345'},actorClerkUserId:'user_admin'});
assert.equal(job.status,'queued');
assert.equal(queries.at(-1).params[4],'verify_abcdef012345');
console.log('[web-backup-verify] PASS: fail-closed environment, owner step-up contract, proof v2, authenticated AES-GCM roundtrip, queued job');
