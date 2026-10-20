import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VERIFICATION_CODE_LENGTH,
  normalizeVerificationCode,
  splitVerificationCode,
  updateVerificationCodeDigit,
  isCompleteVerificationCode,
} from '../../src/components/verificationCodeInputModel.js';

const panel = readFileSync('src/admin/AdminSettingsPanel.jsx', 'utf8');
const component = readFileSync('src/components/SixDigitVerificationCodeInput.jsx','utf8');
const controller = readFileSync('src/features/settings/useAdminDataMaintenanceController.js','utf8');

const verificationArea = panel.slice(panel.indexOf('const renderResetTab ='), panel.indexOf('title="PostgreSQL 운영 데이터 백업"'));
assert(verificationArea.length > 800);
assert(verificationArea.includes('현재 데이터의 논리적 정합성만 검사합니다. 전체 DB 복원 검사는 지원하지 않으며, 전체 데이터 초기화는 계속 제한됩니다.'));
assert(!verificationArea.includes('이 검사는 전체 백업이나 복원 성공을 의미하지 않습니다.'));
assert(!verificationArea.includes('이메일로 본인 확인'));
assert(verificationArea.includes('>이메일 인증</Button>'));
assert(verificationArea.includes('>상태 새로고침</Button>'));
assert(verificationArea.indexOf('>이메일 인증</Button>') < verificationArea.indexOf('>상태 새로고침</Button>'));
assert(verificationArea.includes('<SixDigitVerificationCodeInput'));
assert(verificationArea.includes('flex flex-wrap items-end justify-end gap-3'));
assert(verificationArea.includes('>확인 후 검증 시작</Button>'));
assert(verificationArea.includes('disabled={backupVerifyBusy || !isCompleteVerificationCode(backupReverifyCode)}'));
assert(verificationArea.includes('onChange={setBackupReverifyCode}'));
assert(verificationArea.includes('onSubmit={() => void startBackupVerification()}'));
assert(verificationArea.includes('검증 시작 재시도'));
assert.equal((verificationArea.match(/>상태 새로고침<\/Button>/g) || []).length, 1);
assert(!verificationArea.includes('maxLength={10}'));
assert(component.includes('onPaste={pasteCode}'));
assert(component.includes('event.preventDefault()'));
assert(component.includes('autoComplete={index === 0 ? \'one-time-code\' : \'off\'}'));
assert(component.includes('aria-label={`${label} ${index + 1}번째 자리`}'));
assert(component.includes('onKeyDown={(event) => handleKeyDown(event, index)}'));
assert(component.includes('requestAnimationFrame(() => inputRefs.current[index]?.focus())'));
assert(component.includes('disabled={disabled}'));
assert.equal(VERIFICATION_CODE_LENGTH,6);
assert.equal(normalizeVerificationCode('ab12 3-4567'), '123456');
assert.deepEqual(splitVerificationCode('135'), ['1','3','5','','','']);
assert.equal(updateVerificationCodeDigit('12345', 5, '6').code, '123456');
assert.deepEqual(updateVerificationCodeDigit('123456', 2, ''), {code:'12456',focusIndex:null});
assert.deepEqual(updateVerificationCodeDigit('', 0, '12345678'), {code:'123456',focusIndex:5});
assert.equal(isCompleteVerificationCode('123456'),true);
for(const invalid of ['12345','1234567','12-456','', 'abcdef']) {
 assert.equal(isCompleteVerificationCode(invalid), false,invalid);
}
assert(controller.includes('if (!backupReverifyConfirmed)') && controller.includes('setBackupReverifyConfirmed(true)'), 'reauth consumed code reuse prevention must remain');
console.log('[frontend-phase34-backup-otp-ux] PASS: six boxes, paste, keyboard, button layout, security copy, state preservation');
