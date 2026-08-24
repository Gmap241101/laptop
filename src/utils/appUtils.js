import {
  DISPLAY_STATUS,
  STATUS,
} from '../constants/appConstants.js';

const KOREA_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;
const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const parseLegacyKoreanDateTimeText = (value) => {
  const text = String(value || '').trim();
  const match = text.match(
    /^(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(AM|PM|오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/i
  );
  if (!match) return 0;

  let year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const period = String(match[4] || '').toUpperCase();
  let hour = Number(match[5]);
  const minute = Number(match[6]);
  const second = Number(match[7] || 0);

  if (year < 100) year += 2000;
  const isPm = period === 'PM' || match[4] === '오후';
  const isAm = period === 'AM' || match[4] === '오전';
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;

  if (
    !Number.isFinite(year) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    return 0;
  }

  // The legacy text was formatted in Asia/Seoul without an explicit offset.
  return Date.UTC(year, month - 1, day, hour - 9, minute, second);
};

export const getFirestoreTimestampMillis = (value) => {
  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (Number.isFinite(Number(value?.millis))) {
    return Number(value.millis);
  }

  if (Number.isFinite(Number(value?.milliseconds))) {
    return Number(value.milliseconds);
  }

  if (Number.isFinite(Number(value?.seconds))) {
    return Number(value.seconds) * 1000;
  }

  const legacyTime = parseLegacyKoreanDateTimeText(value);
  if (legacyTime) return legacyTime;

  const parsedTime = Date.parse(value || '');

  return Number.isNaN(parsedTime)
    ? 0
    : parsedTime;
};

export const formatKoreanDateTime = (value, fallback = '-') => {
  const timestampMillis = getFirestoreTimestampMillis(value);
  if (!timestampMillis) return fallback;

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(timestampMillis));
};

export const formatFirestoreTimestamp = (value) =>
  formatKoreanDateTime(value, '-');

export const formatFirestoreDate = (value) => {
  const timestampMillis =
    getFirestoreTimestampMillis(value);

  if (!timestampMillis) {
    return '-';
  }

  return new Date(
    timestampMillis
  ).toLocaleDateString('ko-KR');
};

export const hasRentalPeriodOverlap = (
  existingStartDate,
  existingDueDate,
  nextStartDate,
  nextDueDate
) => {
  if (!existingStartDate || !existingDueDate || !nextStartDate || !nextDueDate) {
    return false;
  }

  return (
    existingStartDate <= nextDueDate &&
    existingDueDate >= nextStartDate
  );
};

export const formatDate = (date) => date.toISOString().slice(0, 10);

export const getKoreaNow = () => new Date(Date.now() + KOREA_TIME_OFFSET_MS);

export const today = () => formatDate(getKoreaNow());

export const getDisplayRentalStatus = (
  status,
  startDate,
  dueDate = ''
) => {
  if (
    status === STATUS.APPROVED &&
    dueDate &&
    dueDate < today()
  ) {
    return '연체';
  }

  if (
    status === STATUS.APPROVED &&
    startDate &&
    startDate > today()
  ) {
    return DISPLAY_STATUS.RESERVED;
  }

  return status || STATUS.AVAILABLE;
};


export const getRequestDisplayStatus = (request = {}) => {
  const status = request?.status || '';
  const actualReturnDate = String(request?.actualReturnDate || '');
  const dueDate = String(request?.dueDate || '');
  const overdueDaysAtReturn = Number(request?.overdueDaysAtReturn || 0);

  if (
    status === STATUS.RETURNED &&
    (
      overdueDaysAtReturn > 0 ||
      (actualReturnDate && dueDate && actualReturnDate > dueDate)
    )
  ) {
    return '연체반납';
  }

  return getDisplayRentalStatus(
    status,
    request?.startDate || '',
    dueDate
  );
};

export const addDaysFrom = (dateStr, days) => {
  if (!dateStr) return '';

  const d = new Date(`${dateStr}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  d.setUTCDate(d.getUTCDate() + Number(days || 0));

  return formatDate(d);
};

export const formatDateWithKoreanWeekday = (dateStr) => {
  if (!dateStr) return '';

  const [year, month, day] = String(dateStr).split('-');
  const d = new Date(`${dateStr}T00:00:00Z`);

  if (!year || !month || !day || Number.isNaN(d.getTime())) {
    return dateStr;
  }

  return `${year}/${month}/${day}(${KOREAN_WEEKDAYS[d.getUTCDay()]})`;
};
