import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMemberRentalStatusService } from '../../server/src/rentals/member-rental-status-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const rows = [
  {
    assetId: 'asset-returned-overdue', category: '노트북', assetNo: 'NB-01', model: 'Model A', baseStatus: '대여가능',
    requestId: 'req-returned-overdue', appUserId: '10', startDate: '2026-08-01', dueDate: '2026-08-03', status: '반납완료', actualReturnDate: '2026-08-05', overdueDaysAtReturn: 2,
    currentSummary: Object.freeze({ total: 5, available: 2, requested: 1, reserved: 0, approved: 1, overdue: 1 }),
  },
  {
    assetId: 'asset-active-overdue', category: '노트북', assetNo: 'NB-02', model: 'Model B', baseStatus: '대여가능',
    requestId: 'req-active-overdue', appUserId: '20', startDate: '2026-07-20', dueDate: '2026-08-10', status: '대여중', actualReturnDate: '', overdueDaysAtReturn: 0,
  },
  {
    assetId: 'asset-returned-normal', category: '태블릿', assetNo: 'TB-01', model: 'Model C', baseStatus: '대여가능',
    requestId: 'req-returned-normal', appUserId: '10', startDate: '2026-07-30', dueDate: '2026-08-02', status: '반납완료', actualReturnDate: '2026-08-02', overdueDaysAtReturn: 0,
  },
  {
    assetId: 'asset-review', category: '카메라', assetNo: 'CM-01', model: 'Model D', baseStatus: '대여가능',
    requestId: 'req-review', appUserId: '30', startDate: '2026-08-26', dueDate: '2026-08-28', status: '보류', actualReturnDate: '', overdueDaysAtReturn: 0,
  },
  {
    assetId: 'asset-idle', category: '카메라', assetNo: 'CM-02', model: 'Model E', baseStatus: '대여불가',
    requestId: '', appUserId: '', startDate: '', dueDate: '', status: '', actualReturnDate: '', overdueDaysAtReturn: 0,
  },
];

let receivedRead = null;
const service = createMemberRentalStatusService({
  repository: {
    async readMonth(input) {
      receivedRead = input;
      return rows;
    },
  },
  todayProvider: () => '2026-08-24',
});

const result = await service.getMonth({ appUserId: '10', month: '2026-08' });
assert.deepEqual(receivedRead, { monthStart: '2026-08-01', monthEnd: '2026-08-31', referenceDate: '2026-08-24' });
assert.equal(result.authority, 'postgresql');
assert.equal(result.assets.length, 5);
assert.deepEqual(result.currentSummary, { total: 5, available: 2, requested: 1, reserved: 0, approved: 1, overdue: 1 });
assert.ok(result.categories.includes('노트북') && result.categories.includes('태블릿') && result.categories.includes('카메라'));

const findEvent = (assetId, status) => result.events.find((event) => event.assetId === assetId && event.status === status);
const overdueReturnedEvent = findEvent('asset-returned-overdue', '연체반납');
assert.equal(findEvent('asset-returned-overdue', '반납완료'), undefined, 'an overdue return must be represented by one final-state calendar bar');
assert.deepEqual(
  { startDate: overdueReturnedEvent?.startDate, endDate: overdueReturnedEvent?.endDate },
  { startDate: '2026-08-01', endDate: '2026-08-05' },
  'overdue-return bar must cover the entire actual usage period',
);
assert.equal(overdueReturnedEvent?.dueDate, '2026-08-03');
assert.equal(overdueReturnedEvent?.actualReturnDate, '2026-08-05');
assert.equal(overdueReturnedEvent?.overdueDays, 2);
const activeOverdueEvent = findEvent('asset-active-overdue', '연체중');
assert.equal(findEvent('asset-active-overdue', '대여중'), undefined, 'an active overdue request must be represented by one current-state calendar bar');
assert.deepEqual(
  { startDate: activeOverdueEvent?.startDate, endDate: activeOverdueEvent?.endDate },
  { startDate: '2026-07-20', endDate: '2026-08-24' },
  'active overdue bar must cover the whole usage period through the reference date',
);
assert.equal(activeOverdueEvent?.dueDate, '2026-08-10');
assert.equal(activeOverdueEvent?.overdueDays, 14);
const reviewEvent = findEvent('asset-review', '신청 검토중');
assert.equal(reviewEvent?.status, '신청 검토중');
assert.deepEqual(
  { startDate: reviewEvent?.startDate, endDate: reviewEvent?.endDate },
  { startDate: '2026-08-26', endDate: '2026-08-28' },
  'pending/review status must cover only the requested rental dates, not application date through today',
);
assert.equal(findEvent('asset-returned-normal', '반납완료')?.visibleStartDate, '2026-08-01');
assert.equal(findEvent('asset-returned-normal', '반납완료')?.visibleEndDate, '2026-08-02');
assert.equal(findEvent('asset-returned-normal', '반납완료')?.isMine, true);
assert.equal(activeOverdueEvent?.isMine, false);
assert.equal('requestId' in activeOverdueEvent, false, 'other-member request IDs must not be projected');
for (const event of result.events) {
  assert.equal('requesterName' in event, false);
  assert.equal('requesterEmail' in event, false);
  assert.equal('requesterPhone' in event, false);
  assert.equal('requesterTeam' in event, false);
  assert.equal('purpose' in event, false);
  assert.equal('adminMemo' in event, false);
}
await assert.rejects(() => service.getMonth({ appUserId: '10', month: '2026/08' }), (error) => error?.code === 'member_rental_status_month_invalid');

const repositorySource = read('server/src/rentals/member-rental-status-repository.mjs');
const serviceSource = read('server/src/rentals/member-rental-status-service.mjs');
const appSource = read('server/src/app.mjs');
const indexSource = read('server/src/index.mjs');
assert.ok(repositorySource.includes("request.status IN ('신청중', '보류', '대여중', '반납완료')"));
assert.ok(repositorySource.includes('LEFT JOIN app_rental_asset_reservation_guards guard'), 'active blocking periods must prefer reservation-guard dates');
assert.ok(repositorySource.includes('COALESCE(guard.start_date, request.start_date)'), 'calendar start dates must follow the active reservation guard when present');
assert.ok(repositorySource.includes('COALESCE(guard.due_date, request.due_date)'), 'calendar due dates must follow the active reservation guard when present');
assert.ok(repositorySource.includes('request.actual_return_date'));
assert.ok(repositorySource.includes('request.overdue_days_at_return'));
assert.ok(repositorySource.includes('current_summary AS'));
assert.ok(!repositorySource.includes('requester_name') && !repositorySource.includes('requester_email') && !repositorySource.includes('purpose'));
assert.ok(serviceSource.includes("add('연체중', startDate, referenceDate"));
assert.ok(serviceSource.includes("add('연체반납', startDate, actualReturnDate"));
assert.ok(serviceSource.includes("add('신청 검토중', startDate, dueDate"), 'pending review must use requested start/due dates');
assert.ok(serviceSource.includes('naturalTextCompare'), 'calendar service must naturally order categories/assets/events');
assert.equal(serviceSource.includes("add('대여중', startDate, dueDate);\n      add('연체중'"), false, 'overdue requests must not be split into normal and overdue bars');
assert.ok(appSource.includes("url.pathname === '/api/users/me/rental-status'"));
assert.ok(appSource.includes("memberStatus !== 'active'"));
assert.ok(appSource.includes("siteSettingsDocument?.payload?.memberRentalStatusEnabled !== false"));
assert.ok(indexSource.includes('createMemberRentalStatusRepository'));
assert.ok(indexSource.includes('memberRentalStatusService,'));

console.log(`Phase 34 member rental status backend smoke: PASS (${result.events.length} projected calendar events)`);
