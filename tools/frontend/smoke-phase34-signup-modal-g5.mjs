import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestAdminG5OwnerCheck} from '../../src/clerk/clerkStagingClient.js';
let assertions=0;
const check=(ok,message)=>{assert.ok(ok,message);assertions++;};
const panel=readFileSync('src/user/UserAuthPanel.jsx','utf8');
const admin=readFileSync('src/admin/AdminMailNotificationsPanel.jsx','utf8');
const controller=readFileSync('src/features/auth/useUserSignupController.js','utf8');
const client=readFileSync('src/clerk/clerkStagingClient.js','utf8');
for(const token of ['role="alertdialog"','aria-labelledby="signup-identity-conflict-title"',
 'aria-describedby="signup-identity-conflict-description"', 'dismissSignupIdentityConflict',
 '기존 계정으로 로그인','가입 정보 수정','onKeyDown'])check(panel.includes(token),`modal ${token}`);
check(!panel.includes('<div role="alert" aria-live="assertive"'), 'duplicate inline banner removed');
check(controller.includes('if (!signupFeedback) {'), 'duplicate toast suppressed');
check(client.includes('waitForBackupReverificationClaims'), 'fresh signed reauth claims required');
check(client.includes("path:'/api/admin/mail-delivery/g5-owner-check'"), 'G5 correct route');
check(client.includes('async getAdminG5OwnerCheck()'), 'Clerk admin client method integrated');
for(const key of ['beginBackupReverification()', 'completeBackupReverification(g5Code)', 'getAdminG5OwnerCheck()',
 '인증코드 받기','최고관리자 본인 확인'])check(admin.includes(key),`read-only UI ${key}`);
const claims={sid:'sess_g5_00001',reverification_id:'g5_reverification_123456',fva:[0,0]};
const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url');
const jwt=`eyJhbGciOiJSUzI1NiJ9.${encoded}.synthetic_signature_no_network`;
const observed=[];
const context={clerk:{session:{getToken:async(opts)=>{observed.push(['token',opts]);return jwt;}}},
 apiBaseUrl:'https://api.staging.test',fetchImpl:async(url,req)=>{
  observed.push(['http',url,req.method,req.cache,req.headers.Authorization]);
  return {ok:true,status:200,json:async()=>({g5OwnerCheck:{result:'PASS',readOnly:true,
   emailsSent:0,vendorCalls:0,canSend:false}})};
 }};
const result=await requestAdminG5OwnerCheck(context);
check(result.verified===true && result.readOnly===true,'minimal safe result');
check(observed[0][1]?.skipCache===true,'fresh token bypass cache');
check(observed[1][1]==='https://api.staging.test/api/admin/mail-delivery/g5-owner-check','correct url');
check(observed[1][2]==='GET','GET only');
check(observed[1][3]==='no-store','network cache bypass');
check(observed[1][4]===`Bearer ${jwt}`,'authorization header used server-side only');
const failureContext={...context,fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:'g5_owner_authorization_failed'})})};
await assert.rejects(()=>requestAdminG5OwnerCheck(failureContext),e=>e.status===403);assertions++;
const locked={...context,fetchImpl:async()=>({ok:false,status:404,json:async()=>({error:'not_found'})})};
await assert.rejects(()=>requestAdminG5OwnerCheck(locked),e=>e.status===404);assertions++;
const dangerous={...context,fetchImpl:async()=>({ok:true,status:200,json:async()=>({g5OwnerCheck:{result:'PASS',readOnly:true,emailsSent:1,vendorCalls:0,canSend:false}})})};
await assert.rejects(()=>requestAdminG5OwnerCheck(dangerous));assertions++;
const stale={...context,clerk:{session:{getToken:async()=>{
 const bad=Buffer.from(JSON.stringify({...claims,fva:[6,0]})).toString('base64url');
 return `e30.${bad}.invalid`;}}}};
await assert.rejects(()=>requestAdminG5OwnerCheck(stale));assertions++;
console.log(`G5 field probe and signup conflict modal PASS (${assertions} checks; synthetic tokens; 0 real APIs, 0 emails)`);
