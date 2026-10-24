// Local-only execution preflight; no driver import, no database connection.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateG6CLocalConnection,G6C_LOCAL_CONFIRM} from './g6c-local-pg-core.mjs';
let n=0;
const chk=(ok,label)=>{assert.ok(ok,label);n++;};
const refuse=(url,opts={})=>{assert.throws(()=>validateG6CLocalConnection(url,opts));n++;};
const good='postgresql://postgres:LOCAL_SECRET@127.0.0.1:5432/rental_restore_20261020_112826';
const permitted=validateG6CLocalConnection(good,{execute:true,confirm:G6C_LOCAL_CONFIRM});
chk(permitted.localOnly&&permitted.createsDatabase===false,'local_restore_only');
refuse('');refuse('invalid');refuse('http://localhost/db');
refuse('postgresql://postgres@prod.example.com/rental_restore_20261020_112826');
refuse('postgresql://postgres@192.168.1.10/rental_restore_20261020_112826');
refuse('postgresql://postgres@127.0.0.1:15432/rental_restore_20261020_112826');
refuse('postgresql://postgres@127.0.0.1:5432/postgres');
refuse('postgresql://postgres@127.0.0.1:5432/rental_production');
refuse('postgresql://postgres@127.0.0.1:5432/rental_restore_20261020_112826?host=evil');
refuse('postgresql://postgres@127.0.0.1:5432/rental_restore_20261020_112826#fragment');
refuse('postgresql://postgres@127.0.0.1:5432/rental_restore_20261020_112826',{execute:true,confirm:''});
refuse('postgresql://postgres@127.0.0.1:5432/rental_restore_20261020_112826',{execute:true,confirm:'yes'});
chk(validateG6CLocalConnection('postgresql://postgres@localhost/rental_restore_20261020_112826').localOnly,'localhost_accepted');
const src=readFileSync('tools/backend/g6c-local-pg-core.mjs','utf8');
const cli=readFileSync('tools/backend/run-phase34-g6c-local-pg18.mjs','utf8');
for(const x of ['DROP SCHEMA','pg_catalog.inet_server_addr','current_database()',
 'scratchSchemaDropped:true','SET LOCAL search_path','G6C_LOCAL_CONFIRM',
 'noDatabaseCreation:true'])chk((src+cli).includes(x),'contract_'+x);
for(const x of ['server/src/app.mjs','server/src/index.mjs']){
 chk(!readFileSync(x,'utf8').includes('g6c-local-pg-core.mjs'),'not_imported_runtime_'+x);
}
console.log(`[G6C PG18 LOCAL EXECUTION SAFETY GATE] PASS ${n} assertions; no DB/provider calls`);
