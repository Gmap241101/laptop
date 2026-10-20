import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBackupReverificationToken, waitForBackupReverificationClaims } from '../../src/clerk/backupReverificationClaims.js';
const jwt = claims => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({alg:'RS256'})}.${encode({sid:'sess_admin',...claims})}.signature`;
};
assert.equal(checkBackupReverificationToken(jwt({fva:[0,-1],reverification_id:'rev_secure_123456789'})),null);
assert.equal(checkBackupReverificationToken(jwt({fva:[0,-1]})),'backup_verification_reverification_claim_missing');
assert.equal(checkBackupReverificationToken(jwt({fva:[6,-1],reverification_id:'rev_secure_123456789'})),'backup_verification_reauthentication_not_reflected');
assert.equal(checkBackupReverificationToken('not-a-token'),'backup_verification_session_token_invalid');
let calls=0;
const token = await waitForBackupReverificationClaims(() => {
 calls++;
 return jwt({fva:[calls<3?6:0,-1],reverification_id:'rev_secure_123456789'});
}, {intervals:[0,1,1],delay:async()=>{}});
assert.equal(calls,3); assert.equal(checkBackupReverificationToken(token),null);
await assert.rejects(waitForBackupReverificationClaims(async()=>jwt({fva:[0,-1]}),{intervals:[0,1],delay:async()=>{}}),
  e=>e.code==='backup_verification_reverification_claim_missing');
const controller=readFileSync('src/features/settings/useAdminDataMaintenanceController.js','utf8');
const ui=readFileSync('src/admin/AdminSettingsPanel.jsx','utf8');
const client=readFileSync('src/clerk/clerkStagingClient.js','utf8');
assert(controller.includes('if (!backupReverifyConfirmed)'));
assert(controller.includes('setBackupReverifyConfirmed(true)'));
assert(ui.includes('검증 시작 재시도'));
assert(ui.includes('backupReverifyConfirmed,'));
assert(client.includes('verifiedSessionToken'));
assert(client.includes('waitForBackupReverificationClaims'));
console.log('[frontend-phase34-backup-reauth-hotfix] PASS: fresh claims, missing claim, delayed tokens, code-once behavior');
