// Default --plan: NEVER connect. Explicit opt-in local PostgreSQL 18 fixture only.
import {createRequire} from 'node:module';
import {G6C_LOCAL_CONFIRM,runG6CLocalPG18,validateG6CLocalConnection} from './g6c-local-pg-core.mjs';
const args=process.argv.slice(2);
if(args.length===0||(args.length===1&&args[0]==='--plan')){
  console.log(JSON.stringify({mode:'PLAN_ONLY',stage:'G6C_LOCAL_PG18',
    noConnection:true,existingLocalRestoreOnly:true,noDatabaseCreation:true,
    scratchSchemaCreationRequiresConsent:true,scratchSchemaCleanedOnCompletion:true,
    requiredFlags:['--execute-local','--allow-temporary-schema'],
    secretEnvironmentName:'G6C_LOCAL_RESTORE_DATABASE_URL',
    consentEnvironmentName:'G6C_CONFIRM_LOCAL_SCHEMA',consentValue:G6C_LOCAL_CONFIRM,
    currentStagingUnchanged:true,migration050NotApplied:true,
    BrevoRequests:0,emails:0},null,2));
}else if(args.length!==2||args[0]!=='--execute-local'||args[1]!=='--allow-temporary-schema'){
  console.error('G6C_LOCAL_BLOCKED: wrong_cli_flags');process.exitCode=2;
}else{
  try{
    const url=process.env.G6C_LOCAL_RESTORE_DATABASE_URL;
    validateG6CLocalConnection(url,{execute:true,confirm:process.env.G6C_CONFIRM_LOCAL_SCHEMA});
    const require=createRequire(new URL('../../server/package.json',import.meta.url));
    const {Pool}=require('pg');
    const report=await runG6CLocalPG18({connectionString:url,Pool,
      confirm:process.env.G6C_CONFIRM_LOCAL_SCHEMA,
      trace:s=>process.stderr.write('[G6C local] '+s+'\n')});
    console.log(JSON.stringify(report,null,2));
  }catch(e){
    const message=e?.code==='G6C_CLEANUP_FAILED' ? `scratch_cleanup_failed_${e.schema}` :
      /^g6c_/.test(String(e?.message)) ? String(e.message) :'integration_failed_redacted';
    console.error('G6C_LOCAL_BLOCKED: '+message);process.exitCode=2;
  }
}
