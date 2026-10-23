// Gate C - vendor transport contract verification. ALL HTTP IS IN-MEMORY MOCKED.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadP101MailConfig } from '../../server/src/mail/mail-provider-config.mjs';
import { createBrevoProvider } from '../../server/src/mail/brevo-provider.mjs';
import { createResendProvider, MailProviderError } from '../../server/src/mail/resend-provider.mjs';
import { P103_REAL_DELIVERY_LOCKED } from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
import { prepareBrevoTransaction, parseBrevoAcceptance, classifyBrevoSendFailure, executeBrevoTransaction } from '../../server/src/mail/brevo-transaction-contract.mjs';
let checks=0;let calls=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const ok=(a,label)=>{assert.ok(a,label);checks++;};
const errors=async(fn,code,label)=>{await assert.rejects(fn,e=>e instanceof MailProviderError && e.code===code,label);checks++;};
const mockEnv={APP_ENV:'staging',MAIL_ENABLED:'true',MAIL_PROVIDER:'brevo',MAIL_DOMAIN_VERIFIED:'true',
 MAIL_FROM_ADDRESS:'no-reply@example.org',MAIL_FROM_NAME:'Environmental sender',MAIL_STAGING_ALLOWLIST:'allowed@example.org', BREVO_API_KEY:'MOCK_SECRET_DO_NOT_USE'};
const config=loadP101MailConfig(mockEnv);
const msg={id:51,token:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',attempt:1,to:' Allowed@Example.org ',subject:'대여 승인 안내',
 html:'<!DOCTYPE html><html><body><p>대여 승인</p></body></html>',text:'대여 승인',senderName:'Outbox 기록 이름'};
const base=prepareBrevoTransaction({config,message:msg});
eq(base.url,'https://api.brevo.com/v3/smtp/email','fixed HTTPS API URL');
eq(base.method,'POST','POST method');
eq(base.payload.to,[{email:'allowed@example.org'}],'one normalized recipient');
eq(base.payload.sender,{email:'no-reply@example.org',name:'Outbox 기록 이름'},'sender snapshot wins');
eq(base.payload.subject,msg.subject,'Korean subject retained');
eq(base.payload.htmlContent,msg.html,'HTML rendered snapshot used');
ok(!('textContent' in base.payload),'no second mutually exclusive body selector');
ok(!('apiKey' in base.payload),'no API key in payload');
ok(!('token' in base.payload),'no claim token leaked');
ok(!('attachment' in base.payload),'no unintended attachments');
ok(!('params' in base.payload),'no unreviewed template params');
ok(!('bcc' in base.payload),'no additional recipients');
const withFallback=prepareBrevoTransaction({config,message:{...msg,senderName:undefined,html:'',text:'테스트 텍스트'}});
eq(withFallback.payload.sender.name,'Environmental sender','sender fallback');
eq(withFallback.payload.textContent,'테스트 텍스트','text only fallback');
ok(!('htmlContent' in withFallback.payload),'empty HTML omitted');
const unnamed=prepareBrevoTransaction({config:{...config,senderName:''},message:{...msg,senderName:undefined}});
ok(!('name' in unnamed.payload.sender),'unnamed sender supported');
const invalidConfig=[{...config,enabled:false},{...config,provider:'disabled'},{...config,domainVerified:false},
 {...config,apiKey:''},{...config,apiKey:'SECRET\nINJECT'}];
for (const c of invalidConfig) await errors(async()=>prepareBrevoTransaction({config:c,message:msg}), 'mail_not_configured','reject invalid provider readiness');
await errors(async()=>prepareBrevoTransaction({config:{...config,sender:'bad'},message:msg}),'sender_invalid','invalid sender');
for (const to of ['other@example.org','evil@example.net','xx\r\nBcc:y@example.org','bad-email']) {
 await errors(async()=>prepareBrevoTransaction({config,message:{...msg,to}}),to.includes('other@')||to.includes('evil@')?'recipient_not_allowlisted':'recipient_invalid','recipient validation');
}
for (const bad of [{id:null},{id:0},{token:'bad'},{attempt:0},{attempt:1.25}]) {
 await errors(async()=>prepareBrevoTransaction({config,message:{...msg,...bad}}),'mail_claim_invalid','durable claim context required');
}
for(const subject of ['', 'Hi\nBcc:steal@example.com','x'.repeat(501)]) {
 await errors(async()=>prepareBrevoTransaction({config,message:{...msg,subject}}),'message_subject_invalid','subject injection/limits');
}
for(const name of ['bad\r\nBCC:','<unsafe>', 'X'.repeat(101)]) {
 await errors(async()=>prepareBrevoTransaction({config,message:{...msg,senderName:name}}),'sender_name_invalid','sender name injection/limits');
}
for (const patch of [{html:'',text:''},{html:'x'.repeat(64001)},{html:'',text:'x'.repeat(40001)}]) {
 await errors(async()=>prepareBrevoTransaction({config,message:{...msg,...patch}}),'message_body_invalid','body missing or too long');
}
for(const status of [400,401,403,404,422]){
 const error=classifyBrevoSendFailure(status);eq(error.code,'provider_rejected',`HTTP ${status} rejected`);eq(error.retryable,false,`HTTP ${status} no retry`);
}
const refused=classifyBrevoSendFailure(429);
eq(refused.code,'provider_rate_limited','429 explicit refusal');eq(refused.retryable,true,'429 safe retry');
for(const status of [200,202,408,409,425,499,500,502,503,504,599]) {
 const error=classifyBrevoSendFailure(status);eq(error.code,'provider_outcome_uncertain',`${status} uncertain`);eq(error.retryable,false,`${status} cannot auto retry`);
}
eq(parseBrevoAcceptance(201,{messageId:'<mock.123@relay.example.org>'}),
 {provider:'brevo',providerMessageId:'<mock.123@relay.example.org>',state:'accepted'},'201 returns acceptance ID');
for(const response of [[200,{messageId:'abc'}],[201,{}],[201,{messageId:'x'}],[201,{messageId:'bad\nheader'}],[201,{messageId:'x'.repeat(256)}],[201,[]],[201,null]]) {
 await errors(async()=>parseBrevoAcceptance(...response),'provider_outcome_uncertain','malformed acceptance uncertain');
}
const fakeFetch=async(url,options)=>{
 calls++;
 eq(url,base.url,'HTTP URL');eq(options.method,'POST','HTTP POST');
 eq(options.headers['api-key'],config.apiKey,'key header transport only');
 eq(options.headers.Accept,'application/json','accept header');
 eq(options.headers['Content-Type'],'application/json','JSON type');
 ok(options.signal instanceof AbortSignal,'bounded timeout');
 eq(JSON.parse(options.body),base.payload,'HTTP body matches validated request');
 return {status:201,json:async()=>({messageId:'<mock123@relay.example.org>'})};
};
eq((await executeBrevoTransaction({config,message:msg,fetchImpl:fakeFetch})).state,'accepted','offline transport accepted');
eq(calls,1,'exactly one mock HTTP call');
for(const [status,expected] of [[400,'provider_rejected'],[429,'provider_rate_limited'],[500,'provider_outcome_uncertain'],[202,'provider_outcome_uncertain']]) {
 await errors(()=>executeBrevoTransaction({config,message:msg,fetchImpl:async()=>({status,json:async()=>({messageId:'<id@example.org>'})})}),expected,`HTTP ${status} expected outcome`);
}
for(const fake of [async()=>{throw new Error('sensitive API body SECRET');}, async()=>({status:201,json:async()=>{throw Error('body SECRET');}}),
 async()=>({status:201,json:async()=>({messageId:'x'})}), async()=>null]) {
 await errors(()=>executeBrevoTransaction({config,message:msg,fetchImpl:fake}),'provider_outcome_uncertain','ambiguous HTTP never resent');
}
await assert.rejects(()=>executeBrevoTransaction({config,message:msg}),/explicit HTTP transport required/);checks++;
const provider=createBrevoProvider({config,fetchImpl:async()=>{calls++;throw new Error('MUST NEVER SEND');}});
await errors(()=>provider.send(msg),'outbox_and_quota_ledger_not_ready','legacy P101 gate blocks actual provider');
eq(calls,1,'legacy gate means no HTTP calls');
const forged={...config,liveSendingReady:true};
await errors(()=>createBrevoProvider({config:forged,fetchImpl:async()=>{calls++;throw Error('WOULD SEND');}}).send(msg),
 'p103_real_delivery_locked','P103 hard lock despite forged ready config');
eq(calls,1,'P103 lock protects Brevo network');
const resend=loadP101MailConfig({...mockEnv,MAIL_PROVIDER:'resend',RESEND_API_KEY:'MOCK',RESEND_DOMAIN_ID:'dom_1234'});
await errors(()=>createResendProvider({config:{...resend,liveSendingReady:true},fetchImpl:async()=>{calls++;throw Error('WOULD SEND');}}).send(msg),
 'p103_real_delivery_locked','P103 lock protects alternate provider');
eq(calls,1,'P103 lock protects Resend network');
const domainProvider=createBrevoProvider({config,fetchImpl:async()=>({ok:true,json:async()=>({domain:'fake.org',verified:true,authenticated:true})})});
const domain=await domainProvider.getDomainStatus();
eq(domain.verified,false,'unrelated verified domain rejected');eq(domain.status,'not_verified','domain display consistent');
eq(P103_REAL_DELIVERY_LOCKED,true,'source hard-lock unchanged');
const startup=readFileSync('server/src/index.mjs','utf8');
ok(!startup.includes('createBrevoProvider('),'web startup no live mail');
ok(!startup.includes('executeBrevoTransaction('),'web startup no transport');
ok(!readFileSync('server/src/app.mjs','utf8').includes('/api/admin/mail-dispatch'),'no public mail-dispatch endpoint');
console.log(`[phase34-p1-08-gate-c-provider-contract] PASS (${checks} checks; mocked HTTP only; REAL PROVIDER REQUESTS=0; REAL EMAILS=0)`);
