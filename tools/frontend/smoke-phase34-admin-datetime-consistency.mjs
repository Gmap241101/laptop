import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatKoreanDateTime } from '../../src/utils/appUtils.js';

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

assert.equal(
  formatKoreanDateTime('2026-08-07T14:33:44.000Z'),
  '2026. 8. 7. 오후 11:33:44',
  'Canonical Korean administrator datetime format must include full year/date, Korean day period and seconds',
);
assert.equal(
  formatKoreanDateTime('26. 8. 16. PM 10:57:12'),
  '2026. 8. 16. 오후 10:57:12',
  'Legacy short-year AM/PM timestamps must normalize into the canonical Korean format',
);

const [
  settingsPanel,
  signupPolicy,
  inquiryPanel,
  accountsPanel,
  memberHistory,
  signupTerms,
  dashboardPanel,
  homeBannerPanel,
  dataMaintenance,
  memberAccountPolicy,
  termsService,
  memberAuthorityService,
] = await Promise.all([
  read('src/admin/AdminSettingsPanel.jsx'),
  read('src/admin/AdminSignupPolicyPanel.jsx'),
  read('src/admin/AdminInquiryPanel.jsx'),
  read('src/admin/AdminAccountsPanel.jsx'),
  read('src/admin/AdminMemberRentalHistoryDialog.jsx'),
  read('src/admin/AdminSignupTermsManager.jsx'),
  read('src/admin/AdminDashboardPanel.jsx'),
  read('src/admin/AdminHomeBannerPanel.jsx'),
  read('src/features/settings/useAdminDataMaintenanceController.js'),
  read('src/features/members/memberAccountPolicy.js'),
  read('src/features/terms/termsService.js'),
  read('server/src/members/member-authority-service.mjs'),
]);

assert.match(settingsPanel, /formatKoreanDateTime\(value, '기록 없음'\)/);
assert.doesNotMatch(settingsPanel, /if \(typeof value === 'string'\) return value/);
assert.match(signupPolicy, /memberDirectoryAudit\.completedAt \|\| memberDirectoryAudit\.completedAtText/);
assert.match(signupPolicy, /formatKoreanDateTime\(/);
assert.match(inquiryPanel, /formatDateTime = \(value\) => formatKoreanDateTime\(value, '-'\)/);
assert.match(accountsPanel, /formatAdminCreatedAt = \(value\) => formatKoreanDateTime\(value, '-'\)/);
assert.match(memberHistory, /formatTimestamp = \(value\) => formatKoreanDateTime\(value, '-'\)/);
assert.match(signupTerms, /formatDateTime = \(value\) => formatKoreanDateTime\(value, '-'\)/);
assert.match(dashboardPanel, /currentTimeLabel = formatKoreanDateTime\(nowMillis, '-'\)/);
assert.match(dashboardPanel, /formatKoreanDateTime\(summaryGeneratedAtMillis, '요약 생성 전'\)/);
assert.match(homeBannerPanel, /formatDateTime = \(value\) => formatKoreanDateTime\(value, '-'\)/);
assert.match(dataMaintenance, /formatCheckedAt = \(value\) => formatKoreanDateTime\(value, '기록 없음'\)/);
assert.match(memberAccountPolicy, /formatUserAccountCreatedAt = \(account = \{\}\) =>[\s\S]*formatKoreanDateTime\(account\?\.createdAt, '-'\)/);
assert.match(termsService, /return formatKoreanDateTime\(value, '-'\)/);
assert.doesNotMatch(memberAuthorityService, /dateStyle: 'short'/);
assert.match(memberAuthorityService, /hour12: true/);
assert.match(memberAuthorityService, /second: '2-digit'/);

console.log('[phase34-admin-datetime-consistency-frontend-smoke] PASS');
