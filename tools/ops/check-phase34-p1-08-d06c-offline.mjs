// Phase34 P1-08 D06-C: a pure, offline provisioning checklist.
// Never reads provider API keys, opens network/DNS, or changes state.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const REQUIRED_LOCKS = Object.freeze([
  ['server/src/mail/mail-dynoweb-dispatcher.mjs', /export\s+const\s+P103_REAL_DELIVERY_LOCKED\s*=\s*true\s*;/],
  ['server/src/mail/mail-p108-protected-bridge.mjs', /export\s+const\s+P108_REAL_DELIVERY_LOCKED\s*=\s*true\s*;/],
  ['server/src/mail/mail-p108-preflight-control.mjs', /export\s+const\s+P108_D06_LIVE_DELIVERY_LOCKED\s*=\s*true\s*;/],
  ['server/src/mail/mail-provider-config.mjs', /liveSendingReady\s*:\s*false/],
]);

export const PROVIDER_CHOICES = Object.freeze({
  brevo: Object.freeze({dailyFree:300, monthlyFreePublished:null, internalMonthlySafetyCeiling:9300, freePlanCaveat:'Brevo Free includes branding; vendor may hold overflow mail in its own queue.'}),
  resend: Object.freeze({dailyFree:100, monthlyFreePublished:3000, internalMonthlySafetyCeiling:3000, freePlanCaveat:'Resend Free quota is 100 per day and 3000 per month.'}),
});

const safeDomain = value => {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.length > 253 || v.length < 4 || !/^[a-z0-9.-]+$/.test(v) || !v.includes('.')) return null;
  const labels=v.split('.');
  if (labels.some(x=>!x || x.length > 63 || x.startsWith('-') || x.endsWith('-'))) return null;
  if (!/[a-z]/.test(labels.at(-1))) return null;
  return v;
};

export function evaluateD06COffline({provider='undecided', senderDomain='', sourceOverrides={}}={}) {
  if (!['undecided','brevo','resend'].includes(provider)) throw new Error('provider_must_be_brevo_or_resend');
  if (typeof senderDomain !== 'string') throw new Error('sender_domain_invalid');
  const domain = safeDomain(senderDomain);
  if (senderDomain.trim() && !domain) throw new Error('sender_domain_invalid');
  const locks=REQUIRED_LOCKS.map(([file,expected])=>{
    let body;
    try {body=Object.hasOwn(sourceOverrides,file) ? sourceOverrides[file] : readFileSync(resolve(root,file),'utf8');}
    catch {body='';}
    return Object.freeze({file,pass:typeof body==='string' && expected.test(body)});
  });
  const codeLocksIntact=locks.every(x=>x.pass);
  const selection=provider==='undecided'?null:PROVIDER_CHOICES[provider];
  const blockers=[
    ...(!codeLocksIntact?['source_delivery_lock_missing']:[]),
    ...(!selection?['provider_selection_pending']:[]),
    ...(!domain?['sender_domain_pending']:[]),
    'provider_account_verification_pending',
    'dns_authentication_evidence_pending',
    'approved_api_key_configuration_pending',
    'separate_real_delivery_authorization_required',
    'existing_staging_outbox_review_required',
  ];
  return Object.freeze({
    phase:'P1-08 D06-C',mode:'OFFLINE_READ_ONLY',checkedAt:null,
    provider, senderDomainCandidate:domain, vendorQuota:selection || null,
    locks, codeLocksIntact, vendorApiCalls:0, realEmailsSent:0,
    domainVerified:false, accountVerified:false, liveSendingReady:false, canSend:false,
    blockers:Object.freeze(blockers),
    requiredHumanActions:Object.freeze([
      'Approve selected free vendor and sender domain controlled by organization',
      'Open vendor account manually and confirm free plan; do not select a paid subscription',
      'Inspect existing Clerk/SPF/DKIM/DMARC/MX and obtain provider-specific DNS values',
      'Approve non-conflicting DNS records and independently verify authentication',
      'Store API key only in approved Heroku config (never ZIP, logs, Git or frontend)',
      'Review queued mail including Outbox ID 5 before any dispatch unlock',
      'Approve separate limited real-email test after security review',
    ]),
  });
}

export function parseD06CArgs(args) {
  const opts={};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--provider' && args[i+1]) {opts.provider=args[++i].toLowerCase();continue;}
    if(arg==='--sender-domain' && args[i+1]) {opts.senderDomain=args[++i];continue;}
    if(arg==='--json')continue;
    throw new Error(`unsupported_argument: ${arg}`);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const plan=evaluateD06COffline(parseD06CArgs(process.argv.slice(2)));
    console.log(JSON.stringify(plan,null,2));
    if (!plan.codeLocksIntact) process.exitCode=2;
  } catch (err) {
    console.error(`[D06-C] FAIL (${err.message})`);
    process.exitCode=2;
  }
}
