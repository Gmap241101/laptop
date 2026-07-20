import {
  DISPLAY_STATUS,
  STATUS,
} from '../constants/appConstants.js';

const KOREA_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;
const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const getFirestoreTimestampMillis = (value) => {
  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsedTime = Date.parse(value || '');

  return Number.isNaN(parsedTime)
    ? 0
    : parsedTime;
};

export const formatFirestoreTimestamp = (value) => {
  const timestampMillis =
    getFirestoreTimestampMillis(value);

  if (!timestampMillis) {
    return '-';
  }

  return new Date(
    timestampMillis
  ).toLocaleString('ko-KR');
};

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
