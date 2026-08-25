const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const errorWith = (code, message, status) => Object.assign(new Error(message), { code, status });

const koreaToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const addDays = (dateText, days) => {
  if (!DATE_PATTERN.test(String(dateText || ''))) return '';
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

const differenceInDays = (startDate, endDate) => {
  if (!DATE_PATTERN.test(String(startDate || '')) || !DATE_PATTERN.test(String(endDate || ''))) return 0;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 86400000);
};

const endOfMonth = (year, month) => {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
};

const normalizeMonth = (monthValue) => {
  const value = String(monthValue || '').trim();
  const match = value.match(MONTH_PATTERN);
  if (!match) throw errorWith('member_rental_status_month_invalid', 'Month must use YYYY-MM format.', 400);
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) throw errorWith('member_rental_status_month_invalid', 'Month is outside the supported range.', 400);
  const month = Number(match[2]);
  return Object.freeze({ value, year, month, start: `${value}-01`, end: endOfMonth(year, month) });
};

const overlaps = (startDate, endDate, monthStart, monthEnd) =>
  Boolean(startDate && endDate && startDate <= monthEnd && endDate >= monthStart);

const clampSegment = (segment, monthStart, monthEnd) => {
  if (!overlaps(segment.startDate, segment.endDate, monthStart, monthEnd)) return null;
  return Object.freeze({
    ...segment,
    visibleStartDate: segment.startDate < monthStart ? monthStart : segment.startDate,
    visibleEndDate: segment.endDate > monthEnd ? monthEnd : segment.endDate,
  });
};

const buildSegments = ({ row, referenceDate, isMine, monthStart, monthEnd }) => {
  const startDate = row.startDate;
  const dueDate = row.dueDate;
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(dueDate)) return [];
  const common = {
    assetId: row.assetId,
    category: row.category,
    assetNo: row.assetNo,
    model: row.model,
    dueDate,
    isMine,
    ...(isMine && row.requestId ? { requestId: row.requestId } : {}),
  };
  const segments = [];
  const add = (status, segmentStart, segmentEnd, details = {}) => {
    if (!segmentStart || !segmentEnd || segmentEnd < segmentStart) return;
    const projected = clampSegment(
      { ...common, ...details, status, startDate: segmentStart, endDate: segmentEnd },
      monthStart,
      monthEnd,
    );
    if (projected) segments.push(projected);
  };

  if (row.status === '신청중' || row.status === '보류') {
    add('신청 검토중', startDate, dueDate);
    return segments;
  }

  if (row.status === '대여중') {
    if (startDate > referenceDate) {
      add('예약중', startDate, dueDate);
    } else if (dueDate < referenceDate) {
      add('연체중', startDate, referenceDate, {
        overdueDays: differenceInDays(dueDate, referenceDate),
      });
    } else {
      add('대여중', startDate, dueDate);
    }
    return segments;
  }

  if (row.status === '반납완료') {
    const explicitReturnDate = DATE_PATTERN.test(row.actualReturnDate) ? row.actualReturnDate : '';
    const calculatedReturnDate = Number(row.overdueDaysAtReturn || 0) > 0
      ? addDays(dueDate, row.overdueDaysAtReturn)
      : '';
    const actualReturnDate = explicitReturnDate || calculatedReturnDate || dueDate;
    const overdueDays = Number(row.overdueDaysAtReturn || 0) > 0
      ? Number(row.overdueDaysAtReturn)
      : differenceInDays(dueDate, actualReturnDate);
    if (actualReturnDate > dueDate) {
      add('연체반납', startDate, actualReturnDate, {
        actualReturnDate,
        overdueDays,
      });
    } else {
      add('반납완료', startDate, actualReturnDate, {
        actualReturnDate,
        overdueDays: 0,
      });
    }
  }

  return segments;
};

export const createMemberRentalStatusService = ({ repository, todayProvider = koreaToday }) => {
  if (!repository || typeof repository.readMonth !== 'function') {
    throw new TypeError('Member rental status repository is required.');
  }

  return Object.freeze({
    async getMonth({ appUserId, month }) {
      const normalizedMonth = normalizeMonth(month);
      const referenceDate = String(todayProvider() || '').trim();
      if (!DATE_PATTERN.test(referenceDate)) {
        throw errorWith('member_rental_status_reference_date_invalid', 'Reference date is unavailable.', 503);
      }
      const rows = await repository.readMonth({
        monthStart: normalizedMonth.start,
        monthEnd: normalizedMonth.end,
        referenceDate,
      });

      const assetsById = new Map();
      const categories = [];
      const categorySet = new Set();
      const events = [];
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!row?.assetId) return;
        if (!assetsById.has(row.assetId)) {
          assetsById.set(row.assetId, Object.freeze({
            id: row.assetId,
            category: row.category,
            assetNo: row.assetNo,
            model: row.model,
            baseStatus: row.baseStatus,
          }));
        }
        if (row.category && !categorySet.has(row.category)) {
          categorySet.add(row.category);
          categories.push(row.category);
        }
        if (!row.requestId) return;
        const isMine = String(row.appUserId || '') === String(appUserId || '');
        events.push(...buildSegments({
          row,
          referenceDate,
          isMine,
          monthStart: normalizedMonth.start,
          monthEnd: normalizedMonth.end,
        }));
      });

      events.sort((left, right) =>
        left.visibleStartDate.localeCompare(right.visibleStartDate) ||
        left.assetNo.localeCompare(right.assetNo, 'ko') ||
        left.status.localeCompare(right.status, 'ko'));

      const currentSummary = rows?.[0]?.currentSummary || Object.freeze({ total: 0, available: 0, requested: 0, reserved: 0, approved: 0, overdue: 0 });

      return Object.freeze({
        authority: 'postgresql',
        month: normalizedMonth.value,
        monthStart: normalizedMonth.start,
        monthEnd: normalizedMonth.end,
        referenceDate,
        currentSummary,
        categories: Object.freeze(categories),
        assets: Object.freeze([...assetsById.values()]),
        events: Object.freeze(events),
      });
    },
  });
};
