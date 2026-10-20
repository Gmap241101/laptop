import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeRestoreRequest} from '../../server/src/settings/system-data-restore.mjs';
const folder=mkdtempSync(join(tmpdir(),'p34-scoped-fixture-'));
const source=join(folder,'source.json');
writeFileSync(source,JSON.stringify({
  format:'mk-rental-postgresql-backup-v1',authority:'postgresql',exportedAt:new Date().toISOString(),
  schemaMigrations:['038','039','040','041'].map(n=>({name:`${n}_test.sql`,checksum:n[0].repeat(64)})),
  content:{faqCategories:[{category_id:'original',name:'Original category'}]},
}));
const output=join(folder,'fixtures');
const proc=spawnSync(process.execPath,[fileURLToPath(new URL('./create-phase34-scoped-restore-test-fixtures.mjs',import.meta.url)),source,output],{encoding:'utf8'});
assert.equal(proc.status,0,proc.stdout+'\n'+proc.stderr);
assert.match(proc.stdout,/FIXTURE_CREATE=PASS/);
const addPath=proc.stdout.match(/^ADD_FILE=(.*)$/m)?.[1].trim();
const overwritePath=proc.stdout.match(/^OVERWRITE_FILE=(.*)$/m)?.[1].trim();
assert.ok(existsSync(addPath));assert.ok(existsSync(overwritePath));
const add=JSON.parse(readFileSync(addPath,'utf8'));
const overwrite=JSON.parse(readFileSync(overwritePath,'utf8'));
for(const snap of [add,overwrite]){
 const req=normalizeRestoreRequest({snapshot:snap,scopes:['boards'],mode:'addMissing'});
 assert.equal(req.totalRows,1);
 assert.equal(req.tables.length,3);
 assert.equal(req.tables.find(t=>t.name==='app_faq_categories').rows.length,1);
 assert.equal(Object.keys(snap).sort().join(','),'authority,content,exportedAt,format,schemaMigrations');
 assert.deepEqual(snap.content.boardConfigs,[]);
 assert.deepEqual(snap.content.boardPosts,[]);
 assert.deepEqual(snap.content.site,[]);
 assert.ok(!JSON.stringify(snap).includes('Original category'));
}
assert.equal(add.content.faqCategories[0].category_id,overwrite.content.faqCategories[0].category_id);
assert.notEqual(add.content.faqCategories[0].name,overwrite.content.faqCategories[0].name);
console.log('[phase34-scoped-test-fixture] PASS: no production records, one-row FAQ-only valid restore snapshots, distinct overwrite, original data omitted');
