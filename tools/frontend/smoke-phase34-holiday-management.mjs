import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCalendarHolidaySegments } from '../../src/admin/holidayCalendarLayout.js';
import { HOLIDAY_TYPE_LABEL, normalizeHolidayReason } from '../../src/domain/rentalPolicy.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const panelSource = await readFile(path.join(rootDir, 'src/admin/AdminHolidayManagementPanel.jsx'), 'utf8');

assert.deepEqual(
  [HOLIDAY_TYPE_LABEL.public, HOLIDAY_TYPE_LABEL.temporary, HOLIDAY_TYPE_LABEL.substitute, HOLIDAY_TYPE_LABEL.company, HOLIDAY_TYPE_LABEL.manual],
  ['법정공휴일', '임시공휴일', '대체공휴일', '회사지정휴일', '기타휴일']
);
assert.deepEqual(
  normalizeHolidayReason({ type: 'public', name: '대체공휴일(광복절)' }),
  { type: 'substitute', name: '대체공휴일(광복절)' }
);

const cells = Array.from({ length: 42 }, (_, index) => ({ date: `cell-${index}`, holiday: null }));
for (const index of [25, 26, 27]) {
  cells[index] = { ...cells[index], holiday: { reasons: [{ type: 'public', name: '추석' }] } };
}
const chuseokSegments = buildCalendarHolidaySegments(cells);
assert.equal(chuseokSegments.get(3)?.length, 1);
assert.deepEqual(
  chuseokSegments.get(3)?.map((segment) => ({ startCol: segment.startCol, endCol: segment.endCol, label: segment.reason.name, showLabel: segment.showLabel })),
  [{ startCol: 4, endCol: 6, label: '추석', showLabel: true }]
);

const crossWeekCells = Array.from({ length: 42 }, (_, index) => ({
  date: `cross-${index}`,
  holiday: index >= 5 && index <= 8 ? { reasons: [{ type: 'company', name: '창립기념 휴무' }] } : null,
}));
const crossWeekSegments = buildCalendarHolidaySegments(crossWeekCells);
assert.equal(crossWeekSegments.get(0)?.length, 1);
assert.equal(crossWeekSegments.get(1)?.length, 1);
assert.equal(crossWeekSegments.get(0)?.[0]?.showLabel, true);
assert.equal(crossWeekSegments.get(1)?.[0]?.showLabel, false);
assert.equal(crossWeekSegments.get(0)?.[0]?.continuesAfter, true);
assert.equal(crossWeekSegments.get(1)?.[0]?.continuesBefore, true);

const optionLabels = ['법정공휴일', '임시공휴일', '대체공휴일', '회사지정휴일', '기타휴일'];
let previousIndex = -1;
for (const label of optionLabels) {
  const currentIndex = panelSource.indexOf(`label: '${label}'`);
  assert.ok(currentIndex > previousIndex, `${label} option order must be preserved.`);
  previousIndex = currentIndex;
}
assert.ok(panelSource.includes('buildCalendarHolidaySegments(calendarCells)'));
assert.ok(panelSource.includes('segment.startCol / 7'));
assert.ok(panelSource.includes('segment.showLabel'));
assert.ok(!panelSource.includes('<option value="company">회사휴일</option>'));
assert.ok(!panelSource.includes('<option value="manual">수동등록</option>'));
assert.ok(panelSource.includes('border-orange-500 bg-orange-500 text-white shadow-sm'));
assert.ok(panelSource.includes('border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'));
assert.ok(!panelSource.includes("holidayManagementView === 'list'\n                    ? 'bg-slate-900 text-white'"));

console.log('[phase34-holiday-management-smoke] PASS');
