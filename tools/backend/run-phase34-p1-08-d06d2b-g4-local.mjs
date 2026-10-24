// Optional local-only CLI; production/staging calls always rejected before driver loads.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {G4_CONFIRM,validateLocalConnection,runLocalG4} from './g4-local-pg-core.mjs';

const args=process.argv.slice(2);
const fail=(message)=>{process.stderr.write(`G4_LOCAL_BLOCKED: ${message}\n`);process.exitCode=2;};
if(args.length===0 || (args.length===1&&args[0]==='--plan')){
  process.stdout.write(JSON.stringify({phase:'D06-D2B-G4-LOCAL',mode:'PLAN_ONLY',
    localRestoreOnly:true,createsNewDatabase:false,createsTemporarySchemaOnlyIfExplicitlyApproved:true,
    actuallyTestedPostgres:false,liveStagingTested:false,liveMailSendingReady:false,
    requiresExplicitFlags:['--execute-local','--allow-temporary-schema'],
    requiresSeparateEnvironmentVariable:'G4_LOCAL_RESTORE_DATABASE_URL',
    requiresConsentVariable:'G4_CONFIRM_LOCAL_SCHEMA',
    acceptedConsentValue:G4_CONFIRM,retainedProviders:['brevo','resend']},null,2)+'\n');
}else if(args.length!==2 || args[0]!=='--execute-local' || args[1]!=='--allow-temporary-schema'){
  fail('Invalid flags. Default is --plan; local integration requires both explicit flags.');
}else{
  const secret=process.env.G4_LOCAL_RESTORE_DATABASE_URL;
  try{
    validateLocalConnection(secret,{mode:'execute-local',confirm:process.env.G4_CONFIRM_LOCAL_SCHEMA,requestedExecution:true});
    // Do not import/load the driver until host, database name and operator consent have passed.
    const require=createRequire(new URL('../../server/package.json',import.meta.url));
    const {Pool}=require('pg');
    const result=await runLocalG4({connectionString:secret,Pool,
      confirm:process.env.G4_CONFIRM_LOCAL_SCHEMA,requestedExecution:true,
      trace:m=>process.stderr.write(`[G4 local] ${m}\n`)});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    // No URLs, passwords, raw driver exceptions or SQL text in logs.
    fail(error?.code==='G4_CLEANUP_FAILED' ?
      'Scratch cleanup failed: local DBA must inspect the generated scratch schema before rerun.' :
      (String(error?.message||'unknown').startsWith('g4_')?error.message:'local_pg_integration_failed_redacted'));
  }
}
