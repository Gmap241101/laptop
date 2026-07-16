import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query as firestoreQuery,
  runTransaction,
  setDoc,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Laptop,
  LayoutDashboard,
  Users,
  ClipboardList,
  Settings,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Save,
  Trash2,
  Edit3,
  ShieldCheck,
  AlertCircle,
  X,
  Info,
  UserPlus,
  LogIn,
  UserCircle,
  LogOut,
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyA-hQv4mZwrTWUn10aiS3QSLgwSWzBNds0",
  authDomain: "laptop-system-mk.firebaseapp.com",
  projectId: "laptop-system-mk",
  storageBucket: "laptop-system-mk.firebasestorage.app",
  messagingSenderId: "978421108190",
  appId: "1:978421108190:web:6bc9af49a57471ae2a614f"
};

const firebaseApp = getApps().some((app) => app.name === '[DEFAULT]')
  ? getApp()
  : initializeApp(firebaseConfig);

const adminAccountCreationApp = getApps().some(
  (app) => app.name === 'adminAccountCreation'
)
  ? getApp('adminAccountCreation')
  : initializeApp(firebaseConfig, 'adminAccountCreation');

const db = getFirestore(firebaseApp);
const firebaseAuth = getAuth(firebaseApp);
const adminAccountCreationAuth = getAuth(adminAccountCreationApp);
const ADMIN_ACCOUNTS_COLLECTION_REF = collection(db, 'adminAccounts');
const RENTAL_REQUESTS_COLLECTION_REF = collection(db, 'rentalRequests');

const RENTAL_REQUEST_LOGS_COLLECTION_REF = collection(
  db,
  'rentalRequestLogs'
);

const NOTICE_POSTS_COLLECTION_REF = collection(
  db,
  'noticePosts'
);

const NOTICE_BOARD_CONFIG_DOC_REF = doc(
  db,
  'noticeBoard',
  'config'
);

const FAQ_POSTS_COLLECTION_REF = collection(
  db,
  'faqPosts'
);

const FAQ_CATEGORIES_COLLECTION_REF = collection(
  db,
  'faqCategories'
);

const FAQ_BOARD_CONFIG_DOC_REF = doc(
  db,
  'faqBoard',
  'config'
);

const USER_ACCOUNTS_COLLECTION_NAME = 'userAccounts';
const USER_ACCOUNTS_COLLECTION_REF = collection(
  db,
  USER_ACCOUNTS_COLLECTION_NAME
);

const PUBLIC_CONFIG_DOC_REF = doc(
  db,
  'rentalSystem',
  'publicConfig'
);

const RENTAL_ASSETS_COLLECTION_REF = collection(
  db,
  'rentalAssets'
);

const RENTAL_AVAILABILITY_COLLECTION_REF = collection(
  db,
  'rentalAvailability'
);

const RENTAL_BORROWERS_COLLECTION_REF = collection(
  db,
  'rentalBorrowers'
);

const RENTAL_ASSET_NUMBERS_COLLECTION_REF = collection(
  db,
  'rentalAssetNumbers'
);

const SPLIT_STORAGE_VERSION = 2;

// Firestore 배치 최대 500건보다 여유 있게 400건씩 처리
const FIRESTORE_BATCH_WRITE_LIMIT = 400;

// --- 상태 및 스타일 정의 ---
const STATUS = {
  AVAILABLE: '대여가능',
  REQUESTED: '신청중',
  APPROVED: '대여중',
  ON_HOLD: '보류',
  DENIED: '불허',
  RETURNED: '반납완료',
  USER_CANCELLED: '사용자취소',
  UNAVAILABLE: '대여불가',
};

const DISPLAY_STATUS = {
  RESERVED: '예약중',
};

const statusStyle = {
  '대여가능': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '신청중': 'bg-amber-50 text-amber-700 border-amber-200',
  [DISPLAY_STATUS.RESERVED]: 'bg-sky-50 text-sky-700 border-sky-200',
  '대여중': 'bg-blue-50 text-blue-700 border-blue-200',
  '연체': 'bg-rose-50 text-rose-700 border-rose-200',
  '보류': 'bg-purple-50 text-purple-700 border-purple-200',
  '불허': 'bg-rose-50 text-rose-700 border-rose-200',
  '반납완료': 'bg-slate-100 text-slate-700 border-slate-200',
  '사용자취소': 'bg-slate-100 text-slate-600 border-slate-300',
  '대여불가': 'bg-rose-100 text-rose-800 border-rose-300',
};

const RENTAL_BLOCKING_REQUEST_STATUSES = [
  STATUS.REQUESTED,
  STATUS.APPROVED,
  STATUS.ON_HOLD,
];

const RENTAL_REQUEST_AUDIT_ACTION = {
  STATUS_CHANGED: 'status-changed',
  STATUS_RESTORED: 'status-restored',
  REQUEST_EDITED: 'request-edited',
  MEMO_CHANGED: 'memo-changed',
  USER_ACTION_REVIEWED: 'user-action-reviewed',
};

const USER_REQUEST_ACTION = {
  CHANGE: 'change',
  CANCEL: 'cancel',
  EXTEND: 'extend',
  RETURN: 'return',
};

const USER_REQUEST_REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
};

const getUserRequestActionLabel = (type) => {
  if (type === USER_REQUEST_ACTION.CHANGE) return '신청 변경 요청';
  if (type === USER_REQUEST_ACTION.CANCEL) return '신청 취소 요청';
  if (type === USER_REQUEST_ACTION.EXTEND) return '대여 연장 요청';
  if (type === USER_REQUEST_ACTION.RETURN) return '조기 반납 요청';

  return '사용자 요청';
};

const getUserRequestReviewStatusLabel = (status) => {
  if (status === USER_REQUEST_REVIEW_STATUS.PENDING) return '검토 대기';
  if (status === USER_REQUEST_REVIEW_STATUS.APPROVED) return '승인';
  if (status === USER_REQUEST_REVIEW_STATUS.DENIED) return '불허';

  return '상태 미지정';
};

const createDefaultUserActionForm = () => ({
  type: '',
  reason: '',
  team: '',
  borrower: '',
  startDate: '',
  dueDate: '',
  purpose: '',
});

const DEFAULT_NOTICE_POSTS_PER_PAGE = 10;

const NOTICE_POSTS_PER_PAGE_OPTIONS = [
  5,
  10,
  15,
  20,
  30,
  50,
];

const getSafeNoticePostsPerPage = (value) => {
  const parsedValue = Math.trunc(Number(value));

  return parsedValue >= 5 &&
    parsedValue <= 50
    ? parsedValue
    : DEFAULT_NOTICE_POSTS_PER_PAGE;
};

const createDefaultNoticePostForm = () => ({
  title: '',
  content: '',
  isPinned: false,
});

const DEFAULT_FAQ_POSTS_PER_PAGE = 10;

const FAQ_POSTS_PER_PAGE_OPTIONS = [
  5,
  10,
  15,
  20,
  30,
  50,
];

const getSafeFaqPostsPerPage = (value) => {
  const parsedValue = Math.trunc(Number(value));

  return parsedValue >= 5 &&
    parsedValue <= 50
    ? parsedValue
    : DEFAULT_FAQ_POSTS_PER_PAGE;
};

const createDefaultFaqPostForm = () => ({
  categoryId: '',
  title: '',
  content: '',
  isPinned: false,
});

const ADMIN_REQUEST_TAB = {
  PENDING: 'pending',
  RENTAL: 'rental',
  CLOSED: 'closed',
  RETURNED: 'returned',
};

const ADMIN_REQUEST_PAGE_SIZE_OPTIONS = [
  5,
  10,
  15,
  20,
  30,
  50,
];

const createDefaultAdminRequestEditForm = (
  request = {}
) => ({
  team: request.team || '',
  borrower: request.borrower || '',
  startDate: request.startDate || '',
  dueDate: request.dueDate || '',
  purpose: request.purpose || '',
  adminMemo: request.adminMemo || '',
});

const RENTAL_REQUEST_RESTORE_TARGETS = {
  [STATUS.REQUESTED]: [],
  [STATUS.APPROVED]: [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
  ],
  [STATUS.ON_HOLD]: [
    STATUS.REQUESTED,
  ],
  [STATUS.DENIED]: [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
    STATUS.APPROVED,
  ],
  [STATUS.RETURNED]: [
    STATUS.APPROVED,
  ],
  [STATUS.USER_CANCELLED]: [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
  ],
};

const RENTAL_REQUEST_STATUS_TRANSITIONS = {
  [STATUS.REQUESTED]: [
    STATUS.APPROVED,
    STATUS.ON_HOLD,
    STATUS.DENIED,
    STATUS.USER_CANCELLED,
  ],

  [STATUS.APPROVED]: [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
    STATUS.DENIED,
    STATUS.RETURNED,
  ],

  [STATUS.ON_HOLD]: [
    STATUS.REQUESTED,
    STATUS.APPROVED,
    STATUS.DENIED,
    STATUS.USER_CANCELLED,
  ],

  [STATUS.DENIED]: [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
    STATUS.APPROVED,
  ],

  [STATUS.RETURNED]: [
    STATUS.APPROVED,
  ],

  [STATUS.USER_CANCELLED]: [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
  ],
};

const getFirestoreTimestampMillis = (value) => {
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

const formatFirestoreTimestamp = (value) => {
  const timestampMillis =
    getFirestoreTimestampMillis(value);

  if (!timestampMillis) {
    return '-';
  }

  return new Date(
    timestampMillis
  ).toLocaleString('ko-KR');
};

const formatFirestoreDate = (value) => {
  const timestampMillis =
    getFirestoreTimestampMillis(value);

  if (!timestampMillis) {
    return '-';
  }

  return new Date(
    timestampMillis
  ).toLocaleDateString('ko-KR');
};

const hasRentalPeriodOverlap = (
  existingStartDate,
  existingDueDate,
  nextStartDate,
  nextDueDate
) => {
  if (!existingStartDate || !existingDueDate || !nextStartDate || !nextDueDate) {
    return false;
  }

  return existingStartDate <= nextDueDate && nextStartDate <= existingDueDate;
};

const findSameAssetBlockingRequest = (requests = [], laptopId) => {
  return requests.find(
    (request) =>
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status)
  );
};

const findSameAssetPeriodOverlappingRequest = (
  requests = [],
  laptopId,
  startDate,
  dueDate
) => {
  return requests.find(
    (request) =>
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status) &&
      hasRentalPeriodOverlap(
        request.startDate,
        request.dueDate,
        startDate,
        dueDate
      )
  );
};

const getLaptopRentalAvailability = (
  laptop,
  requests = [],
  settings = {},
  startDate = '',
  dueDate = ''
) => {
  if (!laptop) {
    return {
      blocked: true,
      status: STATUS.UNAVAILABLE,
      reason: 'notFound',
      blockingRequest: null,
    };
  }

  if (laptop.status === STATUS.UNAVAILABLE) {
    return {
      blocked: true,
      status: STATUS.UNAVAILABLE,
      reason: 'assetUnavailable',
      blockingRequest: null,
    };
  }

  const shouldAllowNonOverlappingSameAssetRequests =
    settings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  if (shouldAllowNonOverlappingSameAssetRequests && startDate && dueDate) {
    const periodBlockingRequest = findSameAssetPeriodOverlappingRequest(
      requests,
      laptop.id,
      startDate,
      dueDate
    );

    return {
      blocked: Boolean(periodBlockingRequest),
      status: periodBlockingRequest?.status || STATUS.AVAILABLE,
      reason: periodBlockingRequest ? 'periodOverlap' : '',
      blockingRequest: periodBlockingRequest || null,
    };
  }

  const blockingRequest = findSameAssetBlockingRequest(requests, laptop.id);

  return {
    blocked: Boolean(blockingRequest),
    status: blockingRequest?.status || STATUS.AVAILABLE,
    reason: blockingRequest ? 'currentStatus' : '',
    blockingRequest: blockingRequest || null,
  };
};

const KOREA_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_MAX_RENTAL_DAYS = 14;
const DEFAULT_ADJUST_START_DATE_AFTER_WORK_END = true;
const DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY = true;
const DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE = true;
const DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE = true;
const DEFAULT_WORK_END_TIME = '18:00';
const DEFAULT_HOLIDAY_TYPE = 'company';
const DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS = false;

const HOLIDAY_TYPE_LABEL = {
  public: '법정공휴일',
  temporary: '임시공휴일',
  company: '회사휴일',
  manual: '수동등록',
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const getKoreaNow = () => new Date(Date.now() + KOREA_TIME_OFFSET_MS);

const today = () => formatDate(getKoreaNow());

const getDisplayRentalStatus = (
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

const getLaptopRepresentativeRequest = (requests = [], laptopId) => {
  const blockingRequests = requests.filter(
    (request) =>
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status)
  );

  if (blockingRequests.length === 0) {
    return null;
  }

  const todayDate = today();

  const sortByStartDate = (a, b) =>
    String(a.startDate || '').localeCompare(String(b.startDate || ''));

  const activeRentalRequest = blockingRequests
    .filter(
      (request) =>
        request.status === STATUS.APPROVED &&
        (!request.startDate || request.startDate <= todayDate)
    )
    .sort(sortByStartDate)[0];

  const reservedRequest = blockingRequests
    .filter(
      (request) =>
        request.status === STATUS.APPROVED &&
        request.startDate &&
        request.startDate > todayDate
    )
    .sort(sortByStartDate)[0];

  const requestedRequest = blockingRequests
    .filter((request) => request.status === STATUS.REQUESTED)
    .sort(sortByStartDate)[0];

  const onHoldRequest = blockingRequests
    .filter((request) => request.status === STATUS.ON_HOLD)
    .sort(sortByStartDate)[0];

  return activeRentalRequest || reservedRequest || requestedRequest || onHoldRequest || null;
};

const getLaptopAdminDisplayStatus = (laptop, requests = []) => {
  if (!laptop) {
    return STATUS.UNAVAILABLE;
  }

  if (laptop.status === STATUS.UNAVAILABLE) {
    return STATUS.UNAVAILABLE;
  }

  const representativeRequest = getLaptopRepresentativeRequest(requests, laptop.id);

  if (!representativeRequest) {
    return STATUS.AVAILABLE;
  }

  return getDisplayRentalStatus(
    representativeRequest.status,
    representativeRequest.startDate
  );
};

const addDays = (days) => addDaysFrom(today(), days);

// 특정 날짜 문자열 기준으로 일수를 더하는 헬퍼 함수
const addDaysFrom = (dateStr, days) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return formatDate(d);
};

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatDateWithKoreanWeekday = (dateStr) => {
  if (!dateStr) return '';

  const [year, month, day] = String(dateStr).split('-');
  const d = new Date(`${dateStr}T00:00:00Z`);

  if (!year || !month || !day || Number.isNaN(d.getTime())) {
    return dateStr;
  }

  return `${year}/${month}/${day}(${KOREAN_WEEKDAYS[d.getUTCDay()]})`;
};

const parseTimeToMinutes = (timeString) => {
  const [hours, minutes] = String(timeString || DEFAULT_WORK_END_TIME)
    .split(':')
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 18 * 60;
  }

  return hours * 60 + minutes;
};

// 한국시간 기준 설정된 업무 종료 시간을 넘으면 다음날을 기본 후보일로 사용
const isKoreaNowAfterTime = (timeString) => {
  const koreaNow = getKoreaNow();
  const nowMinutes = koreaNow.getUTCHours() * 60 + koreaNow.getUTCMinutes();
  const workEndMinutes = parseTimeToMinutes(timeString);

  return (
    nowMinutes > workEndMinutes ||
    (nowMinutes === workEndMinutes &&
      (koreaNow.getUTCSeconds() > 0 ||
        koreaNow.getUTCMilliseconds() > 0))
  );
};

const getBusinessDayAdjustmentEnabled = (settings = {}) =>
  settings.adjustStartDateToNextBusinessDay ??
  settings.adjustStartDateAfterWorkEnd ??
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY;

const getHolidayList = (settings = {}) =>
  Array.isArray(settings.holidays) ? settings.holidays : [];

const getEnabledHoliday = (dateStr, settings = {}) =>
  getHolidayList(settings).find(
    (holiday) => holiday?.enabled !== false && holiday.date === dateStr
  );

const isWeekendDate = (dateStr) => {
  if (!dateStr) return false;

  const d = new Date(`${dateStr}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) {
    return false;
  }

  const day = d.getUTCDay();
  return day === 0 || day === 6;
};

const isHolidayDate = (dateStr, settings = {}) => {
  const shouldExcludeHolidays =
    settings.excludeHolidaysForStartDate ?? DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE;

  if (!shouldExcludeHolidays) {
    return false;
  }

  return Boolean(getEnabledHoliday(dateStr, settings));
};

const getNonBusinessDayReason = (dateStr, settings = {}) => {
  const shouldExcludeWeekends =
    settings.excludeWeekendsForStartDate ?? DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE;

  if (shouldExcludeWeekends && isWeekendDate(dateStr)) {
    return '주말';
  }

  const holiday = getEnabledHoliday(dateStr, settings);

  if (
    (settings.excludeHolidaysForStartDate ?? DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE) &&
    holiday
  ) {
    return holiday.name || HOLIDAY_TYPE_LABEL[holiday.type] || '등록 휴일';
  }

  return '';
};

const isBusinessDay = (dateStr, settings = {}) => {
  if (!dateStr) return false;

  const shouldExcludeWeekends =
    settings.excludeWeekendsForStartDate ?? DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE;

  if (shouldExcludeWeekends && isWeekendDate(dateStr)) {
    return false;
  }

  if (isHolidayDate(dateStr, settings)) {
    return false;
  }

  return true;
};

const getNextBusinessDay = (dateStr, settings = {}) => {
  let candidateDate = dateStr || today();

  for (let i = 0; i < 370; i += 1) {
    if (isBusinessDay(candidateDate, settings)) {
      return candidateDate;
    }

    candidateDate = addDaysFrom(candidateDate, 1);
  }

  return candidateDate;
};

const getAdjustedRentalStartDate = (dateStr, settings = {}) => {
  const minDate = today();
  const candidateDate = !dateStr || dateStr < minDate ? minDate : dateStr;

  if (!getBusinessDayAdjustmentEnabled(settings)) {
    return candidateDate;
  }

  return getNextBusinessDay(candidateDate, settings);
};

const getSafeMaxRentalDays = (settings = {}) => {
  const parsedMaxRentalDays = Number(settings.maxRentalDays ?? DEFAULT_MAX_RENTAL_DAYS);

  if (
    Number.isNaN(parsedMaxRentalDays) ||
    parsedMaxRentalDays < 1
  ) {
    return DEFAULT_MAX_RENTAL_DAYS;
  }

  return parsedMaxRentalDays;
};

const getMaxRentalDueDate = (startDate, settings = {}) => {
  return addDaysFrom(startDate, getSafeMaxRentalDays(settings));
};

const isTemporaryDateInputValue = (dateStr) => {
  const match = String(dateStr || '').match(/^(\d{4})-\d{2}-\d{2}$/);

  if (!match) {
    return false;
  }

  return Number(match[1]) < 1000;
};

const defaultRentalStartDate = (settings = {}) => {
  const shouldAdjustToNextBusinessDay = getBusinessDayAdjustmentEnabled(settings);
  const shouldMoveAfterWorkEnd =
    shouldAdjustToNextBusinessDay &&
    isKoreaNowAfterTime(settings.workEndTime || DEFAULT_WORK_END_TIME);

  const candidateDate = shouldMoveAfterWorkEnd
    ? addDaysFrom(today(), 1)
    : today();

  if (!shouldAdjustToNextBusinessDay) {
    return candidateDate;
  }

  return getNextBusinessDay(candidateDate, settings);
};

const getRentalStartAdjustmentInfo = (settings = {}) => {
  if (!getBusinessDayAdjustmentEnabled(settings)) {
    return { adjusted: false, adjustedDate: today(), reasons: [] };
  }

  const isAfterWorkEnd = isKoreaNowAfterTime(settings.workEndTime || DEFAULT_WORK_END_TIME);
  const candidateDate = isAfterWorkEnd ? addDaysFrom(today(), 1) : today();
  const adjustedDate = getNextBusinessDay(candidateDate, settings);

  const reasons = [];

  if (isAfterWorkEnd) {
    reasons.push(`업무 종료 시간(${settings.workEndTime || DEFAULT_WORK_END_TIME}) 이후`);
  }

  let checkingDate = candidateDate;
  for (let i = 0; i < 370 && checkingDate < adjustedDate; i += 1) {
    const reason = getNonBusinessDayReason(checkingDate, settings);

    if (reason && !reasons.includes(reason)) {
      reasons.push(reason);
    }

    checkingDate = addDaysFrom(checkingDate, 1);
  }

  return {
    adjusted: adjustedDate !== today() || reasons.length > 0,
    adjustedDate,
    reasons,
  };
};

const createDefaultRequestForm = (settings = {}) => {
  const startDate = defaultRentalStartDate(settings);

  return {
    team: '',
    borrower: '',
    startDate,
    dueDate: getMaxRentalDueDate(startDate, settings),
    purpose: '',
  };
};

// --- 초기 자산 데이터 생성 ---
function seedLaptops() {
  return Array.from({ length: 15 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const makers = ['LG Gram 16 Pro', 'Samsung Galaxy Book 4', 'Dell Latitude 5540', 'Lenovo ThinkPad L14', 'HP EliteBook 840'];
    const maker = makers[i % makers.length];
    return {
      id: `NB-${n}`,
      category: '노트북',
      assetNo: `LAPTOP-${new Date().getFullYear()}-${n}`,
      serialNo: `SN-${new Date().getFullYear()}-${10000 + i * 37}`,
      model: maker,
      manufactureDate: `${2022 + (i % 4)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: i % 7 === 0 ? '배터리 상태 확인 필요' : i % 5 === 0 ? 'HDMI 젠더 파우치 수납' : '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    };
  });
}

const initialData = {
  laptops: seedLaptops(),
  requests: [],
  assetCategories: ['노트북'],
  teams: ['매일경제아카데미', '채용대행팀', '문항개발팀', '경제교육팀'],
  borrowers: [],
  settings: {
    teamInputMode: 'dropdown',
    borrowerInputMode: 'dropdown',
    maxRentalDays: DEFAULT_MAX_RENTAL_DAYS,
    adjustStartDateAfterWorkEnd: DEFAULT_ADJUST_START_DATE_AFTER_WORK_END,
    adjustStartDateToNextBusinessDay: DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
    excludeWeekendsForStartDate: DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
    excludeHolidaysForStartDate: DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    workEndTime: DEFAULT_WORK_END_TIME,
    holidays: [],
    requireAdminApproval: true,
    allowNonOverlappingSameAssetRequests: DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  },
};

function normalizeBorrowers(borrowers, teams) {
  return borrowers
    .map((borrower, index) => {
      if (typeof borrower === 'string') {
        return {
          id: '',
          name: borrower,
          team: teams[index % teams.length] || '',
          sortOrder: index,
        };
      }

      return {
        id: borrower.id || '',
        name: borrower.name || '',
        team: borrower.team || teams[0] || '',
        sortOrder:
          Number.isFinite(Number(borrower.sortOrder))
            ? Number(borrower.sortOrder)
            : index,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeAdminAccounts(adminAccounts) {
  if (!Array.isArray(adminAccounts)) return [];

  return adminAccounts
    .filter((account) => account && (account.adminLoginId || account.id))
    .map((account, index) => ({
      id: account.id || account.authUid || `ADMIN-LEGACY-${index}`,
      adminLoginId: account.adminLoginId || '',
      authUid: account.authUid || '',
      authEmail: account.authEmail || account.email || '',
      authProvider: account.authProvider || '',
      authLinkedAt: account.authLinkedAt || '',
      passwordHash: account.passwordHash || '',
      passwordSalt: account.passwordSalt || '',
      passwordHashAlgorithm:
        account.passwordHashAlgorithm ||
        account.passwordHashAlgorith ||
        (account.authUid ? 'Firebase Auth' : 'SHA-256'),
      passwordHashIterations: Number(account.passwordHashIterations) || 0,
      failedLoginCount: Number(account.failedLoginCount) || 0,
      lockUntil: Number(account.lockUntil) || 0,
      lastLoginAt: account.lastLoginAt || '',
      passwordChangedAt: account.passwordChangedAt || '',
      organizationName: account.organizationName || '',
      userName: account.userName || '',
      email: account.email || '',
      phone: account.phone || '',
      createdAt: account.createdAt || '',
      updatedAt: account.updatedAt || '',
    }));
}

function stripAdminAccountsFromData(sourceData) {
  const { adminAccounts: _adminAccounts, ...dataWithoutAdminAccounts } = sourceData || {};

  return dataWithoutAdminAccounts;
}

function toRentalAvailabilityRequest(request = {}) {
  return {
    id: request.id || '',
    laptopId: request.laptopId || '',
    assetCategory: request.assetCategory || '기기',
    assetNo: request.assetNo || '',
    startDate: request.startDate || '',
    dueDate: request.dueDate || '',
    status: request.status || STATUS.REQUESTED,
  };
}

const normalizeAssetReservations = (reservations = []) =>
  (Array.isArray(reservations) ? reservations : [])
    .filter(
      (request) =>
        request?.id &&
        request?.laptopId &&
        RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status)
    )
    .map((request) => toRentalAvailabilityRequest(request));

const normalizeAssetNumber = (assetNo) =>
  String(assetNo || '').trim().toLowerCase();

const getAssetNumberRegistryId = (assetNo) =>
  encodeURIComponent(normalizeAssetNumber(assetNo));

const createBorrowerDocumentId = () =>
  `BORROWER-${doc(RENTAL_BORROWERS_COLLECTION_REF).id}`;

const commitFirestoreOperations = async (
  operations,
  batchLimit = FIRESTORE_BATCH_WRITE_LIMIT
) => {
  for (
    let startIndex = 0;
    startIndex < operations.length;
    startIndex += batchLimit
  ) {
    const operationChunk = operations.slice(
      startIndex,
      startIndex + batchLimit
    );

    const batch = writeBatch(db);

    operationChunk.forEach((operation) => {
      if (operation.type === 'delete') {
        batch.delete(operation.ref);
        return;
      }

      if (operation.type === 'update') {
        batch.update(operation.ref, operation.data);
        return;
      }

      if (operation.options) {
        batch.set(
          operation.ref,
          operation.data,
          operation.options
        );
        return;
      }

      batch.set(
        operation.ref,
        operation.data
      );
    });

    await batch.commit();
  }
};

function mergePersistedData(rawData) {
  const parsed = { ...initialData, ...(rawData || {}) };
  const assetCategories = Array.isArray(parsed.assetCategories) && parsed.assetCategories.length > 0
    ? parsed.assetCategories
    : initialData.assetCategories;

  const rawSettings = parsed.settings || {};
  const settings = {
    ...initialData.settings,
    ...rawSettings,
  };

  settings.adjustStartDateToNextBusinessDay =
    rawSettings.adjustStartDateToNextBusinessDay ??
    rawSettings.adjustStartDateAfterWorkEnd ??
    initialData.settings.adjustStartDateToNextBusinessDay;

  settings.adjustStartDateAfterWorkEnd = settings.adjustStartDateToNextBusinessDay;
  settings.excludeWeekendsForStartDate =
    rawSettings.excludeWeekendsForStartDate ??
    initialData.settings.excludeWeekendsForStartDate;
  settings.excludeHolidaysForStartDate =
    rawSettings.excludeHolidaysForStartDate ??
    initialData.settings.excludeHolidaysForStartDate;
  settings.allowNonOverlappingSameAssetRequests =
    rawSettings.allowNonOverlappingSameAssetRequests ??
    initialData.settings.allowNonOverlappingSameAssetRequests;
  settings.holidays = Array.isArray(settings.holidays)
    ? settings.holidays
        .filter((holiday) => holiday && holiday.date)
        .map((holiday) => ({
          date: holiday.date,
          name: holiday.name || '',
          type: holiday.type || DEFAULT_HOLIDAY_TYPE,
          enabled: holiday.enabled !== false,
        }))
    : [];

  const parsedWithoutAdminAccounts = stripAdminAccountsFromData(parsed);

  return {
    ...parsedWithoutAdminAccounts,
    assetCategories,
    settings,
    laptops: (parsed.laptops || []).map((asset) => ({
      ...asset,
      category: asset.category || assetCategories[0] || '노트북',
      reservations: normalizeAssetReservations(asset.reservations || []),
    })),
    borrowers: normalizeBorrowers(parsed.borrowers || [], parsed.teams || []),
  };
}

// --- 공통 고품질 UI 컴포넌트 내장 정의 (카드, 버튼 등) ---
function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardContent({ children, className = '' }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

function Badge({ children }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${statusStyle[children] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  return (
    <Card>
      <CardContent className="px-2 py-[7px] sm:hidden">
        <div className="flex min-h-[30px] items-center justify-center gap-1">
          <div className={`shrink-0 rounded-xl border p-1.5 ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}>
            <Icon className={`${toneMap[tone].split(' ')[1]} h-3.5 w-3.5`} />
          </div>
          <div className="max-w-[4.75rem] whitespace-normal break-keep text-left text-[10px] font-medium leading-tight text-slate-500">
            {label}
          </div>
        </div>
        <div className="mt-1 text-center text-lg font-bold leading-none text-slate-900">
          {value}
        </div>
      </CardContent>

      <CardContent className="hidden items-center gap-4 p-5 text-left sm:flex">
        <div className={`rounded-2xl border p-3 ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}>
          <Icon className={`${toneMap[tone].split(' ')[1]} h-[22px] w-[22px]`} />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-0.5 text-2xl font-bold text-slate-900">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Button({ children, className = '', onClick, variant = 'primary', ...props }) {
  const baseStyle = "inline-flex items-center justify-center gap-2 font-medium rounded-xl text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none px-4 py-2.5";
  const variants = {
    primary: "mk-btn-primary",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
    dangerOutline: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder = '', ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus"
        {...props}
      />
    </label>
  );
}

function DateInputWithWeekday({ label, value, onChange, onDateBlur, onInvalidDate, min, max, ...props }) {
  const yearRef = useRef(null);
  const monthRef = useRef(null);
  const dayRef = useRef(null);
  const calendarInputRef = useRef(null);
  const skipNextEditorBlurRef = useRef(false);
  const pendingSegmentFocusRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const splitDateToParts = (dateStr) => {
    const [year = '', month = '', day = ''] = String(dateStr || '').split('-');

    return {
      year: year.slice(0, 4),
      month: month.slice(0, 2),
      day: day.slice(0, 2),
    };
  };

  const [dateParts, setDateParts] = useState(() => splitDateToParts(value));

    useEffect(() => {
      if (!isFocused) {
        setDateParts(splitDateToParts(value));
      }
    }, [value, isFocused]);

    useEffect(() => {
    if (!isFocused || !pendingSegmentFocusRef.current) {
      return;
    }

    const targetSegment = pendingSegmentFocusRef.current;
    pendingSegmentFocusRef.current = null;

    if (targetSegment === 'year') {
      focusInput(yearRef);
    }

    if (targetSegment === 'month') {
      focusInput(monthRef);
    }

    if (targetSegment === 'day') {
      focusInput(dayRef);
    }
  }, [isFocused]);

  const getDateFromParts = (parts) => {
    if (
      parts.year.length !== 4 ||
      parts.month.length !== 2 ||
      parts.day.length !== 2
    ) {
      return '';
    }

    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const isValidDateValue = (dateStr) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) {
      return false;
    }

    const parsedDate = new Date(`${dateStr}T00:00:00Z`);

    if (Number.isNaN(parsedDate.getTime())) {
      return false;
    }

    return formatDate(parsedDate) === dateStr;
  };

  const focusInput = (ref) => {
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
  };

  const selectSegmentInput = (e) => {
    const target = e.currentTarget;

    requestAnimationFrame(() => {
      target.select();
    });
  };

  const blurSegmentInputs = () => {
    skipNextEditorBlurRef.current = true;

    yearRef.current?.blur();
    monthRef.current?.blur();
    dayRef.current?.blur();

    requestAnimationFrame(() => {
      skipNextEditorBlurRef.current = false;
    });
  };

  const commitDateValue = (nextValue, shouldUseBlurHandler = false) => {
    if (!nextValue) {
      return '';
    }

    const committedValue =
      shouldUseBlurHandler && onDateBlur
        ? onDateBlur(nextValue)
        : onChange(nextValue);

    const finalValue = typeof committedValue === 'string' ? committedValue : nextValue;

    setDateParts(splitDateToParts(finalValue));

    return finalValue;
  };

  const finishWithCandidateDate = (candidateDate) => {
    const finalValue = commitDateValue(candidateDate);
    setDateParts(splitDateToParts(finalValue));
    setIsFocused(false);
    blurSegmentInputs();

    return finalValue;
  };

  const checkPartialRangeAndResetIfNeeded = (nextParts, level) => {
    const minParts = splitDateToParts(min);
    const maxParts = splitDateToParts(max);

    if (level === 'year' && nextParts.year.length === 4) {
      if (minParts.year && nextParts.year < minParts.year) {
        finishWithCandidateDate(`${nextParts.year}-01-01`);
        return true;
      }

      if (maxParts.year && nextParts.year > maxParts.year) {
        finishWithCandidateDate(`${nextParts.year}-12-31`);
        return true;
      }
    }

    if (
      level === 'month' &&
      nextParts.year.length === 4 &&
      nextParts.month.length === 2
    ) {
      const monthNumber = Number(nextParts.month);

      if (monthNumber < 1 || monthNumber > 12) {
        onInvalidDate?.();
        setDateParts(splitDateToParts(value));
        setIsFocused(false);
        blurSegmentInputs();
        return true;
      }

      const typedYearMonth = `${nextParts.year}-${nextParts.month}`;
      const minYearMonth = minParts.year && minParts.month ? `${minParts.year}-${minParts.month}` : '';
      const maxYearMonth = maxParts.year && maxParts.month ? `${maxParts.year}-${maxParts.month}` : '';

      if (minYearMonth && typedYearMonth < minYearMonth) {
        finishWithCandidateDate(`${nextParts.year}-${nextParts.month}-01`);
        return true;
      }

      if (maxYearMonth && typedYearMonth > maxYearMonth) {
        finishWithCandidateDate(`${nextParts.year}-${nextParts.month}-01`);
        return true;
      }
    }

    return false;
  };

  const handleYearChange = (rawValue) => {
    const nextYear = String(rawValue || '').replace(/\D/g, '').slice(0, 4);
    const nextParts = {
      ...dateParts,
      year: nextYear,
    };

    setDateParts(nextParts);

    if (nextYear.length === 4) {
      if (checkPartialRangeAndResetIfNeeded(nextParts, 'year')) {
        return;
      }

      focusInput(monthRef);
    }
  };

  const handleMonthChange = (rawValue) => {
    let nextMonth = String(rawValue || '').replace(/\D/g, '').slice(0, 2);

    if (nextMonth.length === 1 && Number(nextMonth) > 1) {
      nextMonth = `0${nextMonth}`;
    }

    const nextParts = {
      ...dateParts,
      month: nextMonth,
    };

    setDateParts(nextParts);

    if (nextMonth.length === 2) {
      if (checkPartialRangeAndResetIfNeeded(nextParts, 'month')) {
        return;
      }

      focusInput(dayRef);
    }
  };

  const handleDayChange = (rawValue) => {
    let nextDay = String(rawValue || '').replace(/\D/g, '').slice(0, 2);

    if (nextDay.length === 1 && Number(nextDay) > 3) {
      nextDay = `0${nextDay}`;
    }

    const nextParts = {
      ...dateParts,
      day: nextDay,
    };

    setDateParts(nextParts);

    const nextDate = getDateFromParts(nextParts);

    if (!nextDate) {
      return;
    }

    if (!isValidDateValue(nextDate)) {
      onInvalidDate?.();
      setDateParts(splitDateToParts(value));
      setIsFocused(false);
      blurSegmentInputs();
      return;
    }

const finalValue = commitDateValue(nextDate);

    setDateParts(splitDateToParts(finalValue));
    setIsFocused(false);
    blurSegmentInputs();
  };

  const handleEditorBlur = (e) => {
    if (skipNextEditorBlurRef.current) {
      return;
    }

    if (e.currentTarget.contains(e.relatedTarget)) {
      return;
    }

    const nextDate = getDateFromParts(dateParts);

    if (isValidDateValue(nextDate)) {
      commitDateValue(nextDate, true);
    } else {
      onInvalidDate?.();
      setDateParts(splitDateToParts(value));
    }

    setIsFocused(false);
  };

  const openDatePicker = () => {
    const input = calendarInputRef.current;
    if (!input) return;

    input.focus();

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // 일부 브라우저에서는 showPicker가 제한될 수 있으므로 focus 처리만 유지합니다.
      }
    }
  };

  const openSegmentEditor = () => {
    pendingSegmentFocusRef.current = 'year';
    setDateParts(splitDateToParts(value));
    setIsFocused(true);
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <div className="relative">
        {isFocused ? (
          <div
            onBlur={handleEditorBlur}
            className="flex h-[42px] w-full items-center gap-0 rounded-xl border border-slate-200 bg-white px-2.5 pr-11 text-sm outline-none transition focus-within:border-[var(--mk-orange)] focus-within:shadow-[0_0_0_4px_var(--mk-orange-ring)]"
          >
            <input
              ref={yearRef}
              type="text"
              inputMode="numeric"
              value={dateParts.year}
              onFocus={selectSegmentInput}
              onClick={selectSegmentInput}
              onChange={(e) => handleYearChange(e.target.value)}
              placeholder="YYYY"
              maxLength={4}
              className="w-[4ch] bg-transparent text-center text-sm outline-none"
            />
            <span className="shrink-0 px-0.5 text-slate-400">-</span>
            <input
              ref={monthRef}
              type="text"
              inputMode="numeric"
              value={dateParts.month}
              onFocus={selectSegmentInput}
              onClick={selectSegmentInput}
              onChange={(e) => handleMonthChange(e.target.value)}
              placeholder="MM"
              maxLength={2}
              className="w-[2ch] bg-transparent text-center text-sm outline-none"
            />
            <span className="shrink-0 px-0.5 text-slate-400">-</span>
            <input
              ref={dayRef}
              type="text"
              inputMode="numeric"
              value={dateParts.day}
              onFocus={selectSegmentInput}
              onClick={selectSegmentInput}
              onChange={(e) => handleDayChange(e.target.value)}
              placeholder="DD"
              maxLength={2}
              className="w-[2ch] bg-transparent text-center text-sm outline-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onFocus={openSegmentEditor}
            onClick={openSegmentEditor}
            className="flex h-[42px] w-full items-center rounded-xl border border-slate-200 bg-white px-3.5 pr-10 text-left text-sm text-slate-900 outline-none transition mk-form-focus"
            {...props}
          >
            {formatDateWithKoreanWeekday(value) || (
              <span className="text-slate-400">날짜 선택</span>
            )}
          </button>
        )}

        <input
          ref={calendarInputRef}
          type="date"
          value={value || ''}
          min={min}
          max={max}
          tabIndex={-1}
          onChange={(e) => {
            const nextValue = e.target.value;

            if (!nextValue) return;

            const finalValue = commitDateValue(nextValue);

            setDateParts(splitDateToParts(finalValue));
            setIsFocused(false);
            blurSegmentInputs();
          }}
          className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 opacity-0"
        />

          <button
            type="button"
            tabIndex={-1}
            aria-label={`${label} 달력 열기`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openDatePicker}
            className="absolute right-0 top-0 z-10 flex h-full w-11 items-center justify-center rounded-r-xl bg-transparent text-slate-500 hover:text-[var(--mk-orange)]"
          >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>
    </label>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.7em_auto] bg-[right_1rem_center] bg-no-repeat"
      >
        {children}
      </select>
    </label>
  );
}

const USER_ROUTE_PATHS = {
  home: '',
  rental: '/rental',
  history: '/history',
  notice: '/board/notice',
  faq: '/board/faq',
  login: '/login',
  signup: '/signup',
  mypage: '/mypage',
};

const getNormalizedPathname = () => {
  if (typeof window === 'undefined') return '/';

  const pathname = window.location.pathname.replace(/\/+$/, '');

  return pathname || '/';
};

const getRouteStateFromPath = () => {
  const pathname = getNormalizedPathname();

  if (pathname === '/') {
    return { view: 'user', userTab: 'home' };
  }

  if (pathname === '/admin') {
    return { view: 'admin', userTab: 'home' };
  }

  if (pathname === '/rental') {
    return { view: 'user', userTab: 'rental' };
  }

  if (pathname === '/history') {
    return { view: 'user', userTab: 'history' };
  }

  if (pathname === '/login') {
    return { view: 'user', userTab: 'login' };
  }

  if (pathname === '/signup') {
    return { view: 'user', userTab: 'signup' };
  }

  if (pathname === '/mypage') {
    return { view: 'user', userTab: 'mypage' };
  }

  if (pathname === '/board') {
    return {
      view: 'user',
      userTab: 'notice',
      redirectTo: '/board/notice',
    };
  }

  if (pathname === '/board/notice') {
    return { view: 'user', userTab: 'notice' };
  }

  if (pathname === '/board/faq') {
    return { view: 'user', userTab: 'faq' };
  }

  return { view: 'user', userTab: 'notFound' };
};

const getInitialViewFromPath = () => getRouteStateFromPath().view;

const getInitialUserTabFromPath = () => getRouteStateFromPath().userTab;

const pushAppPath = (nextView, nextUserTab = 'home') => {
  if (typeof window === 'undefined') return;

  const routeSuffix =
    nextView === 'admin'
      ? '/admin'
      : USER_ROUTE_PATHS[nextUserTab] || '';

  const nextPath = routeSuffix || '/';

  if (window.location.pathname !== nextPath) {
    window.history.pushState(null, '', nextPath);
  }
};

const ADMIN_CUSTOM_OPTION_VALUE = '__ADMIN_CUSTOM_INPUT__';
const ADMIN_ACCOUNT_PAGE_SIZE = 10;
const ADMIN_AUTH_SESSION_KEY = 'mk_laptop_admin_auth_session';
const ADMIN_AUTH_SESSION_DURATION_MS = 60 * 60 * 1000;
const ADMIN_AUTH_MAX_FAILED_ATTEMPTS = 5;
const ADMIN_AUTH_LOCK_DURATION_MS = 5 * 60 * 1000;
const ADMIN_PASSWORD_HASH_ALGORITHM = 'PBKDF2-SHA-256';
const ADMIN_PASSWORD_HASH_ITERATIONS = 120000;

const createDefaultAdminAccountForm = () => ({
  adminLoginId: '',
  password: '',
  organizationName: '',
  customOrganizationName: '',
  userName: '',
  customUserName: '',
  email: '',
  phone: '',
});

const createDefaultAdminAuthForm = () => ({
  adminLoginId: '',
  password: '',
});

const USER_PROFILE_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  RETIRED: 'retired',
};

const createDefaultUserAuthForm = () => ({
  email: '',
  password: '',
  passwordConfirm: '',
  name: '',
  team: '',
  phone: '',
});

const createDefaultUserProfileForm = () => ({
  name: '',
  team: '',
  phone: '',
  newPassword: '',
  newPasswordConfirm: '',
});

const createDefaultAdminAccountEditForm = () => ({
  adminLoginId: '',
  organizationName: '',
  userName: '',
  email: '',
  phone: '',
  newPassword: '',
  newPasswordConfirm: '',
});

const getUserAuthErrorMessage = (error) => {
  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';

  if (errorCode === 'auth/email-already-in-use') {
    return '이미 가입된 이메일입니다. 로그인 화면에서 로그인해 주세요.';
  }

  if (errorCode === 'auth/invalid-email') {
    return '이메일 형식이 올바르지 않습니다.';
  }

  if (errorCode === 'auth/weak-password') {
    return '비밀번호는 6자 이상으로 입력해 주세요.';
  }

  if (errorCode === 'auth/password-does-not-meet-requirements') {
    return '비밀번호가 Firebase Authentication의 비밀번호 정책을 충족하지 않습니다. 대문자, 숫자, 특수문자 등 설정된 정책을 확인해 주세요.';
  }

  if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (errorCode === 'auth/invalid-credential') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (errorCode === 'auth/operation-not-allowed') {
    return 'Firebase Authentication에서 Email/Password 로그인 제공자가 아직 사용 설정되어 있지 않습니다. Firebase Console의 Authentication > Sign-in method에서 Email/Password를 사용 설정해 주세요.';
  }

  if (errorCode === 'auth/network-request-failed') {
    return 'Firebase Authentication 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';
  }

  if (errorCode === 'auth/unauthorized-domain') {
    return '현재 접속한 도메인이 Firebase Authentication 승인 도메인에 등록되어 있지 않습니다. Firebase Console의 Authentication 설정에서 Authorized domains를 확인해 주세요.';
  }

  if (errorCode === 'auth/too-many-requests') {
    return '로그인 또는 가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (errorCode === 'auth/requires-recent-login') {
    return '보안상 최근 로그인한 사용자만 비밀번호를 변경할 수 있습니다. 로그아웃 후 다시 로그인한 다음 비밀번호 변경을 시도해 주세요.';
  }

  if (errorCode === 'permission-denied') {
    return '회원 정보 또는 로그인 역할 확인 권한이 거부되었습니다. Firestore Rules의 userAccounts/{uid} 및 adminAccounts/{uid} 규칙과 게시 여부를 확인해 주세요.';
  }

  if (errorCode === 'unavailable') {
    return 'Firestore 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }

  return `사용자 인증 처리 중 오류가 발생했습니다. 오류 코드: ${errorCode || 'unknown'} ${errorMessage ? ` / ${errorMessage}` : ''}`;
};

const getAdminFirebaseAuthErrorMessage = (error) => {
  const errorCode = error?.code || '';

  if (error?.message === 'admin-auth-uid-mismatch') {
    return 'Firebase Auth 계정 UID와 관리자 등록 정보가 일치하지 않습니다. 관리자 ID 관리 정보를 확인해 주세요.';
  }

  if (errorCode === 'auth/email-already-in-use') {
    return '이미 Firebase Authentication에 등록된 이메일입니다. 다른 이메일을 사용하거나 기존 Auth 계정 연결 상태를 확인해 주세요.';
  }

  if (errorCode === 'auth/operation-not-allowed') {
    return 'Firebase Authentication에서 Email/Password 제공자가 사용 설정되어 있지 않습니다. Authentication > Sign-in method에서 Email/Password를 사용 설정해 주세요.';
  }

  if (errorCode === 'auth/invalid-email') {
    return '관리자 로그인 이메일 형식이 올바르지 않습니다.';
  }

  if (errorCode === 'auth/weak-password') {
    return '관리자 초기 비밀번호는 6자 이상으로 입력해 주세요.';
  }

  if (errorCode === 'auth/password-does-not-meet-requirements') {
    return '관리자 비밀번호가 Firebase Authentication의 비밀번호 정책을 충족하지 않습니다.';
  }

  if (
    errorCode === 'auth/user-not-found' ||
    errorCode === 'auth/wrong-password' ||
    errorCode === 'auth/invalid-credential'
  ) {
    return '관리자 로그인 이메일 또는 비밀번호가 일치하지 않습니다.';
  }

  if (errorCode === 'auth/network-request-failed') {
    return 'Firebase Authentication 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';
  }

  if (errorCode === 'auth/unauthorized-domain') {
    return '현재 접속한 도메인이 Firebase Authentication 승인 도메인에 등록되어 있지 않습니다.';
  }

  if (errorCode === 'auth/too-many-requests') {
    return '로그인 또는 가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (errorCode === 'auth/requires-recent-login') {
    return '보안상 최근 로그인한 관리자만 비밀번호를 변경할 수 있습니다. 로그아웃 후 다시 로그인한 다음 비밀번호 변경을 시도해 주세요.';
  }

  if (errorCode === 'permission-denied') {
    return '관리자 계정 조회 또는 저장 권한이 거부되었습니다. Firestore Rules의 adminAccounts/{uid} 규칙을 확인해 주세요.';
  }

  return getUserAuthErrorMessage(error).replace('사용자 인증', '관리자 인증');
};

const bufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const hexToBuffer = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
};

const createAdminPasswordSalt = () => {
  const saltValues = new Uint8Array(16);
  window.crypto.getRandomValues(saltValues);

  return bufferToHex(saltValues);
};

const hashAdminPasswordLegacy = async (password) => {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordBuffer);

  return bufferToHex(hashBuffer);
};

const hashAdminPassword = async (
  password,
  salt,
  iterations = ADMIN_PASSWORD_HASH_ITERATIONS
) => {
  const encoder = new TextEncoder();

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
};

const createAdminPasswordSecurity = async (password) => {
  const passwordSalt = createAdminPasswordSalt();
  const passwordHash = await hashAdminPassword(password, passwordSalt);

  return {
    passwordHash,
    passwordSalt,
    passwordHashAlgorithm: ADMIN_PASSWORD_HASH_ALGORITHM,
    passwordHashIterations: ADMIN_PASSWORD_HASH_ITERATIONS,
  };
};

const verifyAdminPassword = async (password, adminAccount) => {
  if (
    adminAccount.passwordHashAlgorithm === ADMIN_PASSWORD_HASH_ALGORITHM &&
    adminAccount.passwordSalt
  ) {
    const passwordHash = await hashAdminPassword(
      password,
      adminAccount.passwordSalt,
      Number(adminAccount.passwordHashIterations) || ADMIN_PASSWORD_HASH_ITERATIONS
    );

    return {
      matched: passwordHash === adminAccount.passwordHash,
      shouldMigratePassword: false,
    };
  }

  const legacyPasswordHash = await hashAdminPasswordLegacy(password);

  return {
    matched: legacyPasswordHash === adminAccount.passwordHash,
    shouldMigratePassword: legacyPasswordHash === adminAccount.passwordHash,
  };
};

const readAdminAuthSession = () => {
  if (typeof window === 'undefined') {
    return {
      adminId: '',
      expiresAt: 0,
    };
  }

  const rawSession = window.sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY);

  if (!rawSession) {
    return {
      adminId: '',
      expiresAt: 0,
    };
  }

  try {
    const parsedSession = JSON.parse(rawSession);

    if (
      parsedSession?.adminId &&
      parsedSession?.expiresAt &&
      parsedSession.expiresAt > Date.now()
    ) {
      return parsedSession;
    }

    window.sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
  } catch {
    window.sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
  }

  return {
    adminId: '',
    expiresAt: 0,
  };
};

const saveAdminAuthSession = (adminId) => {
  const nextSession = {
    adminId,
    expiresAt: Date.now() + ADMIN_AUTH_SESSION_DURATION_MS,
  };

  window.sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, JSON.stringify(nextSession));

  return nextSession;
};

const clearAdminAuthSession = () => {
  if (typeof window === 'undefined') return;

  window.sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
};

function App() {
  const [data, setData] = useState(initialData);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseLoadErrorMessage, setFirebaseLoadErrorMessage] = useState('');

  const [rentalRequests, setRentalRequests] = useState([]);
  const [rentalRequestsReady, setRentalRequestsReady] = useState(false);

  const [
    rentalRequestsLoadErrorMessage,
    setRentalRequestsLoadErrorMessage,
  ] = useState('');

  const [rentalRequestLogs, setRentalRequestLogs] = useState([]);
  const [rentalRequestLogsReady, setRentalRequestLogsReady] = useState(false);

  const [
    rentalRequestLogsLoadErrorMessage,
    setRentalRequestLogsLoadErrorMessage,
  ] = useState('');

  const [requestSubmitLoading, setRequestSubmitLoading] = useState(false);
  const requestSubmitInProgressRef = useRef(false);

  const [userActionDialog, setUserActionDialog] = useState(null);
  const [userActionForm, setUserActionForm] = useState(
    createDefaultUserActionForm
  );
  const [userActionSaving, setUserActionSaving] = useState(false);
  const [
    adminUserActionSavingRequestId,
    setAdminUserActionSavingRequestId,
  ] = useState('');

  const [adminRequestTab, setAdminRequestTab] = useState(
    ADMIN_REQUEST_TAB.PENDING
  );
  const [adminRequestQuery, setAdminRequestQuery] = useState('');
  const [adminRequestPageSize, setAdminRequestPageSize] = useState(10);
  const [adminRequestPage, setAdminRequestPage] = useState(1);
  const [selectedAdminRequestId, setSelectedAdminRequestId] = useState('');

  const [adminRequestEditDialog, setAdminRequestEditDialog] = useState(null);
  const [adminRequestEditForm, setAdminRequestEditForm] = useState(
    createDefaultAdminRequestEditForm
  );
  const [adminRequestEditSaving, setAdminRequestEditSaving] = useState(false);

  const [adminRequestRestoreDialog, setAdminRequestRestoreDialog] = useState(null);
  const [adminRequestRestoreTarget, setAdminRequestRestoreTarget] = useState('');
  const [adminRequestRestoreReason, setAdminRequestRestoreReason] = useState('');
  const [adminRequestRestoreSaving, setAdminRequestRestoreSaving] = useState(false);
  
  const [noticePosts, setNoticePosts] = useState([]);
  const [noticePostsReady, setNoticePostsReady] = useState(false);
  const [
    noticePostsLoadErrorMessage,
    setNoticePostsLoadErrorMessage,
  ] = useState('');

  const [noticeBoardConfig, setNoticeBoardConfig] = useState({
    postsPerPage: DEFAULT_NOTICE_POSTS_PER_PAGE,
  });
  const [noticeBoardConfigReady, setNoticeBoardConfigReady] = useState(false);
  const [
    noticeBoardConfigLoadErrorMessage,
    setNoticeBoardConfigLoadErrorMessage,
  ] = useState('');

  const [selectedNoticePostId, setSelectedNoticePostId] = useState('');
  const [noticePage, setNoticePage] = useState(1);
  const [adminNoticePage, setAdminNoticePage] = useState(1);
  const [noticePostDialog, setNoticePostDialog] = useState(null);
  const [noticePostForm, setNoticePostForm] = useState(
    createDefaultNoticePostForm
  );
  const [noticePostSaving, setNoticePostSaving] = useState(false);
  const [noticePostDeletingId, setNoticePostDeletingId] = useState('');
  const [noticeBoardConfigSaving, setNoticeBoardConfigSaving] = useState(false);
  const [noticePostsPerPageInput, setNoticePostsPerPageInput] = useState(
    DEFAULT_NOTICE_POSTS_PER_PAGE
  );

  const [faqCategories, setFaqCategories] = useState([]);
  const [faqCategoriesReady, setFaqCategoriesReady] = useState(false);
  const [
    faqCategoriesLoadErrorMessage,
    setFaqCategoriesLoadErrorMessage,
  ] = useState('');

  const [faqPosts, setFaqPosts] = useState([]);
  const [faqPostsReady, setFaqPostsReady] = useState(false);
  const [
    faqPostsLoadErrorMessage,
    setFaqPostsLoadErrorMessage,
  ] = useState('');

  const [faqBoardConfig, setFaqBoardConfig] = useState({
    postsPerPage: DEFAULT_FAQ_POSTS_PER_PAGE,
  });
  const [faqBoardConfigReady, setFaqBoardConfigReady] = useState(false);
  const [
    faqBoardConfigLoadErrorMessage,
    setFaqBoardConfigLoadErrorMessage,
  ] = useState('');

  const [activeFaqCategoryId, setActiveFaqCategoryId] = useState('all');
  const [expandedFaqPostId, setExpandedFaqPostId] = useState('');
  const [adminExpandedFaqPostId, setAdminExpandedFaqPostId] = useState('');
  const [faqPage, setFaqPage] = useState(1);
  const [adminFaqPage, setAdminFaqPage] = useState(1);

  const [faqPostDialog, setFaqPostDialog] = useState(null);
  const [faqPostForm, setFaqPostForm] = useState(
    createDefaultFaqPostForm
  );
  const [faqPostSaving, setFaqPostSaving] = useState(false);
  const [faqPostDeletingId, setFaqPostDeletingId] = useState('');

  const [faqBoardConfigSaving, setFaqBoardConfigSaving] = useState(false);
  const [faqPostsPerPageInput, setFaqPostsPerPageInput] = useState(
    DEFAULT_FAQ_POSTS_PER_PAGE
  );

  const [newFaqCategoryName, setNewFaqCategoryName] = useState('');
  const [editingFaqCategoryId, setEditingFaqCategoryId] = useState('');
  const [editingFaqCategoryName, setEditingFaqCategoryName] = useState('');
  const [faqCategorySavingId, setFaqCategorySavingId] = useState('');
  const [faqCategoryDeletingId, setFaqCategoryDeletingId] = useState('');

  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminAccountsReady, setAdminAccountsReady] = useState(false);
  const [adminAccountsLoadErrorMessage, setAdminAccountsLoadErrorMessage] = useState('');
  const [adminAccountsRemoteHasData, setAdminAccountsRemoteHasData] = useState(false);
  const [legacyAdminAccounts] = useState([]);

  const initializedRemoteFormRef = useRef(false);

  const [splitPublicConfig, setSplitPublicConfig] = useState(null);
  const [splitRentalAssets, setSplitRentalAssets] = useState([]);
  const [splitRentalAvailability, setSplitRentalAvailability] = useState([]);
  const [splitRentalBorrowers, setSplitRentalBorrowers] = useState([]);
  const [splitStorageVersion, setSplitStorageVersion] = useState(0);
  const [splitSourceReady, setSplitSourceReady] = useState({
    config: false,
    assets: false,
    availability: false,
    borrowers: false,
  });

  const [splitSourceErrors, setSplitSourceErrors] = useState({
    config: '',
    assets: '',
    availability: '',
    borrowers: '',
  });

  const adminAccountsApplyingRemoteRef = useRef(false);
  const adminAccountsLastSyncedRef = useRef({});
  const allowAdminAccountsWriteRef = useRef(false);
  const adminLogoutInProgressRef = useRef(false);

  const [view, setView] = useState(getInitialViewFromPath); // 'user' | 'admin'
  const [userTab, setUserTab] = useState(getInitialUserTabFromPath); // 'home' | 'rental' | 'history' | 'notice' | 'faq' | 'notFound'
  const [isCommunityMenuOpen, setIsCommunityMenuOpen] = useState(false);
  const communityMenuRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedAssetCategory, setSelectedAssetCategory] = useState('전체');
  const [availabilityFilter, setAvailabilityFilter] = useState(STATUS.AVAILABLE);
  const [adminLaptopQuery, setAdminLaptopQuery] = useState('');
  const [adminSelectedAssetCategory, setAdminSelectedAssetCategory] = useState('전체');
  const [adminAvailabilityFilter, setAdminAvailabilityFilter] = useState('전체');
  const [selectedLaptopId, setSelectedLaptopId] = useState(null);
  const [form, setForm] = useState(() => createDefaultRequestForm(data.settings));
  const [adminTab, setAdminTab] = useState('dashboard'); // 'dashboard' | 'requests' | 'laptops' | 'categories' | 'people' | 'settings'
  const [editLaptop, setEditLaptop] = useState(null);
  const [newLaptop, setNewLaptop] = useState(null); // 신규 자산 생성을 위한 상태 값 추가
  const [newAssetCategory, setNewAssetCategory] = useState('');
  const [tempAssetCategories, setTempAssetCategories] = useState(data.assetCategories || []);
  const [tempAssetCategoryRenameMap, setTempAssetCategoryRenameMap] = useState({});
  const [editingAssetCategoryIndex, setEditingAssetCategoryIndex] = useState(null);
  const [editingAssetCategoryName, setEditingAssetCategoryName] = useState('');
  const [draggingAssetCategoryIndex, setDraggingAssetCategoryIndex] = useState(null);
  const [newTeam, setNewTeam] = useState('');
  const [tempTeams, setTempTeams] = useState(data.teams || []);
  const [editingTeamIndex, setEditingTeamIndex] = useState(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [draggingTeamIndex, setDraggingTeamIndex] = useState(null);
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowerTeam, setNewBorrowerTeam] = useState('전체');
  const [tempBorrowers, setTempBorrowers] = useState(data.borrowers || []);
  const [editingBorrowerIndex, setEditingBorrowerIndex] = useState(null);
  const [editingBorrowerName, setEditingBorrowerName] = useState('');
  const [draggingBorrowerIndex, setDraggingBorrowerIndex] = useState(null);

  const [adminAccountForm, setAdminAccountForm] = useState(createDefaultAdminAccountForm);
  const [adminAccountPage, setAdminAccountPage] = useState(1);
  const [adminAuthForm, setAdminAuthForm] = useState(createDefaultAdminAuthForm);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminLogoutInProgress, setAdminLogoutInProgress] = useState(false);
  const [authenticatedAdminId, setAuthenticatedAdminId] = useState(
    () => readAdminAuthSession().adminId
  );
  const [adminAuthExpiresAt, setAdminAuthExpiresAt] = useState(
    () => readAdminAuthSession().expiresAt
  );

  const [firebaseAuthUser, setFirebaseAuthUser] = useState(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [currentAuthAdminAccount, setCurrentAuthAdminAccount] = useState(null);
  const [currentAuthRoleReady, setCurrentAuthRoleReady] = useState(false);
  const [currentAuthRoleErrorMessage, setCurrentAuthRoleErrorMessage] = useState('');
  const [userAuthForm, setUserAuthForm] = useState(createDefaultUserAuthForm);
  const [userAuthLoading, setUserAuthLoading] = useState(false);

  const [userProfile, setUserProfile] = useState(null);
  const [userProfileReady, setUserProfileReady] = useState(false);
  const [userProfileForm, setUserProfileForm] = useState(createDefaultUserProfileForm);
  const [userProfileSaving, setUserProfileSaving] = useState(false);

  const [adminUserAccounts, setAdminUserAccounts] = useState([]);
  const [adminUserAccountsReady, setAdminUserAccountsReady] = useState(false);
  const [
    adminUserAccountsLoadErrorMessage,
    setAdminUserAccountsLoadErrorMessage,
  ] = useState('');

  const [adminUserAccountQuery, setAdminUserAccountQuery] = useState('');

  const [
    adminUserAccountStatusFilter,
    setAdminUserAccountStatusFilter,
  ] = useState('all');

  const [
    adminUserAccountSavingUid,
    setAdminUserAccountSavingUid,
  ] = useState('');

  const userStatusLogoutInProgressRef = useRef(false);

  const [editingAdminAccountId, setEditingAdminAccountId] = useState('');
  const [adminAccountEditForm, setAdminAccountEditForm] = useState(createDefaultAdminAccountEditForm);

  const [adminMyProfileForm, setAdminMyProfileForm] = useState(createDefaultAdminAccountEditForm);
  const [adminMyProfileSaving, setAdminMyProfileSaving] = useState(false);

  // 엑셀/CSV 업로드 패널 토글 상태 값 추가
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [assetGridColumns, setAssetGridColumns] = useState(1);

  // 설정 임시 저장을 위한 임시 상태 정의
  const [tempSettings, setTempSettings] = useState(data.settings);
  const [newHolidayDate, setNewHolidayDate] = useState(today());
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayType, setNewHolidayType] = useState(DEFAULT_HOLIDAY_TYPE);
  const [holidayImportYear, setHolidayImportYear] = useState(String(getKoreaNow().getUTCFullYear()));
  const [holidayImportLoading, setHolidayImportLoading] = useState(false);

  const [
    splitStorageFinalizeLoading,
    setSplitStorageFinalizeLoading,
  ] = useState(false);

  // Toast 메시지 상태
  const [toast, setToast] = useState(null);
  // 커스텀 모달 확인창 상태
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(!user);

        setFirebaseAuthUser(user);
        setFirebaseAuthReady(true);
      },
      (error) => {
        console.error('Firebase Auth state error:', error);

        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);

        setFirebaseAuthUser(null);
        setFirebaseAuthReady(true);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseAuthReady) return;

    if (!firebaseAuthUser) {
      setCurrentAuthAdminAccount(null);
      setCurrentAuthRoleErrorMessage('');
      setCurrentAuthRoleReady(true);
      return;
    }

    const currentAuthUid = firebaseAuthUser.uid;

    setCurrentAuthAdminAccount(null);
    setCurrentAuthRoleErrorMessage('');
    setCurrentAuthRoleReady(false);

    const unsubscribe = onSnapshot(
      doc(db, 'adminAccounts', currentAuthUid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage('');
          setCurrentAuthRoleReady(true);
          return;
        }

        const normalizedAdminAccount =
          normalizeAdminAccounts([
            {
              ...snapshot.data(),
              id: snapshot.id,
            },
          ])[0] || null;

        const hasValidAdminUidStructure =
          Boolean(normalizedAdminAccount) &&
          snapshot.id === currentAuthUid &&
          normalizedAdminAccount.id === currentAuthUid &&
          normalizedAdminAccount.authUid === currentAuthUid;

        if (!hasValidAdminUidStructure) {
          const message =
            '관리자 계정 문서의 UID 정보가 올바르지 않습니다. adminAccounts 문서 ID, id, authUid가 모두 같은지 확인해 주세요.';

          clearAdminAuthSession();
          setAuthenticatedAdminId('');
          setAdminAuthExpiresAt(0);

          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage(message);
          setCurrentAuthRoleReady(true);

          triggerToast(message, 'error');
          return;
        }

        setCurrentAuthAdminAccount(normalizedAdminAccount);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);
      },
      (error) => {
        const message =
          '현재 로그인 계정의 관리자 권한을 확인하지 못했습니다. Firestore Rules를 확인해 주세요.';

        console.error('Current auth role sync error:', error);

        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage(message);
        setCurrentAuthRoleReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [firebaseAuthReady, firebaseAuthUser]);

  useEffect(() => {
    if (!firebaseAuthUser) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    if (!currentAuthRoleReady) {
      setUserProfileReady(false);
      return;
    }

    if (currentAuthRoleErrorMessage) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    if (currentAuthAdminAccount || authenticatedAdminId) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    setUserProfileReady(false);

    const unsubscribe = onSnapshot(
      doc(db, USER_ACCOUNTS_COLLECTION_NAME, firebaseAuthUser.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setUserProfile(null);
          setUserProfileForm({
            name: firebaseAuthUser.displayName || '',
            team: '',
            phone: '',
            newPassword: '',
            newPasswordConfirm: '',
          });
          setUserProfileReady(true);
          return;
        }

        const profileData = snapshot.data();

        setUserProfile(profileData);
        setUserProfileForm({
          name: profileData.name || '',
          team: profileData.team || '',
          phone: profileData.phone || '',
          newPassword: '',
          newPasswordConfirm: '',
        });
        setUserProfileReady(true);
      },
      (error) => {
        console.error('User account sync error:', error);
        setUserProfile(null);
        setUserProfileReady(true);
        triggerToast(
          '마이페이지 정보를 불러오지 못했습니다. Firestore 권한을 확인해 주세요.',
          'error'
        );
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      userProfile.uid !== firebaseAuthUser.uid ||
      userAuthLoading
    ) {
      return;
    }

    const currentStatus =
      userProfile.status || '';

    if (
      currentStatus ===
      USER_PROFILE_STATUS.ACTIVE
    ) {
      return;
    }

    if (
      userStatusLogoutInProgressRef.current
    ) {
      return;
    }

    userStatusLogoutInProgressRef.current = true;

    const logoutMessage =
      currentStatus ===
      USER_PROFILE_STATUS.PENDING
        ? '관리자 승인 대기 상태로 변경되어 로그아웃되었습니다.'
        : currentStatus ===
            USER_PROFILE_STATUS.BLOCKED
          ? '관리자에 의해 이용이 차단되어 로그아웃되었습니다.'
          : currentStatus ===
              USER_PROFILE_STATUS.RETIRED
            ? '이용 종료 상태로 변경되어 로그아웃되었습니다.'
            : '현재 회원 상태에서는 서비스를 이용할 수 없어 로그아웃되었습니다.';

    const logoutInactiveUser = async () => {
      try {
        await signOut(firebaseAuth);

        clearAdminAuthSession();
        setAuthenticatedAdminId('');
        setAdminAuthExpiresAt(0);
        setUserAuthForm(
          createDefaultUserAuthForm()
        );

        pushAppPath('user', 'login');
        setView('user');
        setUserTab('login');
        setIsCommunityMenuOpen(false);

        triggerToast(
          logoutMessage,
          'error'
        );
      } catch (error) {
        console.error(
          'Inactive user automatic logout error:',
          error
        );

        triggerToast(
          '회원 상태 변경은 확인했지만 자동 로그아웃에 실패했습니다. 페이지를 새로고침해 주세요.',
          'error'
        );
      } finally {
        userStatusLogoutInProgressRef.current = false;
      }
    };

    void logoutInactiveUser();
  }, [
    firebaseAuthUser,
    currentAuthRoleReady,
    currentAuthAdminAccount,
    authenticatedAdminId,
    userProfileReady,
    userProfile,
    userAuthLoading,
  ]);

  const goToUserHome = () => {
    pushAppPath('user', 'home');
    setView('user');
    setUserTab('home');
    setIsCommunityMenuOpen(false);
  };

  useEffect(() => {
    const syncViewWithPath = () => {
      const nextRouteState = getRouteStateFromPath();

      if (
        nextRouteState.redirectTo &&
        window.location.pathname !== nextRouteState.redirectTo
      ) {
        window.history.replaceState(null, '', nextRouteState.redirectTo);
      }

      setView(nextRouteState.view);
      setUserTab(nextRouteState.userTab);
      setIsCommunityMenuOpen(false);
    };

    syncViewWithPath();

    window.addEventListener('popstate', syncViewWithPath);

    return () => {
      window.removeEventListener('popstate', syncViewWithPath);
    };
  }, []);

    useEffect(() => {
    if (!isCommunityMenuOpen) return;

    const handleCommunityMenuOutsideClick = (event) => {
      if (
        communityMenuRef.current &&
        !communityMenuRef.current.contains(event.target)
      ) {
        setIsCommunityMenuOpen(false);
      }
    };

    const handleCommunityMenuEscape = (event) => {
      if (event.key === 'Escape') {
        setIsCommunityMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleCommunityMenuOutsideClick, true);
    document.addEventListener('touchstart', handleCommunityMenuOutsideClick, true);
    document.addEventListener('keydown', handleCommunityMenuEscape, true);

    return () => {
      document.removeEventListener('mousedown', handleCommunityMenuOutsideClick, true);
      document.removeEventListener('touchstart', handleCommunityMenuOutsideClick, true);
      document.removeEventListener('keydown', handleCommunityMenuEscape, true);
    };
  }, [isCommunityMenuOpen]);

  // 엑셀/CSV 파싱에 사용되는 라이브러리(SheetJS) 동적 주입 처리
  useEffect(() => {
    if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const updateAssetGridColumns = () => {
      if (window.matchMedia('(min-width: 1280px)').matches) {
        setAssetGridColumns(3);
      } else if (window.matchMedia('(min-width: 640px)').matches) {
        setAssetGridColumns(2);
      } else {
        setAssetGridColumns(1);
      }
    };

    updateAssetGridColumns();
    window.addEventListener('resize', updateAssetGridColumns);

    return () => {
      window.removeEventListener('resize', updateAssetGridColumns);
    };
  }, []);

  useEffect(() => {
    setSplitSourceReady((prev) => ({
      ...prev,
      config: false,
    }));

    const unsubscribe = onSnapshot(
      PUBLIC_CONFIG_DOC_REF,
      (snapshot) => {
        if (!snapshot.exists()) {
          const message =
            'Firestore 공개 설정 문서가 없습니다. rentalSystem/publicConfig 마이그레이션 상태를 확인해 주세요.';

          setSplitPublicConfig(null);
          setSplitStorageVersion(0);
          setSplitSourceErrors((prev) => ({
            ...prev,
            config: message,
          }));
          setSplitSourceReady((prev) => ({
            ...prev,
            config: true,
          }));
          setFirebaseReady(true);
          setToast({
            message,
            type: 'error',
          });
          return;
        }

        const configData = snapshot.data();

        setSplitPublicConfig(configData);
        setSplitStorageVersion(
          Number(configData.storageVersion || 0)
        );
        setSplitSourceErrors((prev) => ({
          ...prev,
          config: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          config: true,
        }));
      },
      (error) => {
        const message =
          'Firestore 공개 설정을 불러오지 못했습니다. rentalSystem/publicConfig 읽기 권한을 확인해 주세요.';

        console.error('Public config sync error:', error);
        setSplitPublicConfig(null);
        setSplitStorageVersion(0);
        setSplitSourceErrors((prev) => ({
          ...prev,
          config: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          config: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setSplitSourceReady((prev) => ({
      ...prev,
      assets: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_ASSETS_COLLECTION_REF,
      (snapshot) => {
        const assets = snapshot.docs.map((assetDocument) => ({
          ...assetDocument.data(),
          id: assetDocument.id,
          reservations: normalizeAssetReservations(
            assetDocument.data().reservations || []
          ),
        }));

        setSplitRentalAssets(assets);
        setSplitSourceErrors((prev) => ({
          ...prev,
          assets: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          assets: true,
        }));
      },
      (error) => {
        const message =
          '대여 자산 컬렉션을 불러오지 못했습니다. rentalAssets 읽기 권한을 확인해 주세요.';

        console.error('Rental assets sync error:', error);
        setSplitRentalAssets([]);
        setSplitSourceErrors((prev) => ({
          ...prev,
          assets: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          assets: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setSplitSourceReady((prev) => ({
      ...prev,
      availability: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      (snapshot) => {
        const availabilityRequests = snapshot.docs.map(
          (availabilityDocument) => ({
            ...availabilityDocument.data(),
            id: availabilityDocument.id,
          })
        );

        setSplitRentalAvailability(availabilityRequests);
        setSplitSourceErrors((prev) => ({
          ...prev,
          availability: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          availability: true,
        }));
      },
      (error) => {
        const message =
          '공개 예약 현황을 불러오지 못했습니다. rentalAvailability 읽기 권한을 확인해 주세요.';

        console.error('Rental availability sync error:', error);
        setSplitRentalAvailability([]);
        setSplitSourceErrors((prev) => ({
          ...prev,
          availability: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          availability: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady) {
      setSplitSourceReady((prev) => ({
        ...prev,
        borrowers: false,
      }));
      return;
    }

    if (!firebaseAuthUser || currentAuthRoleErrorMessage) {
      setSplitRentalBorrowers([]);
      setSplitSourceErrors((prev) => ({
        ...prev,
        borrowers: '',
      }));
      setSplitSourceReady((prev) => ({
        ...prev,
        borrowers: true,
      }));
      return;
    }

    setSplitSourceReady((prev) => ({
      ...prev,
      borrowers: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_BORROWERS_COLLECTION_REF,
      (snapshot) => {
        const borrowers = snapshot.docs
          .map((borrowerDocument, index) => ({
            ...borrowerDocument.data(),
            id: borrowerDocument.id,
            sortOrder:
              Number.isFinite(
                Number(borrowerDocument.data().sortOrder)
              )
                ? Number(borrowerDocument.data().sortOrder)
                : index,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder);

        setSplitRentalBorrowers(borrowers);
        setSplitSourceErrors((prev) => ({
          ...prev,
          borrowers: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          borrowers: true,
        }));
      },
      (error) => {
        const message =
          '대여자 목록을 불러오지 못했습니다. rentalBorrowers 조회 권한을 확인해 주세요.';

        console.error('Rental borrowers sync error:', error);
        setSplitRentalBorrowers([]);
        setSplitSourceErrors((prev) => ({
          ...prev,
          borrowers: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          borrowers: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    firebaseAuthUser?.uid,
  ]);

  useEffect(() => {
    const allSplitSourcesReady =
      splitSourceReady.config &&
      splitSourceReady.assets &&
      splitSourceReady.availability &&
      splitSourceReady.borrowers;

    if (!allSplitSourcesReady) {
      return;
    }

    const splitLoadError = Object.values(
      splitSourceErrors
    ).find(Boolean);

    if (splitLoadError) {
      setFirebaseLoadErrorMessage(
        splitLoadError
      );
      setFirebaseReady(true);
      return;
    }

    if (!splitPublicConfig) {
      return;
    }

    const remoteData = mergePersistedData({
      laptops: splitRentalAssets,
      requests: splitRentalAvailability,
      assetCategories:
        splitPublicConfig.assetCategories || [],
      teams: splitPublicConfig.teams || [],
      borrowers: splitRentalBorrowers,
      settings: splitPublicConfig.settings || {},
    });

    setData(remoteData);
    setFirebaseLoadErrorMessage('');
    setFirebaseReady(true);

    if (!initializedRemoteFormRef.current) {
      setForm(
        createDefaultRequestForm(remoteData.settings)
      );
      setTempSettings(remoteData.settings);
      initializedRemoteFormRef.current = true;
    }
  }, [
    splitSourceReady,
    splitSourceErrors,
    splitPublicConfig,
    splitRentalAssets,
    splitRentalAvailability,
    splitRentalBorrowers,
  ]);

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady) {
      setAdminAccountsReady(false);
      return;
    }

    const shouldLoadAdminAccounts =
      Boolean(authenticatedAdminId) && Boolean(currentAuthAdminAccount);

    if (!shouldLoadAdminAccounts) {
      allowAdminAccountsWriteRef.current = false;
      setAdminAccounts([]);
      setAdminAccountsReady(true);
      setAdminAccountsLoadErrorMessage('');
      return;
    }

    setAdminAccountsReady(false);

    const unsubscribe = onSnapshot(
      ADMIN_ACCOUNTS_COLLECTION_REF,
      (snapshot) => {
        try {
          if (snapshot.empty) {
            const message =
              '최상위 adminAccounts 컬렉션에 관리자 문서가 없습니다. 기존 관리자 데이터를 UID 문서로 이전했는지 확인해 주세요.';

            allowAdminAccountsWriteRef.current = false;
            setAdminAccountsRemoteHasData(false);
            adminAccountsLastSyncedRef.current = {};
            adminAccountsApplyingRemoteRef.current = true;
            setAdminAccounts([]);
            clearAdminAuthSession();
            setAuthenticatedAdminId('');
            setAdminAuthExpiresAt(0);
            setAdminAccountsLoadErrorMessage(message);
            setAdminAccountsReady(true);
            return;
          }

          const remoteAdminAccounts = normalizeAdminAccounts(
            snapshot.docs.map((adminDoc) => ({
              ...adminDoc.data(),
              id: adminDoc.id,
            }))
          );

          const remoteSyncMap = Object.fromEntries(
            remoteAdminAccounts.map((account) => [
              account.id,
              JSON.stringify(account),
            ])
          );

          allowAdminAccountsWriteRef.current = true;
          setAdminAccountsRemoteHasData(true);
          setAdminAccountsLoadErrorMessage('');
          adminAccountsLastSyncedRef.current = remoteSyncMap;
          adminAccountsApplyingRemoteRef.current = true;
          setAdminAccounts(remoteAdminAccounts);
          setAdminAccountsReady(true);
        } catch (error) {
          const message =
            '관리자 ID 컬렉션 동기화 처리 중 오류가 발생했습니다.';

          console.error(
            'Admin accounts collection snapshot handling error:',
            error
          );

          allowAdminAccountsWriteRef.current = false;
          setAdminAccountsRemoteHasData(false);
          clearAdminAuthSession();
          setAuthenticatedAdminId('');
          setAdminAuthExpiresAt(0);
          setAdminAccountsLoadErrorMessage(message);
          setAdminAccountsReady(true);
          setToast({
            message,
            type: 'error',
          });
        }
      },
      (error) => {
        const message =
          '관리자 ID 컬렉션 연결 또는 권한 오류가 발생했습니다.';

        console.error('Admin accounts collection sync error:', error);
        allowAdminAccountsWriteRef.current = false;
        setAdminAccountsRemoteHasData(false);
        clearAdminAuthSession();
        setAuthenticatedAdminId('');
        setAdminAuthExpiresAt(0);
        setAdminAccountsLoadErrorMessage(message);
        setAdminAccountsReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    authenticatedAdminId,
    currentAuthAdminAccount,
  ]);

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady) {
      setAdminUserAccountsReady(false);
      return;
    }

    const shouldLoadUserAccounts =
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount);

    if (!shouldLoadUserAccounts) {
      setAdminUserAccounts([]);
      setAdminUserAccountsReady(true);
      setAdminUserAccountsLoadErrorMessage('');
      return;
    }

    setAdminUserAccountsReady(false);
    setAdminUserAccountsLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      USER_ACCOUNTS_COLLECTION_REF,
      (snapshot) => {
        const nextUserAccounts = snapshot.docs
          .map((userDoc) => ({
            ...userDoc.data(),
            uid:
              userDoc.data().uid ||
              userDoc.id,
          }))
          .sort((first, second) =>
            String(
              first.name ||
              first.email ||
              first.uid ||
              ''
            ).localeCompare(
              String(
                second.name ||
                second.email ||
                second.uid ||
                ''
              ),
              'ko'
            )
          );

        setAdminUserAccounts(nextUserAccounts);
        setAdminUserAccountsReady(true);
        setAdminUserAccountsLoadErrorMessage('');
      },
      (error) => {
        const message =
          '회원 계정 목록을 불러오지 못했습니다. Firestore Rules의 userAccounts 목록 조회 권한을 확인해 주세요.';

        console.error(
          'User accounts collection sync error:',
          error
        );

        setAdminUserAccounts([]);
        setAdminUserAccountsReady(true);
        setAdminUserAccountsLoadErrorMessage(message);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    authenticatedAdminId,
    currentAuthAdminAccount,
  ]);

  // 첫 마운트 시 새 대여자 추가용 팀 초기화
  useEffect(() => {
    if (data.teams.length > 0 && !newBorrowerTeam) {
      setNewBorrowerTeam(data.teams[0]);
    }
  }, [data.teams]);

  // 설정 탭으로 변경되거나 시스템 원본 설정 값이 변경될 때 임시 설정 버퍼를 동기화
  useEffect(() => {
    if (adminTab === 'settings') {
      setTempSettings(data.settings);
      setNewHolidayDate(today());
      setNewHolidayName('');
      setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
      setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
      setHolidayImportLoading(false);
    }
  }, [adminTab, data.settings]);

  // 자산 카테고리 탭으로 변경되거나 시스템 원본 카테고리 값이 변경될 때 임시 카테고리 버퍼를 동기화
  useEffect(() => {
    if (adminTab === 'categories') {
      setTempAssetCategories(data.assetCategories || []);
      setTempAssetCategoryRenameMap({});
      setEditingAssetCategoryIndex(null);
      setEditingAssetCategoryName('');
      setDraggingAssetCategoryIndex(null);
      setNewAssetCategory('');
    }
  }, [adminTab, data.assetCategories]);

  // 부서·사용자 탭으로 변경되거나 시스템 원본 부서/사용자 값이 변경될 때 임시 버퍼를 동기화
  useEffect(() => {
    if (adminTab === 'people') {
      setTempTeams(data.teams || []);
      setTempBorrowers(data.borrowers || []);
      setEditingTeamIndex(null);
      setEditingTeamName('');
      setDraggingTeamIndex(null);
      setEditingBorrowerIndex(null);
      setEditingBorrowerName('');
      setDraggingBorrowerIndex(null);
      setNewTeam('');
      setNewBorrower('');
      setNewBorrowerTeam('전체');
    }
  }, [adminTab, data.teams, data.borrowers]);

  useEffect(() => {
    if (adminTab === 'adminAccounts') {
      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);
    }
  }, [adminTab]);

  useEffect(() => {
    if (
      view === 'admin' &&
      firebaseReady &&
      adminAccountsReady &&
      !adminAccountsLoadErrorMessage &&
      (adminAccounts || []).length === 0 &&
      (legacyAdminAccounts || []).length === 0
    ) {
      setAdminTab('adminAccounts');
    }
  }, [
    view,
    firebaseReady,
    adminAccountsReady,
    adminAccountsLoadErrorMessage,
    adminAccounts,
    legacyAdminAccounts,
  ]);

  useEffect(() => {
    if (!authenticatedAdminId) return;
    if (!firebaseAuthReady) return;
    if (!adminAccountsReady) return;

    const expireAdminSession = async () => {
      if (adminLogoutInProgressRef.current) return;

      adminLogoutInProgressRef.current = true;
      setAdminLogoutInProgress(true);

      const expiringAdminAccount =
        (adminAccounts || []).find(
          (account) => account.id === authenticatedAdminId
        ) ||
        (
          currentAuthAdminAccount?.id === authenticatedAdminId
            ? currentAuthAdminAccount
            : null
        );

      const shouldSignOutFirebaseAdmin =
        Boolean(expiringAdminAccount?.authUid) &&
        firebaseAuth.currentUser?.uid === expiringAdminAccount.authUid;

      let firebaseSignOutFailed = false;

      try {
        if (shouldSignOutFirebaseAdmin) {
          await signOut(firebaseAuth);
        }
      } catch (error) {
        firebaseSignOutFailed = true;
        console.error('Expired admin Firebase Auth logout error:', error);
      } finally {
        clearAdminAuthSession();
        setAuthenticatedAdminId('');
        setAdminAuthExpiresAt(0);
        setAdminAuthForm(createDefaultAdminAuthForm());

        adminLogoutInProgressRef.current = false;
        setAdminLogoutInProgress(false);

        setToast({
          message: firebaseSignOutFailed
            ? '관리자 세션은 만료되었지만 Firebase Auth 로그아웃에 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
            : '관리자 세션이 만료되어 로그아웃되었습니다.',
          type: firebaseSignOutFailed ? 'error' : 'success',
        });

        window.setTimeout(() => setToast(null), 3000);
      }
    };

    if (!adminAuthExpiresAt || adminAuthExpiresAt <= Date.now()) {
      void expireAdminSession();
      return;
    }

    const remainingTime = adminAuthExpiresAt - Date.now();

    const sessionTimer = window.setTimeout(() => {
      void expireAdminSession();
    }, remainingTime);

    return () => {
      window.clearTimeout(sessionTimer);
    };
  }, [
    authenticatedAdminId,
    adminAuthExpiresAt,
    firebaseAuthReady,
    adminAccountsReady,
    adminAccounts,
    legacyAdminAccounts,
  ]);

  useEffect(() => {
    if (!authenticatedAdminId) return;
    if (!firebaseReady) return;
    if (!firebaseAuthReady) return;
    if (!adminAccountsReady) return;
    if (adminLogoutInProgressRef.current) return;

    const authenticatedAccount =
      (adminAccounts || []).find(
        (account) => account.id === authenticatedAdminId
      ) ||
      (
        currentAuthAdminAccount?.id === authenticatedAdminId
          ? currentAuthAdminAccount
          : null
      );

    const hasFirebaseAuthMismatch =
      Boolean(authenticatedAccount?.authUid) &&
      firebaseAuth.currentUser?.uid !== authenticatedAccount.authUid;

    if (!authenticatedAccount || hasFirebaseAuthMismatch) {
      clearAdminAuthSession();
      setAuthenticatedAdminId('');
      setAdminAuthExpiresAt(0);
    }
  }, [
    authenticatedAdminId,
    firebaseReady,
    firebaseAuthReady,
    firebaseAuthUser,
    adminAccountsReady,
    adminAccounts,
    legacyAdminAccounts,
  ]);

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const registeredAdminAccounts = adminAccounts || [];

  const authenticatedAdminAccount =
    registeredAdminAccounts.find(
      (account) => account.id === authenticatedAdminId
    ) ||
    (
      currentAuthAdminAccount?.id === authenticatedAdminId
        ? currentAuthAdminAccount
        : null
    );

  const isCurrentFirebaseAuthAdmin =
    Boolean(firebaseAuthUser) &&
    currentAuthRoleReady &&
    Boolean(currentAuthAdminAccount);

  const isCurrentFirebaseAuthGeneralUser =
    Boolean(firebaseAuthUser) &&
    currentAuthRoleReady &&
    !currentAuthRoleErrorMessage &&
    !currentAuthAdminAccount;

  const mergedRentalRequests = useMemo(() => {
    const requestMap = new Map();

    (data.requests || []).forEach((request) => {
      if (!request?.id) return;

      requestMap.set(request.id, request);
    });

    (rentalRequests || []).forEach((request) => {
      if (!request?.id) return;

      requestMap.set(request.id, {
        ...(requestMap.get(request.id) || {}),
        ...request,
      });
    });

    return Array.from(requestMap.values());
  }, [data.requests, rentalRequests]);

  const rentalRequestIdSet = useMemo(
    () =>
      new Set(
        (rentalRequests || [])
          .map((request) => request?.id)
          .filter(Boolean)
      ),
    [rentalRequests]
  );

  const orphanedRentalAvailabilityRequests =
    useMemo(
      () =>
        (data.requests || []).filter(
          (request) =>
            request?.id &&
            !rentalRequestIdSet.has(
              request.id
            )
        ),
      [
        data.requests,
        rentalRequestIdSet,
      ]
    );

  const rentalRequestLogsByRequestId =
    useMemo(() => {
      const logMap = new Map();

      (rentalRequestLogs || []).forEach(
        (log) => {
          if (!log?.requestId) return;

          const currentLogs =
            logMap.get(log.requestId) || [];

          logMap.set(log.requestId, [
            ...currentLogs,
            log,
          ]);
        }
      );

      return logMap;
    }, [rentalRequestLogs]);
  
  const adminRequestTabCounts = useMemo(
    () => {
      const counts = {
        [ADMIN_REQUEST_TAB.PENDING]: 0,
        [ADMIN_REQUEST_TAB.RENTAL]: 0,
        [ADMIN_REQUEST_TAB.CLOSED]: 0,
        [ADMIN_REQUEST_TAB.RETURNED]: 0,
      };

      (mergedRentalRequests || []).forEach(
        (request) => {
          if (
            [
              STATUS.REQUESTED,
              STATUS.ON_HOLD,
            ].includes(request.status)
          ) {
            counts[ADMIN_REQUEST_TAB.PENDING] += 1;
            return;
          }

          if (
            request.status ===
            STATUS.APPROVED
          ) {
            counts[ADMIN_REQUEST_TAB.RENTAL] += 1;
            return;
          }

          if (
            [
              STATUS.DENIED,
              STATUS.USER_CANCELLED,
            ].includes(request.status)
          ) {
            counts[ADMIN_REQUEST_TAB.CLOSED] += 1;
            return;
          }

          if (
            request.status ===
            STATUS.RETURNED
          ) {
            counts[ADMIN_REQUEST_TAB.RETURNED] += 1;
          }
        }
      );

      return counts;
    },
    [mergedRentalRequests]
  );

  const filteredAdminRequests = useMemo(
    () => {
      const normalizedQuery =
        String(
          adminRequestQuery || ''
        ).trim().toLowerCase();

      const getStatusLogTime = (
        request
      ) => {
        const statusLog =
          (
            rentalRequestLogsByRequestId.get(
              request.id
            ) || []
          ).find(
            (log) =>
              [
                RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED,
                RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
              ].includes(log.action) &&
              log.nextStatus ===
                request.status
          );

        return (
          getFirestoreTimestampMillis(
            statusLog?.createdAt
          ) ||
          getFirestoreTimestampMillis(
            request.updatedAt
          ) ||
          getFirestoreTimestampMillis(
            request.createdAt
          ) ||
          Date.parse(
            request.requestedAt || ''
          ) ||
          0
        );
      };

      const tabFilteredRequests =
        (mergedRentalRequests || []).filter(
          (request) => {
            if (
              adminRequestTab ===
              ADMIN_REQUEST_TAB.PENDING
            ) {
              return [
                STATUS.REQUESTED,
                STATUS.ON_HOLD,
              ].includes(request.status);
            }

            if (
              adminRequestTab ===
              ADMIN_REQUEST_TAB.RENTAL
            ) {
              return (
                request.status ===
                STATUS.APPROVED
              );
            }

            if (
              adminRequestTab ===
              ADMIN_REQUEST_TAB.CLOSED
            ) {
              return [
                STATUS.DENIED,
                STATUS.USER_CANCELLED,
              ].includes(request.status);
            }

            return (
              request.status ===
              STATUS.RETURNED
            );
          }
        );

      const queryFilteredRequests =
        normalizedQuery
          ? tabFilteredRequests.filter(
              (request) =>
                [
                  request.assetNo,
                  request.assetCategory,
                  request.requesterName,
                  request.requesterEmail,
                  request.borrower,
                  request.team,
                  request.purpose,
                ]
                  .map((value) =>
                    String(
                      value || ''
                    ).toLowerCase()
                  )
                  .some((value) =>
                    value.includes(
                      normalizedQuery
                    )
                  )
            )
          : tabFilteredRequests;

      return [
        ...queryFilteredRequests,
      ].sort((first, second) => {
        if (
          adminRequestTab ===
          ADMIN_REQUEST_TAB.PENDING
        ) {
          return (
            getStatusLogTime(first) -
            getStatusLogTime(second)
          );
        }

        if (
          adminRequestTab ===
          ADMIN_REQUEST_TAB.RENTAL
        ) {
          const firstOverdue =
            first.dueDate &&
            first.dueDate < today();

          const secondOverdue =
            second.dueDate &&
            second.dueDate < today();

          if (
            firstOverdue !==
            secondOverdue
          ) {
            return firstOverdue
              ? -1
              : 1;
          }

          return String(
            first.dueDate || ''
          ).localeCompare(
            String(
              second.dueDate || ''
            )
          );
        }

        return (
          getStatusLogTime(second) -
          getStatusLogTime(first)
        );
      });
    },
    [
      adminRequestQuery,
      adminRequestTab,
      mergedRentalRequests,
      rentalRequestLogsByRequestId,
    ]
  );

  const adminRequestTotalPages = Math.max(
    1,
    Math.ceil(
      filteredAdminRequests.length /
      adminRequestPageSize
    )
  );

  const safeAdminRequestPage = Math.min(
    adminRequestPage,
    adminRequestTotalPages
  );

  const paginatedAdminRequests = useMemo(
    () =>
      filteredAdminRequests.slice(
        (safeAdminRequestPage - 1) *
          adminRequestPageSize,
        safeAdminRequestPage *
          adminRequestPageSize
      ),
    [
      filteredAdminRequests,
      safeAdminRequestPage,
      adminRequestPageSize,
    ]
  );

  const selectedAdminRequest = useMemo(
    () =>
      selectedAdminRequestId
        ? mergedRentalRequests.find(
            (request) =>
              request.id ===
              selectedAdminRequestId
          ) || null
        : null,
    [
      mergedRentalRequests,
      selectedAdminRequestId,
    ]
  );

  const adminRequestEditBorrowers = useMemo(
    () =>
      (data.borrowers || []).filter(
        (borrower) =>
          borrower.team ===
          adminRequestEditForm.team
      ),
    [
      data.borrowers,
      adminRequestEditForm.team,
    ]
  );

  const noticePostsPerPage = getSafeNoticePostsPerPage(
    noticeBoardConfig.postsPerPage
  );

  const pinnedNoticePosts = useMemo(
    () =>
      (noticePosts || []).filter(
        (post) => post.isPinned
      ),
    [noticePosts]
  );

  const regularNoticePosts = useMemo(
    () =>
      (noticePosts || []).filter(
        (post) => !post.isPinned
      ),
    [noticePosts]
  );

  const noticeTotalPages = Math.max(
    1,
    Math.ceil(
      regularNoticePosts.length /
      noticePostsPerPage
    )
  );

  const safeNoticePage = Math.min(
    noticePage,
    noticeTotalPages
  );

  const paginatedNoticePosts = useMemo(
    () =>
      regularNoticePosts.slice(
        (safeNoticePage - 1) *
          noticePostsPerPage,
        safeNoticePage *
          noticePostsPerPage
      ),
    [
      regularNoticePosts,
      safeNoticePage,
      noticePostsPerPage,
    ]
  );

  const adminNoticeTotalPages = noticeTotalPages;

  const safeAdminNoticePage = Math.min(
    adminNoticePage,
    adminNoticeTotalPages
  );

  const paginatedAdminNoticePosts = useMemo(
    () =>
      regularNoticePosts.slice(
        (safeAdminNoticePage - 1) *
          noticePostsPerPage,
        safeAdminNoticePage *
          noticePostsPerPage
      ),
    [
      regularNoticePosts,
      safeAdminNoticePage,
      noticePostsPerPage,
    ]
  );

  const selectedNoticePost = useMemo(
    () =>
      selectedNoticePostId
        ? noticePosts.find(
            (post) =>
              post.id ===
              selectedNoticePostId
          ) || null
        : null,
    [
      noticePosts,
      selectedNoticePostId,
    ]
  );

  const faqCategoryNameById = useMemo(
    () =>
      new Map(
        (faqCategories || []).map(
          (category) => [
            category.id,
            category.name,
          ]
        )
      ),
    [faqCategories]
  );

  const faqPostsPerPage = getSafeFaqPostsPerPage(
    faqBoardConfig.postsPerPage
  );

  const categoryFilteredFaqPosts = useMemo(
    () =>
      (faqPosts || []).filter(
        (post) =>
          activeFaqCategoryId === 'all' ||
          post.categoryId === activeFaqCategoryId
      ),
    [
      faqPosts,
      activeFaqCategoryId,
    ]
  );

  const pinnedFaqPosts = useMemo(
    () =>
      categoryFilteredFaqPosts.filter(
        (post) => post.isPinned
      ),
    [categoryFilteredFaqPosts]
  );

  const regularFaqPosts = useMemo(
    () =>
      categoryFilteredFaqPosts.filter(
        (post) => !post.isPinned
      ),
    [categoryFilteredFaqPosts]
  );

  const faqTotalPages = Math.max(
    1,
    Math.ceil(
      regularFaqPosts.length /
      faqPostsPerPage
    )
  );

  const safeFaqPage = Math.min(
    faqPage,
    faqTotalPages
  );

  const paginatedFaqPosts = useMemo(
    () =>
      regularFaqPosts.slice(
        (safeFaqPage - 1) *
          faqPostsPerPage,
        safeFaqPage *
          faqPostsPerPage
      ),
    [
      regularFaqPosts,
      safeFaqPage,
      faqPostsPerPage,
    ]
  );

  const adminPinnedFaqPosts = useMemo(
    () =>
      (faqPosts || []).filter(
        (post) => post.isPinned
      ),
    [faqPosts]
  );

  const adminRegularFaqPosts = useMemo(
    () =>
      (faqPosts || []).filter(
        (post) => !post.isPinned
      ),
    [faqPosts]
  );

  const adminFaqTotalPages = Math.max(
    1,
    Math.ceil(
      adminRegularFaqPosts.length /
      faqPostsPerPage
    )
  );

  const safeAdminFaqPage = Math.min(
    adminFaqPage,
    adminFaqTotalPages
  );

  const paginatedAdminFaqPosts = useMemo(
    () =>
      adminRegularFaqPosts.slice(
        (safeAdminFaqPage - 1) *
          faqPostsPerPage,
        safeAdminFaqPage *
          faqPostsPerPage
      ),
    [
      adminRegularFaqPosts,
      safeAdminFaqPage,
      faqPostsPerPage,
    ]
  );

  const currentUserRequests = useMemo(() => {
    if (!firebaseAuthUser?.uid) return [];

    return mergedRentalRequests.filter(
      (request) => request.requesterUid === firebaseAuthUser.uid
    );
  }, [mergedRentalRequests, firebaseAuthUser?.uid]);

  const activeUserActionRentalRequest = useMemo(
    () =>
      userActionDialog?.requestId
        ? currentUserRequests.find(
            (request) =>
              request.id ===
              userActionDialog.requestId
          ) || null
        : null,
    [
      currentUserRequests,
      userActionDialog?.requestId,
    ]
  );

  const userActionBorrowers = useMemo(
    () =>
      (data.borrowers || []).filter(
        (borrower) =>
          borrower.team ===
          userActionForm.team
      ),
    [
      data.borrowers,
      userActionForm.team,
    ]
  );

  const hasMatchingAdminFirebaseAuth =
    Boolean(authenticatedAdminAccount?.authUid) &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    firebaseAuth.currentUser?.uid === authenticatedAdminAccount.authUid &&
    currentAuthAdminAccount?.id === authenticatedAdminAccount.id;

  const isAdminAuthenticated =
    Boolean(authenticatedAdminAccount) &&
    !adminLogoutInProgress &&
    hasMatchingAdminFirebaseAuth;

  const isSplitStorageReady =
    splitStorageVersion >= SPLIT_STORAGE_VERSION;

  const shouldShowAdminLoadingPage =
    view === 'admin' &&
    (
      !firebaseReady ||
      !firebaseAuthReady ||
      !currentAuthRoleReady ||
      !adminAccountsReady ||
      adminLogoutInProgress
    );

  const shouldShowAdminAccountsErrorPage =
    view === 'admin' &&
    firebaseReady &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    adminAccountsReady &&
    Boolean(
      adminAccountsLoadErrorMessage || currentAuthRoleErrorMessage
    );

  const hasAdminAccess =
    view === 'admin' &&
    firebaseReady &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    adminAccountsReady &&
    !firebaseLoadErrorMessage &&
    !adminAccountsLoadErrorMessage &&
    !currentAuthRoleErrorMessage &&
    isAdminAuthenticated;

  const shouldShowAdminLoginPage =
    view === 'admin' &&
    firebaseReady &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    adminAccountsReady &&
    !firebaseLoadErrorMessage &&
    !adminAccountsLoadErrorMessage &&
    !currentAuthRoleErrorMessage &&
    !isAdminAuthenticated;
  
  const finalizeSplitStorageMigration = async () => {
    if (splitStorageFinalizeLoading) {
      return;
    }

    if (!isAdminAuthenticated) {
      triggerToast(
        '분리 저장소 최종 전환은 인증된 관리자만 실행할 수 있습니다.',
        'error'
      );
      return;
    }

    setSplitStorageFinalizeLoading(true);

    try {
      const [
        configSnapshot,
        assetsSnapshot,
        availabilitySnapshot,
        borrowersSnapshot,
        existingRegistrySnapshot,
      ] = await Promise.all([
        getDoc(PUBLIC_CONFIG_DOC_REF),
        getDocs(RENTAL_ASSETS_COLLECTION_REF),
        getDocs(RENTAL_AVAILABILITY_COLLECTION_REF),
        getDocs(RENTAL_BORROWERS_COLLECTION_REF),
        getDocs(RENTAL_ASSET_NUMBERS_COLLECTION_REF),
      ]);

      if (!configSnapshot.exists()) {
        throw new Error('public-config-not-found');
      }

      const currentConfig = configSnapshot.data();
      const currentStorageVersion = Number(
        currentConfig.storageVersion || 0
      );

      if (currentStorageVersion >= SPLIT_STORAGE_VERSION) {
        triggerToast(
          'Firestore 분리 저장소 최종 전환이 이미 완료되어 있습니다.',
          'success'
        );
        return;
      }

      const availabilityByAssetId = new Map();

      availabilitySnapshot.docs.forEach(
        (availabilityDocument) => {
          const availabilityRequest =
            toRentalAvailabilityRequest({
              ...availabilityDocument.data(),
              id: availabilityDocument.id,
            });

          if (
            !availabilityRequest.id ||
            !availabilityRequest.laptopId ||
            !RENTAL_BLOCKING_REQUEST_STATUSES.includes(
              availabilityRequest.status
            )
          ) {
            throw new Error(
              'invalid-availability-document'
            );
          }

          const currentAssetReservations =
            availabilityByAssetId.get(
              availabilityRequest.laptopId
            ) || [];

          currentAssetReservations.push(
            availabilityRequest
          );

          availabilityByAssetId.set(
            availabilityRequest.laptopId,
            currentAssetReservations
          );
        }
      );

      const assetIdSet = new Set(
        assetsSnapshot.docs.map(
          (assetDocument) => assetDocument.id
        )
      );

      for (const availabilityAssetId of availabilityByAssetId.keys()) {
        if (!assetIdSet.has(availabilityAssetId)) {
          throw new Error(
            'availability-asset-not-found'
          );
        }
      }

      const assetNumberRegistryIdSet = new Set();
      const assetOperations = [];
      const registryOperations = [];

      assetsSnapshot.docs.forEach(
        (assetDocument) => {
          const assetData = assetDocument.data();
          const assetNo = String(
            assetData.assetNo || ''
          ).trim();

          if (!assetNo) {
            throw new Error(
              'asset-number-missing'
            );
          }

          const assetNoNormalized =
            normalizeAssetNumber(assetNo);

          const registryId =
            getAssetNumberRegistryId(assetNo);

          if (
            assetNumberRegistryIdSet.has(
              registryId
            )
          ) {
            throw new Error(
              'duplicate-asset-number'
            );
          }

          assetNumberRegistryIdSet.add(
            registryId
          );

          const reservations =
            normalizeAssetReservations(
              availabilityByAssetId.get(
                assetDocument.id
              ) || []
            );

          const representativeRequest =
            getLaptopRepresentativeRequest(
              reservations,
              assetDocument.id
            );

          const nextStatus =
            assetData.status ===
            STATUS.UNAVAILABLE
              ? STATUS.UNAVAILABLE
              : representativeRequest
                ? representativeRequest.status
                : STATUS.AVAILABLE;

          assetOperations.push({
            type: 'set',
            ref: assetDocument.ref,
            data: {
              reservations,
              assetNoNormalized,
              status: nextStatus,
              currentRequestId:
                representativeRequest?.id || null,
              updatedAt: serverTimestamp(),
            },
            options: {
              merge: true,
            },
          });

          registryOperations.push({
            type: 'set',
            ref: doc(
              RENTAL_ASSET_NUMBERS_COLLECTION_REF,
              registryId
            ),
            data: {
              id: registryId,
              assetId: assetDocument.id,
              assetNo,
              assetNoNormalized,
              updatedAt: serverTimestamp(),
            },
          });
        }
      );

      const borrowerOperations =
        borrowersSnapshot.docs.map(
          (borrowerDocument, index) => ({
            type: 'set',
            ref: borrowerDocument.ref,
            data: {
              id: borrowerDocument.id,
              name: String(
                borrowerDocument.data().name || ''
              ),
              team: String(
                borrowerDocument.data().team || ''
              ),
              sortOrder:
                Number.isFinite(
                  Number(
                    borrowerDocument.data().sortOrder
                  )
                )
                  ? Number(
                      borrowerDocument.data().sortOrder
                    )
                  : index,
              updatedAt: serverTimestamp(),
            },
            options: {
              merge: true,
            },
          })
        );

      const registryCleanupOperations =
        existingRegistrySnapshot.docs.map(
          (registryDocument) => ({
            type: 'delete',
            ref: registryDocument.ref,
          })
        );

      await commitFirestoreOperations(
        registryCleanupOperations
      );

      await commitFirestoreOperations([
        ...assetOperations,
        ...registryOperations,
        ...borrowerOperations,
      ]);

      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          storageVersion:
            SPLIT_STORAGE_VERSION,
          storageMode:
            'split-collections',
          storageReady: true,
          storageFinalizedBy:
            firebaseAuth.currentUser?.uid ||
            authenticatedAdminId ||
            '',
          storageFinalizedAt:
            serverTimestamp(),
          storageFinalizedCounts: {
            assets: assetsSnapshot.size,
            availabilityRequests:
              availabilitySnapshot.size,
            borrowers:
              borrowersSnapshot.size,
          },
          updatedAt: serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      triggerToast(
        `Firestore 분리 저장소 최종 전환이 완료되었습니다. 자산 ${assetsSnapshot.size}건, 진행 중 예약 ${availabilitySnapshot.size}건, 대여자 ${borrowersSnapshot.size}건을 검증했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Split storage finalization error:',
        error
      );

      if (
        error?.message ===
        'availability-asset-not-found'
      ) {
        triggerToast(
          'rentalAvailability에 연결된 자산 문서가 없어 최종 전환을 중단했습니다. rentalAssets와 rentalAvailability의 laptopId를 확인해 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'duplicate-asset-number'
      ) {
        triggerToast(
          '중복된 자산관리번호가 있어 최종 전환을 중단했습니다. rentalAssets의 assetNo 중복을 먼저 정리해 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-number-missing'
      ) {
        triggerToast(
          '자산관리번호가 없는 자산 문서가 있어 최종 전환을 중단했습니다.',
          'error'
        );
        return;
      }

      if (
        error?.code ===
        'permission-denied'
      ) {
        triggerToast(
          '분리 저장소 최종 전환 권한이 없습니다. 변경된 Firestore Rules가 게시되었는지 확인해 주세요.',
          'error'
        );
        return;
      }

      triggerToast(
        'Firestore 분리 저장소 최종 전환에 실패했습니다. 기존 분리 컬렉션은 삭제되지 않았으며, 원인을 수정한 뒤 다시 실행할 수 있습니다.',
        'error'
      );
    } finally {
      setSplitStorageFinalizeLoading(false);
    }
  };

    useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady) {
      setRentalRequestsReady(false);
      return;
    }

    if (!firebaseAuthUser || currentAuthRoleErrorMessage) {
      setRentalRequests([]);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
      return;
    }

    setRentalRequestsReady(false);
    setRentalRequestsLoadErrorMessage('');

    const requestSource = isAdminAuthenticated
      ? RENTAL_REQUESTS_COLLECTION_REF
      : firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterUid', '==', firebaseAuthUser.uid)
        );

    const unsubscribe = onSnapshot(
      requestSource,
      (snapshot) => {
        const remoteRequests = snapshot.docs.map((requestDoc) => ({
          ...requestDoc.data(),
          id: requestDoc.id,
        }));

        setRentalRequests(remoteRequests);
        setRentalRequestsLoadErrorMessage('');
        setRentalRequestsReady(true);
      },
      (error) => {
        const message = isAdminAuthenticated
          ? '전체 대여신청 컬렉션을 불러오지 못했습니다. Firestore Rules의 rentalRequests 관리자 조회 권한을 확인해 주세요.'
          : '나의 대여신청 내역을 불러오지 못했습니다. Firestore Rules의 rentalRequests 본인 조회 권한을 확인해 주세요.';

        console.error('Rental requests sync error:', error);

        setRentalRequests([]);
        setRentalRequestsLoadErrorMessage(message);
        setRentalRequestsReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    firebaseAuthUser?.uid,
    isAdminAuthenticated,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthReady ||
      !currentAuthRoleReady
    ) {
      setRentalRequestLogsReady(false);
      return;
    }

    if (!isAdminAuthenticated) {
      setRentalRequestLogs([]);
      setRentalRequestLogsLoadErrorMessage('');
      setRentalRequestLogsReady(true);
      return;
    }

    setRentalRequestLogsReady(false);
    setRentalRequestLogsLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      RENTAL_REQUEST_LOGS_COLLECTION_REF,
      (snapshot) => {
        const remoteLogs = snapshot.docs
          .map((logDoc) => ({
            ...logDoc.data(),
            id: logDoc.id,
          }))
          .sort(
            (first, second) =>
              getFirestoreTimestampMillis(
                second.createdAt
              ) -
              getFirestoreTimestampMillis(
                first.createdAt
              )
          );

        setRentalRequestLogs(remoteLogs);
        setRentalRequestLogsLoadErrorMessage('');
        setRentalRequestLogsReady(true);
      },
      (error) => {
        const message =
          '대여 신청 처리 이력을 불러오지 못했습니다. Firestore Rules의 rentalRequestLogs 관리자 조회 권한을 확인해 주세요.';

        console.error(
          'Rental request logs sync error:',
          error
        );

        setRentalRequestLogs([]);
        setRentalRequestLogsLoadErrorMessage(
          message
        );
        setRentalRequestLogsReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    isAdminAuthenticated,
  ]);

  useEffect(() => {
    setNoticePostsReady(false);
    setNoticePostsLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      NOTICE_POSTS_COLLECTION_REF,
      (snapshot) => {
        const remotePosts = snapshot.docs
          .map((postDoc) => ({
            ...postDoc.data(),
            id: postDoc.id,
          }))
          .sort(
            (first, second) =>
              getFirestoreTimestampMillis(
                second.createdAt
              ) -
              getFirestoreTimestampMillis(
                first.createdAt
              )
          );

        setNoticePosts(remotePosts);
        setNoticePostsLoadErrorMessage('');
        setNoticePostsReady(true);
      },
      (error) => {
        const message =
          '공지사항을 불러오지 못했습니다. Firestore Rules의 noticePosts 읽기 권한을 확인해 주세요.';

        console.error(
          'Notice posts sync error:',
          error
        );

        setNoticePosts([]);
        setNoticePostsLoadErrorMessage(
          message
        );
        setNoticePostsReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setNoticeBoardConfigReady(false);
    setNoticeBoardConfigLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      NOTICE_BOARD_CONFIG_DOC_REF,
      (snapshot) => {
        const postsPerPage =
          getSafeNoticePostsPerPage(
            snapshot.exists()
              ? snapshot.data().postsPerPage
              : DEFAULT_NOTICE_POSTS_PER_PAGE
          );

        setNoticeBoardConfig({
          postsPerPage,
        });
        setNoticePostsPerPageInput(
          postsPerPage
        );
        setNoticeBoardConfigLoadErrorMessage('');
        setNoticeBoardConfigReady(true);
      },
      (error) => {
        const message =
          '공지사항 목록 설정을 불러오지 못해 기본값 10개를 사용합니다.';

        console.error(
          'Notice board config sync error:',
          error
        );

        setNoticeBoardConfig({
          postsPerPage:
            DEFAULT_NOTICE_POSTS_PER_PAGE,
        });
        setNoticePostsPerPageInput(
          DEFAULT_NOTICE_POSTS_PER_PAGE
        );
        setNoticeBoardConfigLoadErrorMessage(
          message
        );
        setNoticeBoardConfigReady(true);
      }
    );

    return unsubscribe;
  }, []);

    useEffect(() => {
    setFaqCategoriesReady(false);
    setFaqCategoriesLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      FAQ_CATEGORIES_COLLECTION_REF,
      (snapshot) => {
        const remoteCategories = snapshot.docs
          .map((categoryDoc) => ({
            ...categoryDoc.data(),
            id: categoryDoc.id,
          }))
          .sort((first, second) => {
            const orderDifference =
              (Number(first.order) || 0) -
              (Number(second.order) || 0);

            if (orderDifference !== 0) {
              return orderDifference;
            }

            return String(
              first.name || ''
            ).localeCompare(
              String(
                second.name || ''
              ),
              'ko'
            );
          });

        setFaqCategories(remoteCategories);
        setFaqCategoriesLoadErrorMessage('');
        setFaqCategoriesReady(true);
      },
      (error) => {
        const message =
          'FAQ 카테고리를 불러오지 못했습니다. Firestore Rules의 faqCategories 읽기 권한을 확인해 주세요.';

        console.error(
          'FAQ categories sync error:',
          error
        );

        setFaqCategories([]);
        setFaqCategoriesLoadErrorMessage(
          message
        );
        setFaqCategoriesReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setFaqPostsReady(false);
    setFaqPostsLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      FAQ_POSTS_COLLECTION_REF,
      (snapshot) => {
        const remotePosts = snapshot.docs
          .map((postDoc) => ({
            ...postDoc.data(),
            id: postDoc.id,
          }))
          .sort(
            (first, second) =>
              getFirestoreTimestampMillis(
                second.createdAt
              ) -
              getFirestoreTimestampMillis(
                first.createdAt
              )
          );

        setFaqPosts(remotePosts);
        setFaqPostsLoadErrorMessage('');
        setFaqPostsReady(true);
      },
      (error) => {
        const message =
          'FAQ를 불러오지 못했습니다. Firestore Rules의 faqPosts 읽기 권한을 확인해 주세요.';

        console.error(
          'FAQ posts sync error:',
          error
        );

        setFaqPosts([]);
        setFaqPostsLoadErrorMessage(
          message
        );
        setFaqPostsReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setFaqBoardConfigReady(false);
    setFaqBoardConfigLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      FAQ_BOARD_CONFIG_DOC_REF,
      (snapshot) => {
        const postsPerPage =
          getSafeFaqPostsPerPage(
            snapshot.exists()
              ? snapshot.data().postsPerPage
              : DEFAULT_FAQ_POSTS_PER_PAGE
          );

        setFaqBoardConfig({
          postsPerPage,
        });
        setFaqPostsPerPageInput(
          postsPerPage
        );
        setFaqBoardConfigLoadErrorMessage('');
        setFaqBoardConfigReady(true);
      },
      (error) => {
        const message =
          'FAQ 목록 설정을 불러오지 못해 기본값 10개를 사용합니다.';

        console.error(
          'FAQ board config sync error:',
          error
        );

        setFaqBoardConfig({
          postsPerPage:
            DEFAULT_FAQ_POSTS_PER_PAGE,
        });
        setFaqPostsPerPageInput(
          DEFAULT_FAQ_POSTS_PER_PAGE
        );
        setFaqBoardConfigLoadErrorMessage(
          message
        );
        setFaqBoardConfigReady(true);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (
      activeFaqCategoryId !== 'all' &&
      !faqCategories.some(
        (category) =>
          category.id === activeFaqCategoryId
      )
    ) {
      setActiveFaqCategoryId('all');
      setExpandedFaqPostId('');
      setFaqPage(1);
    }
  }, [
    faqCategories,
    activeFaqCategoryId,
  ]);

  const setAdminAuthenticatedSession = (adminId) => {
    const nextSession = saveAdminAuthSession(adminId);

    setAuthenticatedAdminId(nextSession.adminId);
    setAdminAuthExpiresAt(nextSession.expiresAt);
  };

  const clearAdminAuthenticatedSession = () => {
    clearAdminAuthSession();
    setAuthenticatedAdminId('');
    setAdminAuthExpiresAt(0);
  };

  useEffect(() => {
    if (!authenticatedAdminAccount) {
      setAdminMyProfileForm(createDefaultAdminAccountEditForm());
      return;
    }

    setAdminMyProfileForm({
      adminLoginId: authenticatedAdminAccount.adminLoginId || '',
      organizationName: authenticatedAdminAccount.organizationName || '',
      userName: authenticatedAdminAccount.userName || '',
      email: authenticatedAdminAccount.authEmail || authenticatedAdminAccount.email || '',
      phone: authenticatedAdminAccount.phone || '',
      newPassword: '',
      newPasswordConfirm: '',
    });
  }, [
    authenticatedAdminAccount?.id,
    authenticatedAdminAccount?.adminLoginId,
    authenticatedAdminAccount?.organizationName,
    authenticatedAdminAccount?.userName,
    authenticatedAdminAccount?.authEmail,
    authenticatedAdminAccount?.email,
    authenticatedAdminAccount?.phone,
  ]);

    const goToUserLogin = () => {
    pushAppPath('user', 'login');
    setView('user');
    setUserTab('login');
    setIsCommunityMenuOpen(false);
  };

  const goToUserSignup = () => {
    pushAppPath('user', 'signup');
    setView('user');
    setUserTab('signup');
    setIsCommunityMenuOpen(false);
  };

  const goToUserMypage = () => {
    if (currentAuthAdminAccount && !isAdminAuthenticated) {
      pushAppPath('admin');
      setView('admin');
      setIsCommunityMenuOpen(false);

      triggerToast(
        '관리자 계정은 관리자 모드에서 다시 인증해 주세요.',
        'error'
      );

      return;
    }

    pushAppPath('user', 'mypage');
    setView('user');
    setUserTab('mypage');
    setIsCommunityMenuOpen(false);
  };

  const logoutUser = async () => {
    setUserAuthLoading(true);

    try {
      await signOut(firebaseAuth);
      clearAdminAuthenticatedSession();
      setUserAuthForm(createDefaultUserAuthForm());
      triggerToast('로그아웃되었습니다.', 'success');
    } catch (error) {
      console.error('User logout error:', error);
      triggerToast('로그아웃 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setUserAuthLoading(false);
    }
  };

  const submitUserAuthForm = async (event) => {
    event.preventDefault();

    const isSignupMode = userTab === 'signup';
    const email = userAuthForm.email.trim();
    const password = userAuthForm.password;
    const passwordConfirm = userAuthForm.passwordConfirm;
    const name = userAuthForm.name.trim();
    const team = userAuthForm.team.trim();
    const phone = userAuthForm.phone.trim();

    if (!email) {
      triggerToast('이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    if (password.length < 6) {
      triggerToast('비밀번호는 6자 이상으로 입력해 주세요.', 'error');
      return;
    }

    if (isSignupMode) {
      if (!name) {
        triggerToast('이름을 입력해 주세요.', 'error');
        return;
      }

      if (!team) {
        triggerToast('부서 / 팀을 입력해 주세요.', 'error');
        return;
      }

      if (password !== passwordConfirm) {
        triggerToast('비밀번호 확인이 일치하지 않습니다.', 'error');
        return;
      }
    }

    let createdSignupUser = null;
    let signedInUserForRoleCheck = null;

    setUserAuthLoading(true);

    try {
      if (isSignupMode) {
        const credential = await createUserWithEmailAndPassword(
          firebaseAuth,
          email,
          password
        );

        createdSignupUser = credential.user;

        await updateProfile(credential.user, {
          displayName: name,
        });

        await setDoc(
          doc(db, USER_ACCOUNTS_COLLECTION_NAME, credential.user.uid),
          {
            uid: credential.user.uid,
            email: credential.user.email || email,
            name,
            team,
            phone,
            status: USER_PROFILE_STATUS.PENDING,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );

        createdSignupUser = null;

        await signOut(firebaseAuth);

        setUserAuthForm(createDefaultUserAuthForm());

        pushAppPath('user', 'login');
        setView('user');
        setUserTab('login');
        setIsCommunityMenuOpen(false);

        triggerToast(
          '가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.',
          'success'
        );

        return;
      } else {
        const credential = await signInWithEmailAndPassword(
          firebaseAuth,
          email,
          password
        );

        signedInUserForRoleCheck = credential.user;

        const adminAccountSnapshot = await getDoc(
          doc(db, 'adminAccounts', credential.user.uid)
        );

        if (adminAccountSnapshot.exists()) {
          await signOut(firebaseAuth);

          signedInUserForRoleCheck = null;

          triggerToast(
            '관리자 계정은 사용자 로그인 화면이 아니라 관리자 모드에서 로그인해 주세요.',
            'error'
          );

          return;
        }

        const userAccountSnapshot = await getDoc(
          doc(
            db,
            USER_ACCOUNTS_COLLECTION_NAME,
            credential.user.uid
          )
        );

        if (!userAccountSnapshot.exists()) {
          await signOut(firebaseAuth);

          signedInUserForRoleCheck = null;

          triggerToast(
            '등록된 회원 정보가 없습니다. 관리자에게 문의해 주세요.',
            'error'
          );

          return;
        }

        const signedInUserStatus =
          userAccountSnapshot.data().status || '';

        if (
          signedInUserStatus !==
          USER_PROFILE_STATUS.ACTIVE
        ) {
          await signOut(firebaseAuth);

          signedInUserForRoleCheck = null;

          const blockedMessage =
            signedInUserStatus ===
            USER_PROFILE_STATUS.PENDING
              ? '관리자 승인 대기 중인 계정입니다.'
              : signedInUserStatus ===
                  USER_PROFILE_STATUS.BLOCKED
                ? '이용이 차단된 계정입니다. 관리자에게 문의해 주세요.'
                : signedInUserStatus ===
                    USER_PROFILE_STATUS.RETIRED
                  ? '이용이 종료된 계정입니다. 관리자에게 문의해 주세요.'
                  : '현재 회원 상태에서는 로그인할 수 없습니다.';

          triggerToast(
            blockedMessage,
            'error'
          );

          return;
        }

        signedInUserForRoleCheck = null;

        clearAdminAuthenticatedSession();
        setUserAuthForm(createDefaultUserAuthForm());
        triggerToast('로그인되었습니다.', 'success');
      }

      pushAppPath('user', 'rental');
      setView('user');
      setUserTab('rental');
      setIsCommunityMenuOpen(false);
    } catch (error) {
      let signupRollbackFailed = false;
      let firebaseAuthCleanupFailed = false;

      if (
        createdSignupUser &&
        firebaseAuth.currentUser?.uid === createdSignupUser.uid
      ) {
        try {
          await deleteUser(createdSignupUser);
        } catch (rollbackError) {
          signupRollbackFailed = true;
          console.error('User signup rollback error:', rollbackError);

          try {
            await signOut(firebaseAuth);
          } catch (cleanupError) {
            firebaseAuthCleanupFailed = true;
            console.error(
              'Failed signup Firebase Auth cleanup error:',
              cleanupError
            );
          }
        }
      }

      if (
        signedInUserForRoleCheck &&
        firebaseAuth.currentUser?.uid === signedInUserForRoleCheck.uid
      ) {
        try {
          await signOut(firebaseAuth);
        } catch (logoutError) {
          firebaseAuthCleanupFailed = true;
          console.error('User role-check logout error:', logoutError);
        }
      }

      clearAdminAuthenticatedSession();

      console.error('User auth error:', error);

      const baseErrorMessage = signupRollbackFailed
        ? '회원 프로필 저장과 생성된 인증 계정 정리에 실패했습니다. Firebase Authentication과 userAccounts 컬렉션을 확인해 주세요.'
        : getUserAuthErrorMessage(error);

      triggerToast(
        firebaseAuthCleanupFailed
          ? `${baseErrorMessage} Firebase Auth 로그아웃에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.`
          : baseErrorMessage,
        'error'
      );
    } finally {
      setUserAuthLoading(false);
    }
  };

    const authenticateAdmin = async () => {
    const adminEmail = adminAuthForm.adminLoginId.trim();
    const password = adminAuthForm.password;

    if (!adminEmail) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    let signedInAdminUser = null;

    setAdminAuthLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        adminEmail,
        password
      );

      signedInAdminUser = credential.user;

      const adminAccountDocRef = doc(
        db,
        'adminAccounts',
        credential.user.uid
      );

      const adminAccountSnapshot = await getDoc(adminAccountDocRef);

      if (!adminAccountSnapshot.exists()) {
        await signOut(firebaseAuth);
        signedInAdminUser = null;

        triggerToast(
          'Firebase Auth 로그인은 성공했지만 등록된 관리자 권한이 없습니다.',
          'error'
        );

        return;
      }

      const matchedAdminAccount = normalizeAdminAccounts([
        {
          ...adminAccountSnapshot.data(),
          id: adminAccountSnapshot.id,
        },
      ])[0];

      const hasValidAdminUidStructure =
        Boolean(matchedAdminAccount) &&
        adminAccountSnapshot.id === credential.user.uid &&
        matchedAdminAccount.id === credential.user.uid &&
        matchedAdminAccount.authUid === credential.user.uid;

      if (!hasValidAdminUidStructure) {
        throw new Error('admin-auth-uid-mismatch');
      }

      if (
        matchedAdminAccount.lockUntil &&
        matchedAdminAccount.lockUntil > Date.now()
      ) {
        const remainingMinutes = Math.ceil(
          (matchedAdminAccount.lockUntil - Date.now()) / 60000
        );

        await signOut(firebaseAuth);
        signedInAdminUser = null;

        triggerToast(
          `관리자 계정이 잠금 상태입니다. 약 ${remainingMinutes}분 후 다시 시도해 주세요.`,
          'error'
        );

        return;
      }

      const nowText = new Date().toLocaleString('ko-KR');

      const nextAdminAccount = {
        ...matchedAdminAccount,
        id: credential.user.uid,
        authUid: credential.user.uid,
        authEmail:
          credential.user.email ||
          matchedAdminAccount.authEmail ||
          '',
        authProvider: 'firebase-auth',
        failedLoginCount: 0,
        lockUntil: 0,
        lastLoginAt: nowText,
        updatedAt: nowText,
      };

      await setDoc(
        adminAccountDocRef,
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCurrentAuthAdminAccount(nextAdminAccount);
      setCurrentAuthRoleErrorMessage('');
      setCurrentAuthRoleReady(true);

      setAdminAccounts((prev) => [
        nextAdminAccount,
        ...(prev || []).filter(
          (account) => account.id !== nextAdminAccount.id
        ),
      ]);

      setAdminAuthenticatedSession(nextAdminAccount.id);
      setAdminAuthForm(createDefaultAdminAuthForm());

      signedInAdminUser = null;

      triggerToast(
        `[${nextAdminAccount.adminLoginId}] 관리자 인증이 완료되었습니다.`,
        'success'
      );
    } catch (error) {
      let firebaseAuthCleanupFailed = false;

      if (
        signedInAdminUser &&
        firebaseAuth.currentUser?.uid === signedInAdminUser.uid
      ) {
        try {
          await signOut(firebaseAuth);
        } catch (logoutError) {
          firebaseAuthCleanupFailed = true;
          console.error('Failed admin login cleanup error:', logoutError);
        }
      }

      clearAdminAuthenticatedSession();
      setCurrentAuthAdminAccount(null);

      console.error('Admin authentication error:', error);

      const baseErrorMessage = getAdminFirebaseAuthErrorMessage(error);

      triggerToast(
        firebaseAuthCleanupFailed
          ? `${baseErrorMessage} Firebase Auth 로그아웃에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.`
          : baseErrorMessage,
        'error'
      );
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const logoutAdmin = async () => {
    if (adminLogoutInProgressRef.current || adminLogoutInProgress) return;

    adminLogoutInProgressRef.current = true;
    setAdminLogoutInProgress(true);

    const adminAccountForLogout =
      authenticatedAdminAccount || currentAuthAdminAccount;

    const shouldSignOutFirebaseAdmin =
      Boolean(adminAccountForLogout?.authUid) &&
      firebaseAuth.currentUser?.uid === adminAccountForLogout.authUid;

    let firebaseSignOutFailed = false;

    try {
      if (shouldSignOutFirebaseAdmin) {
        await signOut(firebaseAuth);
      }
    } catch (error) {
      firebaseSignOutFailed = true;
      console.error('Admin Firebase Auth logout error:', error);
    } finally {
      clearAdminAuthenticatedSession();
      setAdminAuthForm(createDefaultAdminAuthForm());

      adminLogoutInProgressRef.current = false;
      setAdminLogoutInProgress(false);

      triggerToast(
        firebaseSignOutFailed
          ? '관리자 화면 인증은 해제되었지만 Firebase Auth 로그아웃에 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
          : '관리자 인증이 해제되었습니다.',
        firebaseSignOutFailed ? 'error' : 'success'
      );
    }
  };

  const selectedAdminOrganizationName =
    adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE
      ? adminAccountForm.customOrganizationName.trim()
      : adminAccountForm.organizationName;

  const adminAccountUserOptions = data.borrowers.filter(
    (borrower) => borrower.team === selectedAdminOrganizationName
  );

  const selectedAdminUserName =
    adminAccountForm.userName === ADMIN_CUSTOM_OPTION_VALUE ||
    adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE
      ? adminAccountForm.customUserName.trim()
      : adminAccountForm.userName;

  const adminAccountTotalPages = Math.max(
    1,
    Math.ceil((registeredAdminAccounts || []).length / ADMIN_ACCOUNT_PAGE_SIZE)
  );

  const safeAdminAccountPage = Math.min(adminAccountPage, adminAccountTotalPages);

  const paginatedAdminAccounts = (registeredAdminAccounts || []).slice(
    (safeAdminAccountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE,
    safeAdminAccountPage * ADMIN_ACCOUNT_PAGE_SIZE
  );

  const managedUserAccounts = useMemo(() => {
    const adminUidSet = new Set(
      (registeredAdminAccounts || [])
        .flatMap((account) => [
          account.id,
          account.authUid,
        ])
        .filter(Boolean)
    );

    return (adminUserAccounts || []).filter(
      (account) =>
        !adminUidSet.has(account.uid)
    );
  }, [
    adminUserAccounts,
    registeredAdminAccounts,
  ]);

  const filteredManagedUserAccounts =
    useMemo(() => {
      const normalizedQuery =
        adminUserAccountQuery
          .trim()
          .toLowerCase();

      return managedUserAccounts.filter(
        (account) => {
          const accountStatus =
            account.status || '';

          const matchesStatus =
            adminUserAccountStatusFilter ===
              'all' ||
            accountStatus ===
              adminUserAccountStatusFilter;

          if (!matchesStatus) {
            return false;
          }

          if (!normalizedQuery) {
            return true;
          }

          return [
            account.name,
            account.email,
            account.team,
            account.phone,
            account.uid,
          ].some((value) =>
            String(value || '')
              .toLowerCase()
              .includes(normalizedQuery)
          );
        }
      );
    }, [
      managedUserAccounts,
      adminUserAccountQuery,
      adminUserAccountStatusFilter,
    ]);

  const adminUserAccountStatusCounts =
    useMemo(
      () => ({
        pending:
          managedUserAccounts.filter(
            (account) =>
              account.status ===
              USER_PROFILE_STATUS.PENDING
          ).length,

        active:
          managedUserAccounts.filter(
            (account) =>
              account.status ===
              USER_PROFILE_STATUS.ACTIVE
          ).length,

        blocked:
          managedUserAccounts.filter(
            (account) =>
              account.status ===
              USER_PROFILE_STATUS.BLOCKED
          ).length,

        retired:
          managedUserAccounts.filter(
            (account) =>
              account.status ===
              USER_PROFILE_STATUS.RETIRED
          ).length,
      }),
      [managedUserAccounts]
    );

  const getUserAccountStatusLabel = (
    status
  ) => {
    if (
      status ===
      USER_PROFILE_STATUS.PENDING
    ) {
      return '승인 대기';
    }

    if (
      status ===
      USER_PROFILE_STATUS.ACTIVE
    ) {
      return '활성';
    }

    if (
      status ===
      USER_PROFILE_STATUS.BLOCKED
    ) {
      return '차단';
    }

    if (
      status ===
      USER_PROFILE_STATUS.RETIRED
    ) {
      return '이용 종료';
    }

    return '상태 미지정';
  };

  const getUserAccountStatusClassName = (
    status
  ) => {
    if (
      status ===
      USER_PROFILE_STATUS.PENDING
    ) {
      return 'border-amber-200 bg-amber-50 text-amber-700';
    }

    if (
      status ===
      USER_PROFILE_STATUS.ACTIVE
    ) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    if (
      status ===
      USER_PROFILE_STATUS.BLOCKED
    ) {
      return 'border-rose-200 bg-rose-50 text-rose-700';
    }

    if (
      status ===
      USER_PROFILE_STATUS.RETIRED
    ) {
      return 'border-slate-300 bg-slate-100 text-slate-700';
    }

    return 'border-slate-200 bg-white text-slate-600';
  };

  const updateUserAccountStatus = async (
    account,
    nextStatus
  ) => {
    const userUid =
      account?.uid || '';

    if (
      !isAdminAuthenticated ||
      !userUid
    ) {
      triggerToast(
        '관리자 인증과 회원 UID를 확인해 주세요.',
        'error'
      );
      return;
    }

    if (
      ![
        USER_PROFILE_STATUS.PENDING,
        USER_PROFILE_STATUS.ACTIVE,
        USER_PROFILE_STATUS.BLOCKED,
        USER_PROFILE_STATUS.RETIRED,
      ].includes(nextStatus)
    ) {
      triggerToast(
        '지원하지 않는 회원 상태입니다.',
        'error'
      );
      return;
    }

    setAdminUserAccountSavingUid(
      userUid
    );

    try {
      await setDoc(
        doc(
          db,
          USER_ACCOUNTS_COLLECTION_NAME,
          userUid
        ),
        {
          status: nextStatus,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      triggerToast(
        `${
          account.name ||
          account.email ||
          userUid
        } 회원을 ${getUserAccountStatusLabel(
          nextStatus
        )} 상태로 변경했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'User account status update error:',
        error
      );

      triggerToast(
        `회원 상태 변경에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setAdminUserAccountSavingUid('');
    }
  };

  const confirmUserAccountStatusChange = (
    account,
    nextStatus
  ) => {
    const accountLabel =
      account?.name ||
      account?.email ||
      account?.uid ||
      '선택한 회원';

    triggerConfirm(
      '회원 상태 변경',
      `${accountLabel} 회원을 ${getUserAccountStatusLabel(
        nextStatus
      )} 상태로 변경하시겠습니까?`,
      () =>
        updateUserAccountStatus(
          account,
          nextStatus
        )
    );
  };

  const registerAdminAccount = async () => {
    const adminLoginId = adminAccountForm.adminLoginId.trim();
    const password = adminAccountForm.password;
    const organizationName = selectedAdminOrganizationName;
    const userName = selectedAdminUserName;
    const email = adminAccountForm.email.trim();
    const phone = adminAccountForm.phone.trim();

    if (!adminLoginId) {
      triggerToast('관리자 ID를 입력해 주세요.', 'error');
      return;
    }

    if (!email) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('초기 비밀번호를 입력해 주세요.', 'error');
      return;
    }

    if (password.length < 6) {
      triggerToast('초기 비밀번호는 6자 이상으로 입력해 주세요.', 'error');
      return;
    }

    if (!organizationName) {
      triggerToast('조직명을 선택하거나 직접 입력해 주세요.', 'error');
      return;
    }

    if (!userName) {
      triggerToast('사용자명을 선택하거나 직접 입력해 주세요.', 'error');
      return;
    }

    const duplicatedAdminId = (registeredAdminAccounts || []).some(
      (account) =>
        String(account.adminLoginId || '').trim().toLowerCase() ===
        adminLoginId.toLowerCase()
    );

    if (duplicatedAdminId) {
      triggerToast('이미 등록된 관리자 ID입니다.', 'error');
      return;
    }

    const duplicatedAdminEmail = (registeredAdminAccounts || []).some((account) => {
      const accountEmail = String(account.email || '').trim().toLowerCase();
      const accountAuthEmail = String(account.authEmail || '').trim().toLowerCase();

      return (
        accountEmail === email.toLowerCase() ||
        accountAuthEmail === email.toLowerCase()
      );
    });

    if (duplicatedAdminEmail) {
      triggerToast('이미 등록된 관리자 로그인 이메일입니다.', 'error');
      return;
    }

    let createdAdminUser = null;

    try {
      const nowText = new Date().toLocaleString('ko-KR');

      const credential = await createUserWithEmailAndPassword(
        adminAccountCreationAuth,
        email,
        password
      );

      createdAdminUser = credential.user;

      await updateProfile(credential.user, {
        displayName: userName || adminLoginId,
      });

      const nextAdminAccount = {
        id: credential.user.uid,
        adminLoginId,
        authUid: credential.user.uid,
        authEmail: email,
        authProvider: 'firebase-auth',
        authLinkedAt: nowText,
        passwordHash: '',
        passwordSalt: '',
        passwordHashAlgorithm: 'Firebase Auth',
        passwordHashIterations: 0,
        failedLoginCount: 0,
        lockUntil: 0,
        lastLoginAt: '',
        passwordChangedAt: nowText,
        organizationName,
        userName,
        email,
        phone,
        createdAt: nowText,
        updatedAt: nowText,
      };

      await setDoc(doc(db, 'adminAccounts', credential.user.uid), {
        ...nextAdminAccount,
        syncedAt: serverTimestamp(),
      });

      await signOut(adminAccountCreationAuth).catch((error) => {
        console.error('Secondary admin auth sign-out error:', error);
      });

      setAdminAccounts((prev) => [
        nextAdminAccount,
        ...(prev || []).filter(
          (account) => account.id !== nextAdminAccount.id
        ),
      ]);

      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);

      triggerToast(
        `[${adminLoginId}] Firebase Auth 관리자 계정이 등록되었습니다.`,
        'success'
      );
    } catch (error) {
      if (createdAdminUser) {
        await deleteUser(createdAdminUser).catch((rollbackError) => {
          console.error('Admin Auth rollback error:', rollbackError);
        });
      }

      await signOut(adminAccountCreationAuth).catch(() => {});

      console.error('Admin Firebase Auth account creation error:', error);
      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    }
  };

  const startEditAdminAccount = (account) => {
    setEditingAdminAccountId(account.id);
    setAdminAccountEditForm({
      adminLoginId: account.adminLoginId || '',
      organizationName: account.organizationName || '',
      userName: account.userName || '',
      email: account.authEmail || account.email || '',
      phone: account.phone || '',
      newPassword: '',
      newPasswordConfirm: '',
    });
  };

  const cancelEditAdminAccount = () => {
    setEditingAdminAccountId('');
    setAdminAccountEditForm(createDefaultAdminAccountEditForm());
  };

  const sendAdminAccountPasswordResetEmail = async (account) => {
    const email = String(account.authEmail || account.email || '').trim();

    if (!account.authUid) {
      triggerToast('기존 해시 계정은 수정 화면의 새 비밀번호 입력으로 직접 변경할 수 있습니다.', 'error');
      return;
    }

    if (!email) {
      triggerToast('비밀번호 재설정 메일을 보낼 관리자 이메일이 없습니다.', 'error');
      return;
    }

    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      triggerToast(`[${account.adminLoginId}] 관리자에게 비밀번호 재설정 메일을 발송했습니다.`, 'success');
    } catch (error) {
      console.error('Admin password reset email error:', error);
      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    }
  };

  const saveAdminAccountEdit = async (account) => {
    const adminLoginId = adminAccountEditForm.adminLoginId.trim();
    const organizationName = adminAccountEditForm.organizationName.trim();
    const userName = adminAccountEditForm.userName.trim();
    const phone = adminAccountEditForm.phone.trim();
    const email = String(account.authEmail || account.email || '').trim();

    const newPassword = adminAccountEditForm.newPassword || '';
    const newPasswordConfirm = adminAccountEditForm.newPasswordConfirm || '';
    const shouldChangePassword = Boolean(newPassword || newPasswordConfirm);

    if (!account.id || !account.authUid || account.id !== account.authUid) {
      triggerToast(
        '관리자 UID 문서 구조가 올바르지 않습니다. 문서 ID와 authUid가 같은지 확인해 주세요.',
        'error'
      );
      return;
    }

    if (!adminLoginId) {
      triggerToast('관리자 ID를 입력해 주세요.', 'error');
      return;
    }

    if (!organizationName) {
      triggerToast('조직명을 입력해 주세요.', 'error');
      return;
    }

    if (!userName) {
      triggerToast('사용자명을 입력해 주세요.', 'error');
      return;
    }

    if (!email) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (shouldChangePassword) {
      if (newPassword.length < 6) {
        triggerToast('새 비밀번호는 6자 이상으로 입력해 주세요.', 'error');
        return;
      }

      if (newPassword !== newPasswordConfirm) {
        triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
        return;
      }

      if (account.id !== authenticatedAdminId) {
        triggerToast(
          '다른 Firebase Auth 관리자 계정의 비밀번호는 직접 지정할 수 없습니다. 비밀번호 재설정 메일 발송 기능을 사용해 주세요.',
          'error'
        );
        return;
      }

      if (firebaseAuthUser?.uid !== account.authUid) {
        triggerToast(
          '현재 Firebase Auth 관리자 세션을 확인할 수 없습니다. 로그아웃 후 다시 로그인한 다음 비밀번호를 변경해 주세요.',
          'error'
        );
        return;
      }
    }

    const duplicatedAdminId = (registeredAdminAccounts || []).some(
      (item) =>
        item.id !== account.id &&
        String(item.adminLoginId || '').trim().toLowerCase() ===
          adminLoginId.toLowerCase()
    );

    if (duplicatedAdminId) {
      triggerToast('이미 등록된 관리자 ID입니다.', 'error');
      return;
    }

    const duplicatedAdminEmail = (registeredAdminAccounts || []).some((item) => {
      if (item.id === account.id) return false;

      const itemEmail = String(item.email || '').trim().toLowerCase();
      const itemAuthEmail = String(item.authEmail || '').trim().toLowerCase();

      return (
        itemEmail === email.toLowerCase() ||
        itemAuthEmail === email.toLowerCase()
      );
    });

    if (duplicatedAdminEmail) {
      triggerToast('이미 등록된 관리자 로그인 이메일입니다.', 'error');
      return;
    }

    if (
      adminAccountEditForm.email.trim() &&
      adminAccountEditForm.email.trim().toLowerCase() !== email.toLowerCase()
    ) {
      triggerToast(
        'Firebase Auth 연결 계정의 로그인 이메일은 이 화면에서 변경하지 않습니다.',
        'error'
      );
      return;
    }

    let firebasePasswordChanged = false;

    try {
      const nowText = new Date().toLocaleString('ko-KR');
      let passwordUpdateFields = {};

      if (shouldChangePassword) {
        await updatePassword(firebaseAuthUser, newPassword);
        firebasePasswordChanged = true;

        passwordUpdateFields = {
          passwordChangedAt: nowText,
        };
      }

      const nextAdminAccount = {
        ...account,
        ...passwordUpdateFields,
        id: account.id,
        authUid: account.id,
        adminLoginId,
        organizationName,
        userName,
        email,
        phone,
        updatedAt: nowText,
      };

      await setDoc(
        doc(db, 'adminAccounts', account.id),
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAdminAccounts((prev) =>
        (prev || []).map((item) =>
          item.id === account.id ? nextAdminAccount : item
        )
      );

      if (currentAuthAdminAccount?.id === account.id) {
        setCurrentAuthAdminAccount(nextAdminAccount);
      }

      cancelEditAdminAccount();

      triggerToast(
        shouldChangePassword
          ? `[${adminLoginId}] 관리자 정보와 비밀번호가 수정되었습니다.`
          : `[${adminLoginId}] 관리자 정보가 수정되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error('Admin account edit error:', error);

      if (firebasePasswordChanged) {
        triggerToast(
          '비밀번호는 변경되었지만 관리자 정보 저장에 실패했습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
          'error'
        );
        return;
      }

      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    }
  };

  const deleteAdminAccount = (account) => {
    if ((registeredAdminAccounts || []).length <= 1) {
      triggerToast('마지막 관리자 ID는 삭제할 수 없습니다.', 'error');
      return;
    }

    if (account.id === authenticatedAdminId) {
      triggerToast(
        '현재 로그인 중인 본인 관리자 ID는 관리자 ID 현황에서 삭제할 수 없습니다. 로그아웃 후 다른 관리자로 삭제해 주세요.',
        'error'
      );
      return;
    }

    if (!account.id || !account.authUid || account.id !== account.authUid) {
      triggerToast(
        '관리자 UID 문서 구조가 올바르지 않습니다. 문서 ID와 authUid가 같은지 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      '관리자 ID 삭제',
      `[${account.adminLoginId}] 관리자 권한을 삭제합니다. Firebase Auth 계정 자체는 Spark 무료/클라이언트 환경에서는 삭제하지 않고, 이 시스템의 관리자 권한만 제거됩니다.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'adminAccounts', account.id));

          setAdminAccounts((prev) =>
            (prev || []).filter((item) => item.id !== account.id)
          );

          if (editingAdminAccountId === account.id) {
            cancelEditAdminAccount();
          }

          triggerToast(
            `[${account.adminLoginId}] 관리자 ID가 삭제되었습니다.`,
            'success'
          );
        } catch (error) {
          console.error('Admin account delete error:', error);
          triggerToast(
            '관리자 ID 삭제에 실패했습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
            'error'
          );
        }
      }
    );
  };

  const saveMyUserProfile = async () => {
    if (!firebaseAuthUser) {
      triggerToast('로그인 후 마이페이지를 수정할 수 있습니다.', 'error');
      return;
    }

    if (!currentAuthRoleReady) {
      triggerToast('현재 로그인 계정의 권한을 확인하는 중입니다.', 'error');
      return;
    }

    if (currentAuthRoleErrorMessage) {
      triggerToast(currentAuthRoleErrorMessage, 'error');
      return;
    }

    if (currentAuthAdminAccount) {
      triggerToast('관리자 계정은 일반 회원 정보를 수정할 수 없습니다.', 'error');
      return;
    }

    const name = userProfileForm.name.trim();
    const team = userProfileForm.team.trim();
    const phone = userProfileForm.phone.trim();
    const newPassword = userProfileForm.newPassword || '';
    const newPasswordConfirm = userProfileForm.newPasswordConfirm || '';
    const shouldChangePassword = Boolean(newPassword || newPasswordConfirm);

    if (!name) {
      triggerToast('이름을 입력해 주세요.', 'error');
      return;
    }

    if (!team) {
      triggerToast('부서 / 팀을 입력해 주세요.', 'error');
      return;
    }

    if (shouldChangePassword) {
      if (newPassword.length < 6) {
        triggerToast('새 비밀번호는 6자 이상으로 입력해 주세요.', 'error');
        return;
      }

      if (newPassword !== newPasswordConfirm) {
        triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
        return;
      }
    }

    setUserProfileSaving(true);

    try {
      if (shouldChangePassword) {
        await updatePassword(firebaseAuthUser, newPassword);
      }

      await updateProfile(firebaseAuthUser, {
        displayName: name,
      });

      await setDoc(
        doc(db, USER_ACCOUNTS_COLLECTION_NAME, firebaseAuthUser.uid),
        {
          ...(userProfile || {}),
          uid: firebaseAuthUser.uid,
          email: firebaseAuthUser.email || userProfile?.email || '',
          name,
          team,
          phone,
          status: userProfile?.status || USER_PROFILE_STATUS.PENDING,
          createdAt: userProfile?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setUserProfileForm((prev) => ({
        ...prev,
        newPassword: '',
        newPasswordConfirm: '',
      }));

      triggerToast(
        shouldChangePassword
          ? '마이페이지 정보와 비밀번호가 수정되었습니다.'
          : '마이페이지 정보가 수정되었습니다.',
        'success'
      );
    } catch (error) {
      console.error('User profile save error:', error);
      triggerToast(getUserAuthErrorMessage(error), 'error');
    } finally {
      setUserProfileSaving(false);
    }
  };

  const saveMyAdminProfile = async () => {
    if (!authenticatedAdminAccount) {
      triggerToast('관리자 인증 후 내 정보를 수정할 수 있습니다.', 'error');
      return;
    }

    if (
      !authenticatedAdminAccount.id ||
      !authenticatedAdminAccount.authUid ||
      authenticatedAdminAccount.id !== authenticatedAdminAccount.authUid ||
      firebaseAuthUser?.uid !== authenticatedAdminAccount.authUid
    ) {
      triggerToast(
        '현재 관리자 UID 문서와 Firebase Auth 세션이 일치하지 않습니다. 로그아웃 후 다시 로그인해 주세요.',
        'error'
      );
      return;
    }

    const adminLoginId = adminMyProfileForm.adminLoginId.trim();
    const organizationName = adminMyProfileForm.organizationName.trim();
    const userName = adminMyProfileForm.userName.trim();
    const email = String(
      authenticatedAdminAccount.authEmail ||
        authenticatedAdminAccount.email ||
        adminMyProfileForm.email ||
        ''
    ).trim();
    const phone = adminMyProfileForm.phone.trim();
    const newPassword = adminMyProfileForm.newPassword || '';
    const newPasswordConfirm = adminMyProfileForm.newPasswordConfirm || '';
    const shouldChangePassword = Boolean(newPassword || newPasswordConfirm);

    if (!adminLoginId) {
      triggerToast('관리자 ID를 입력해 주세요.', 'error');
      return;
    }

    if (!organizationName) {
      triggerToast('조직명을 입력해 주세요.', 'error');
      return;
    }

    if (!userName) {
      triggerToast('사용자명을 입력해 주세요.', 'error');
      return;
    }

    if (shouldChangePassword) {
      if (newPassword.length < 6) {
        triggerToast('새 비밀번호는 6자 이상으로 입력해 주세요.', 'error');
        return;
      }

      if (newPassword !== newPasswordConfirm) {
        triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
        return;
      }
    }

    const duplicatedAdminId = (registeredAdminAccounts || []).some(
      (account) =>
        account.id !== authenticatedAdminAccount.id &&
        String(account.adminLoginId || '').trim().toLowerCase() ===
          adminLoginId.toLowerCase()
    );

    if (duplicatedAdminId) {
      triggerToast('이미 등록된 관리자 ID입니다.', 'error');
      return;
    }

    setAdminMyProfileSaving(true);
    let firebasePasswordChanged = false;

    try {
      const nowText = new Date().toLocaleString('ko-KR');
      let passwordUpdateFields = {};

      if (shouldChangePassword) {
        await updatePassword(firebaseAuthUser, newPassword);
        firebasePasswordChanged = true;

        passwordUpdateFields = {
          passwordChangedAt: nowText,
        };
      }

      const nextAdminAccount = {
        ...authenticatedAdminAccount,
        ...passwordUpdateFields,
        id: authenticatedAdminAccount.id,
        authUid: authenticatedAdminAccount.id,
        authProvider: 'firebase-auth',
        passwordHash: '',
        passwordSalt: '',
        passwordHashAlgorithm: 'Firebase Auth',
        passwordHashIterations: 0,
        adminLoginId,
        organizationName,
        userName,
        email,
        phone,
        updatedAt: nowText,
      };

      await setDoc(
        doc(db, 'adminAccounts', authenticatedAdminAccount.id),
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCurrentAuthAdminAccount(nextAdminAccount);

      setAdminAccounts((prev) =>
        (prev || []).map((account) =>
          account.id === authenticatedAdminAccount.id
            ? nextAdminAccount
            : account
        )
      );

      setAdminMyProfileForm((prev) => ({
        ...prev,
        newPassword: '',
        newPasswordConfirm: '',
      }));

      triggerToast(
        shouldChangePassword
          ? '관리자 내 정보와 비밀번호가 수정되었습니다.'
          : '관리자 내 정보가 수정되었습니다.',
        'success'
      );
    } catch (error) {
      console.error('Admin my profile save error:', error);

      if (firebasePasswordChanged) {
        triggerToast(
          '비밀번호는 변경되었지만 관리자 정보 저장에 실패했습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
          'error'
        );
      } else {
        triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
      }
    } finally {
      setAdminMyProfileSaving(false);
    }
  };

  const addTempHoliday = () => {
    const holidayDate = newHolidayDate;
    const holidayName = newHolidayName.trim();

    if (!holidayDate) {
      triggerToast('휴일 날짜를 선택해 주세요.', 'error');
      return;
    }

    if ((tempSettings.holidays || []).some((holiday) => holiday.date === holidayDate)) {
      triggerToast('이미 등록된 휴일 날짜입니다.', 'error');
      return;
    }

    const nextHoliday = {
      date: holidayDate,
      name: holidayName || HOLIDAY_TYPE_LABEL[newHolidayType] || '휴일',
      type: newHolidayType || DEFAULT_HOLIDAY_TYPE,
      enabled: true,
    };

    setTempSettings((prev) => ({
      ...prev,
      holidays: [...(prev.holidays || []), nextHoliday].sort((a, b) =>
        String(a.date).localeCompare(String(b.date))
      ),
    }));

    setNewHolidayName('');
    triggerToast(`[${formatDateWithKoreanWeekday(holidayDate)}] 휴일이 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const deleteTempHoliday = (targetIndex) => {
    const targetHoliday = (tempSettings.holidays || [])[targetIndex];

    setTempSettings((prev) => ({
      ...prev,
      holidays: (prev.holidays || []).filter((_, index) => index !== targetIndex),
    }));

    triggerToast(`[${targetHoliday?.name || '휴일'}] 휴일이 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const mergeImportedHolidays = (currentHolidays = [], importedHolidays = []) => {
    const holidayMap = new Map();

    currentHolidays.forEach((holiday) => {
      if (!holiday?.date) return;

      holidayMap.set(holiday.date, {
        date: holiday.date,
        name: holiday.name || '',
        type: holiday.type || DEFAULT_HOLIDAY_TYPE,
        enabled: holiday.enabled !== false,
      });
    });

    importedHolidays.forEach((holiday) => {
      if (!holiday?.date) return;

      const existingHoliday = holidayMap.get(holiday.date);

      if (existingHoliday && ['company', 'manual'].includes(existingHoliday.type)) {
        return;
      }

      holidayMap.set(holiday.date, {
        date: holiday.date,
        name: holiday.name || '',
        type: holiday.type || 'public',
        enabled: holiday.enabled !== false,
      });
    });

    return Array.from(holidayMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
  };

  const importKoreanPublicHolidaysFromJson = async () => {
    const year = Number(holidayImportYear);

    if (!year || year < 2000 || year > 2100) {
      triggerToast('불러올 연도를 2000년부터 2100년 사이로 입력해 주세요.', 'error');
      return;
    }

    setHolidayImportLoading(true);

    try {
      const jsonUrl = `${import.meta.env.BASE_URL}holidays/kr-holidays-${year}.json?ts=${Date.now()}`;
      const response = await fetch(jsonUrl);

      if (!response.ok) {
        triggerToast(`${year}년 공휴일 JSON 파일을 찾지 못했습니다. 먼저 로컬 스크립트 또는 GitHub Actions로 public/holidays/kr-holidays-${year}.json 파일을 생성해 주세요.`, 'error');
        return;
      }

      const payload = await response.json();
      const importedHolidays = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.holidays)
          ? payload.holidays
          : [];

      if (importedHolidays.length === 0) {
        triggerToast(`${year}년 공휴일 JSON에 불러올 휴일 데이터가 없습니다.`, 'error');
        return;
      }

      setTempSettings((prev) => ({
        ...prev,
        holidays: mergeImportedHolidays(prev.holidays || [], importedHolidays),
      }));

      triggerToast(`${year}년 법정/임시공휴일 ${importedHolidays.length}건을 임시 목록에 불러왔습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
    } catch (error) {
      console.error('Static holiday JSON import error:', error);
      triggerToast('공휴일 JSON 파일을 불러오는 중 오류가 발생했습니다. public/holidays 파일 생성 및 배포 상태를 확인해 주세요.', 'error');
    } finally {
      setHolidayImportLoading(false);
    }
  };

  const getOriginalAssetCategoryName = (category) => {
    const matchedEntry = Object.entries(tempAssetCategoryRenameMap).find(
      ([, renamedName]) => renamedName === category
    );

    return matchedEntry ? matchedEntry[0] : category;
  };

  const addTempAssetCategory = () => {
    const categoryName = newAssetCategory.trim();

    if (!categoryName) {
      triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
      return;
    }

    if (tempAssetCategories.some((category) => String(category || '').trim() === categoryName)) {
      triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
      return;
    }

    setTempAssetCategories((prev) => [...prev, categoryName]);
    setNewAssetCategory('');
    triggerToast(`[${categoryName}] 자산 카테고리가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const startEditTempAssetCategory = (category, index) => {
    setEditingAssetCategoryIndex(index);
    setEditingAssetCategoryName(category);
  };

  const applyEditTempAssetCategory = (category, index) => {
    const nextCategoryName = editingAssetCategoryName.trim();

    if (!nextCategoryName) {
      triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempAssetCategories.some(
        (item, itemIndex) => itemIndex !== index && String(item || '').trim() === nextCategoryName
      )
    ) {
      triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
      return;
    }

    const originalCategoryName = getOriginalAssetCategoryName(category);

    setTempAssetCategories((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? nextCategoryName : item))
    );

    setTempAssetCategoryRenameMap((prev) => {
      const nextMap = { ...prev };

      if ((data.assetCategories || []).includes(originalCategoryName) && originalCategoryName !== nextCategoryName) {
        nextMap[originalCategoryName] = nextCategoryName;
      } else {
        delete nextMap[originalCategoryName];
      }

      return nextMap;
    });

    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    triggerToast(`[${category}] 카테고리명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const deleteTempAssetCategory = (category, index) => {
    const originalCategoryName = getOriginalAssetCategoryName(category);
    const isCategoryInUse = data.laptops.some((asset) => {
      const assetCategory = asset.category || '노트북';
      return assetCategory === originalCategoryName || assetCategory === category;
    });

    if (isCategoryInUse) {
      triggerToast('해당 카테고리를 사용하는 자산이 있어 삭제할 수 없습니다.', 'error');
      return;
    }

    setTempAssetCategories((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setTempAssetCategoryRenameMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[originalCategoryName];
      return nextMap;
    });
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    triggerToast(`[${category}] 자산 카테고리가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const moveTempAssetCategory = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return;

    setTempAssetCategories((prev) => {
      const next = [...prev];
      const [movedCategory] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedCategory);
      return next;
    });

    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
  };

  const cancelTempAssetCategoryChanges = () => {
    setTempAssetCategories(data.assetCategories || []);
    setTempAssetCategoryRenameMap({});
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    setDraggingAssetCategoryIndex(null);
    setNewAssetCategory('');
    triggerToast('자산 카테고리 변경사항이 취소되고 이전 상태로 복원되었습니다.', 'success');
  };

  const saveTempAssetCategoryChanges = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산 카테고리를 저장할 수 없습니다.',
        'error'
      );
      return;
    }

    const nextAssetCategories =
      tempAssetCategories
        .map((category) =>
          String(category || '').trim()
        )
        .filter(Boolean);

    const duplicatedCategory =
      nextAssetCategories.find(
        (category, index) =>
          nextAssetCategories.indexOf(
            category
          ) !== index
      );

    if (duplicatedCategory) {
      triggerToast(
        `[${duplicatedCategory}] 카테고리명이 중복되어 저장할 수 없습니다.`,
        'error'
      );
      return;
    }

    try {
      const assetsSnapshot =
        await getDocs(
          RENTAL_ASSETS_COLLECTION_REF
        );

      const assetOperations = [];

      assetsSnapshot.docs.forEach(
        (assetDocument) => {
          const assetData = {
            ...assetDocument.data(),
            id: assetDocument.id,
          };

          const nextCategory =
            tempAssetCategoryRenameMap[
              assetData.category
            ] ||
            assetData.category;

          if (
            nextCategory !==
              assetData.category &&
            normalizeAssetReservations(
              assetData.reservations || []
            ).length > 0
          ) {
            const activeRentalError =
              new Error(
                'active-rental-category-rename'
              );

            activeRentalError.assetNo =
              assetData.assetNo;

            throw activeRentalError;
          }

          if (
            !nextAssetCategories.includes(
              nextCategory
            )
          ) {
            const categoryInUseError =
              new Error(
                'asset-category-still-in-use'
              );

            categoryInUseError.category =
              assetData.category;

            throw categoryInUseError;
          }

          const nextAsset = {
            ...assetData,
            category:
              nextCategory,
          };

          if (
            nextCategory !==
            assetData.category
          ) {
            assetOperations.push({
              type: 'set',
              ref: assetDocument.ref,
              data: {
                category:
                  nextCategory,
                updatedAt:
                  serverTimestamp(),
              },
              options: {
                merge: true,
              },
            });
          }
        }
      );

      await commitFirestoreOperations(
        assetOperations
      );

      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          assetCategories:
            nextAssetCategories,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      setData((prev) => ({
        ...prev,
        assetCategories:
          nextAssetCategories,
        laptops:
          (prev.laptops || []).map(
            (asset) => ({
              ...asset,
              category:
                tempAssetCategoryRenameMap[
                  asset.category
                ] ||
                asset.category,
            })
          ),
      }));

      setSelectedAssetCategory(
        '전체'
      );
      setAdminSelectedAssetCategory(
        '전체'
      );
      setTempAssetCategories(
        nextAssetCategories
      );
      setTempAssetCategoryRenameMap(
        {}
      );
      setEditingAssetCategoryIndex(
        null
      );
      setEditingAssetCategoryName(
        ''
      );
      setDraggingAssetCategoryIndex(
        null
      );

      triggerToast(
        '자산 카테고리 변경사항이 분리 저장소에 성공적으로 저장 및 반영되었습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'Asset category save error:',
        error
      );

      if (
        error?.message ===
        'active-rental-category-rename'
      ) {
        triggerToast(
          `진행 중 예약이 있는 자산 [${error.assetNo}]이(가) 포함되어 카테고리명을 변경할 수 없습니다. 해당 신청을 먼저 완료해 주세요.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-category-still-in-use'
      ) {
        triggerToast(
          `카테고리 [${error.category}]를 사용하는 최신 자산이 있어 삭제할 수 없습니다.`,
          'error'
        );
        return;
      }

      triggerToast(
        '자산 카테고리 저장에 실패했습니다. 기존 카테고리와 자산 정보는 유지됩니다.',
        'error'
      );
    }
  };

  const addTempTeam = () => {
    const teamName = newTeam.trim();

    if (!teamName) {
      triggerToast('부서명을 입력해 주세요.', 'error');
      return;
    }

    if (tempTeams.some((team) => String(team || '').trim() === teamName)) {
      triggerToast('이미 등록된 부서명입니다.', 'error');
      return;
    }

    setTempTeams((prev) => [...prev, teamName]);
    setNewTeam('');
    triggerToast(`[${teamName}] 부서가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const startEditTempTeam = (team, index) => {
    setEditingTeamIndex(index);
    setEditingTeamName(team);
  };

  const applyEditTempTeam = (team, index) => {
    const nextTeamName = editingTeamName.trim();

    if (!nextTeamName) {
      triggerToast('부서명을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempTeams.some(
        (item, itemIndex) => itemIndex !== index && String(item || '').trim() === nextTeamName
      )
    ) {
      triggerToast('이미 등록된 부서명입니다.', 'error');
      return;
    }

    setTempTeams((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? nextTeamName : item))
    );

    setTempBorrowers((prev) =>
      prev.map((borrower) =>
        borrower.team === team ? { ...borrower, team: nextTeamName } : borrower
      )
    );

    if (newBorrowerTeam === team) {
      setNewBorrowerTeam(nextTeamName);
    }

    setEditingTeamIndex(null);
    setEditingTeamName('');
    triggerToast(`[${team}] 부서명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const deleteTempTeam = (team, index) => {
    setTempTeams((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setTempBorrowers((prev) => prev.filter((borrower) => borrower.team !== team));

    if (newBorrowerTeam === team) {
      setNewBorrowerTeam('전체');
    }

    setEditingTeamIndex(null);
    setEditingTeamName('');
    triggerToast(`[${team}] 부서 및 해당 부서 소속 사용자가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const moveTempTeam = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return;

    setTempTeams((prev) => {
      const next = [...prev];
      const [movedTeam] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedTeam);
      return next;
    });

    setEditingTeamIndex(null);
    setEditingTeamName('');
  };

  const addTempBorrower = () => {
    if (tempTeams.length === 0) {
      triggerToast('등록된 부서가 없어 사용자를 등록할 수 없습니다.', 'error');
      return;
    }

    if (!newBorrowerTeam || newBorrowerTeam === '전체' || !tempTeams.includes(newBorrowerTeam)) {
      triggerToast('등록할 부서를 선택하세요', 'error');
      return;
    }

    const borrowerName = newBorrower.trim();

    if (!borrowerName) {
      triggerToast('사용자명을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempBorrowers.some(
        (borrower) =>
          borrower.team === newBorrowerTeam &&
          String(borrower.name || '').trim() === borrowerName
      )
    ) {
      triggerToast('해당 부서에 이미 등록된 사용자명입니다.', 'error');
      return;
    }

    setTempBorrowers((prev) => [...prev, { name: borrowerName, team: newBorrowerTeam }]);
    setNewBorrower('');
    triggerToast(`[${newBorrowerTeam}] ${borrowerName} 사용자가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const startEditTempBorrower = (borrower, originalIndex) => {
    setEditingBorrowerIndex(originalIndex);
    setEditingBorrowerName(borrower.name);
  };

  const applyEditTempBorrower = (borrower, originalIndex) => {
    const nextBorrowerName = editingBorrowerName.trim();

    if (!nextBorrowerName) {
      triggerToast('사용자명을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempBorrowers.some(
        (item, itemIndex) =>
          itemIndex !== originalIndex &&
          item.team === borrower.team &&
          String(item.name || '').trim() === nextBorrowerName
      )
    ) {
      triggerToast('해당 부서에 이미 등록된 사용자명입니다.', 'error');
      return;
    }

    setTempBorrowers((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === originalIndex ? { ...item, name: nextBorrowerName } : item
      )
    );

    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
    triggerToast(`[${borrower.name}] 사용자명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const deleteTempBorrower = (borrower, originalIndex) => {
    setTempBorrowers((prev) => prev.filter((_, itemIndex) => itemIndex !== originalIndex));
    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
    triggerToast(`[${borrower.name}] 사용자가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const moveTempBorrower = (fromIndex, toIndex) => {
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return;

    setTempBorrowers((prev) => {
      const next = [...prev];
      const [movedBorrower] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedBorrower);
      return next;
    });

    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
  };

  const cancelTempPeopleChanges = () => {
    setTempTeams(data.teams || []);
    setTempBorrowers(data.borrowers || []);
    setEditingTeamIndex(null);
    setEditingTeamName('');
    setDraggingTeamIndex(null);
    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
    setDraggingBorrowerIndex(null);
    setNewTeam('');
    setNewBorrower('');
    setNewBorrowerTeam('전체');
    triggerToast('부서·사용자 변경사항이 취소되고 이전 상태로 복원되었습니다.', 'success');
  };

  const saveTempPeopleChanges = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 부서·사용자 정보를 저장할 수 없습니다.',
        'error'
      );
      return;
    }

    const nextTeams = tempTeams
      .map((team) =>
        String(team || '').trim()
      )
      .filter(Boolean);

    const duplicatedTeam =
      nextTeams.find(
        (team, index) =>
          nextTeams.indexOf(team) !==
          index
      );

    if (duplicatedTeam) {
      triggerToast(
        `[${duplicatedTeam}] 부서명이 중복되어 저장할 수 없습니다.`,
        'error'
      );
      return;
    }

    const nextBorrowers =
      tempBorrowers
        .map((borrower, index) => ({
          id:
            borrower.id ||
            createBorrowerDocumentId(),
          name: String(
            borrower.name || ''
          ).trim(),
          team: String(
            borrower.team || ''
          ).trim(),
          sortOrder: index,
        }))
        .filter(
          (borrower) =>
            borrower.name &&
            borrower.team &&
            nextTeams.includes(
              borrower.team
            )
        );

    const duplicatedBorrower =
      nextBorrowers.find(
        (borrower, index) =>
          nextBorrowers.findIndex(
            (item) =>
              item.team ===
                borrower.team &&
              item.name ===
                borrower.name
          ) !== index
      );

    if (duplicatedBorrower) {
      triggerToast(
        `[${duplicatedBorrower.team}] ${duplicatedBorrower.name} 사용자명이 중복되어 저장할 수 없습니다.`,
        'error'
      );
      return;
    }

    try {
      const currentBorrowersSnapshot =
        await getDocs(
          RENTAL_BORROWERS_COLLECTION_REF
        );

      const nextBorrowerIdSet =
        new Set(
          nextBorrowers.map(
            (borrower) =>
              borrower.id
          )
        );

      const borrowerOperations = [
        ...nextBorrowers.map(
          (borrower) => ({
            type: 'set',
            ref: doc(
              RENTAL_BORROWERS_COLLECTION_REF,
              borrower.id
            ),
            data: {
              ...borrower,
              updatedAt:
                serverTimestamp(),
            },
          })
        ),

        ...currentBorrowersSnapshot.docs
          .filter(
            (borrowerDocument) =>
              !nextBorrowerIdSet.has(
                borrowerDocument.id
              )
          )
          .map(
            (borrowerDocument) => ({
              type: 'delete',
              ref:
                borrowerDocument.ref,
            })
          ),
      ];

      await commitFirestoreOperations(
        borrowerOperations
      );

      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          teams: nextTeams,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      setData((prev) => ({
        ...prev,
        teams: nextTeams,
        borrowers:
          nextBorrowers,
      }));

      setTempTeams(nextTeams);
      setTempBorrowers(
        nextBorrowers
      );
      setEditingTeamIndex(null);
      setEditingTeamName('');
      setDraggingTeamIndex(null);
      setEditingBorrowerIndex(null);
      setEditingBorrowerName('');
      setDraggingBorrowerIndex(
        null
      );
      setNewTeam('');
      setNewBorrower('');
      setNewBorrowerTeam('전체');

      triggerToast(
        '부서·사용자 변경사항이 분리 저장소에 성공적으로 저장 및 반영되었습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'People data save error:',
        error
      );

      triggerToast(
        '부서·사용자 저장에 실패했습니다. 기존 데이터는 유지됩니다.',
        'error'
      );
    }
  };

  const saveSystemSettings = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 시스템 설정을 저장할 수 없습니다.',
        'error'
      );
      return;
    }

    const nextSettings = {
      ...tempSettings,
      allowNonOverlappingSameAssetRequests:
        tempSettings.allowNonOverlappingSameAssetRequests ??
        DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
      adjustStartDateAfterWorkEnd:
        tempSettings.adjustStartDateToNextBusinessDay ??
        tempSettings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      adjustStartDateToNextBusinessDay:
        tempSettings.adjustStartDateToNextBusinessDay ??
        tempSettings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      holidays: Array.isArray(
        tempSettings.holidays
      )
        ? tempSettings.holidays
            .filter(
              (holiday) =>
                holiday &&
                holiday.date
            )
            .map((holiday) => ({
              date: holiday.date,
              name:
                holiday.name || '',
              type:
                holiday.type ||
                DEFAULT_HOLIDAY_TYPE,
              enabled:
                holiday.enabled !== false,
            }))
        : [],
    };

    try {
      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          settings: nextSettings,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      setData((prev) => ({
        ...prev,
        settings: nextSettings,
      }));

      setTempSettings(
        nextSettings
      );
      setNewHolidayDate(today());
      setNewHolidayName('');
      setNewHolidayType(
        DEFAULT_HOLIDAY_TYPE
      );
      setHolidayImportYear(
        String(
          getKoreaNow().getUTCFullYear()
        )
      );
      setHolidayImportLoading(
        false
      );

      triggerToast(
        '설정 변경사항이 분리 저장소에 성공적으로 저장 및 반영되었습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'System settings save error:',
        error
      );

      triggerToast(
        '시스템 설정 저장에 실패했습니다. 기존 설정은 유지됩니다.',
        'error'
      );
    }
  };

  const shouldShowStats =
    hasAdminAccess || (view === 'user' && userTab === 'rental');

  const shouldPrepareUserRentalList =
    view === 'user' && userTab === 'rental';

  const shouldPrepareAdminAssetList =
    hasAdminAccess && adminTab === 'laptops';

  const shouldPrepareRentalStatus =
    shouldShowStats || shouldPrepareAdminAssetList;

  const rentalStatusSummary = useMemo(() => {
    const emptyStats = {
      total: 0,
      available: 0,
      requested: 0,
      reserved: 0,
      approved: 0,
      overdue: 0,
    };

    if (!shouldPrepareRentalStatus) {
      return {
        blockedLaptopIds: new Set(),
        stats: emptyStats,
      };
    }

    const todayDate = today();
    const nextBlockedLaptopIds = new Set();

    let requested = 0;
    let reserved = 0;
    let approved = 0;
    let overdue = 0;

    data.requests.forEach((request) => {
      if (
        request.status === STATUS.REQUESTED ||
        request.status === STATUS.APPROVED ||
        request.status === STATUS.ON_HOLD
      ) {
        nextBlockedLaptopIds.add(request.laptopId);
      }

      if (request.status === STATUS.REQUESTED) {
        requested += 1;
        return;
      }

      if (request.status !== STATUS.APPROVED) {
        return;
      }

      if (request.startDate && request.startDate > todayDate) {
        reserved += 1;
        return;
      }

      approved += 1;

      if (request.dueDate && request.dueDate < todayDate) {
        overdue += 1;
      }
    });

    let available = 0;

    data.laptops.forEach((laptop) => {
      if (
        !nextBlockedLaptopIds.has(laptop.id) &&
        laptop.status !== STATUS.UNAVAILABLE
      ) {
        available += 1;
      }
    });

    return {
      blockedLaptopIds: nextBlockedLaptopIds,
      stats: {
        total: data.laptops.length,
        available,
        requested,
        reserved,
        approved,
        overdue,
      },
    };
  }, [shouldPrepareRentalStatus, data.requests, data.laptops]);

  const blockedLaptopIds = rentalStatusSummary.blockedLaptopIds;
  const stats = rentalStatusSummary.stats;

  const filteredLaptops = useMemo(() => {
    if (!shouldPrepareUserRentalList) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    return data.laptops.filter((l) => {
      const laptopAvailability = getLaptopRentalAvailability(
        l,
        data.requests,
        data.settings,
        form.startDate,
        form.dueDate
      );

      const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
        .toLowerCase()
        .includes(normalizedQuery);

      const categoryMatched =
        selectedAssetCategory === '전체' || l.category === selectedAssetCategory;

      const availabilityMatched =
        availabilityFilter === '전체'
          ? true
          : availabilityFilter === STATUS.AVAILABLE
            ? !laptopAvailability.blocked
            : laptopAvailability.blocked;

      return keywordMatched && categoryMatched && availabilityMatched;
    });
  }, [
    shouldPrepareUserRentalList,
    data.laptops,
    data.requests,
    data.settings,
    form.startDate,
    form.dueDate,
    query,
    selectedAssetCategory,
    availabilityFilter,
  ]);

  const adminFilteredLaptops = useMemo(() => {
    if (!shouldPrepareAdminAssetList) {
      return [];
    }

    const normalizedAdminLaptopQuery = adminLaptopQuery.trim().toLowerCase();

    return data.laptops.filter((l) => {
      const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
        .toLowerCase()
        .includes(normalizedAdminLaptopQuery);

      const categoryMatched =
        adminSelectedAssetCategory === '전체' || l.category === adminSelectedAssetCategory;

      const availabilityMatched =
        adminAvailabilityFilter === '전체'
          ? true
          : adminAvailabilityFilter === STATUS.AVAILABLE
            ? !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE
            : blockedLaptopIds.has(l.id) || l.status === STATUS.UNAVAILABLE;

      return keywordMatched && categoryMatched && availabilityMatched;
    });
  }, [
    shouldPrepareAdminAssetList,
    data.laptops,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    adminAvailabilityFilter,
    blockedLaptopIds,
  ]);

  const selectedLaptop = data.laptops.find((l) => l.id === selectedLaptopId);

  const isPeriodBasedRentalMode =
    data.settings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  const rentalDeviceSectionTitle = isPeriodBasedRentalMode
    ? '대여 기기 선택'
    : '대여 기기 선택';

  const rentalDeviceSectionDescription = isPeriodBasedRentalMode
    ? '선택 기간 중 [대여가능] 기기만 신청할 수 있습니다.'
    : '[대여가능] 기기만 신청할 수 있습니다.';

  const availableFilterLabel = STATUS.AVAILABLE;
  const unavailableFilterLabel = STATUS.UNAVAILABLE;

const getUserLaptopStatusLabel = (laptopAvailability) => {
  if (!laptopAvailability) {
    return STATUS.AVAILABLE;
  }

  if (laptopAvailability.reason === 'assetUnavailable') {
    return STATUS.UNAVAILABLE;
  }

  return getDisplayRentalStatus(
    laptopAvailability.status,
    laptopAvailability.blockingRequest?.startDate
  );
};

  const selectedLaptopAvailability = selectedLaptop
    ? getLaptopRentalAvailability(
        selectedLaptop,
        data.requests,
        data.settings,
        form.startDate,
        form.dueDate
      )
    : null;

  useEffect(() => {
    if (!selectedLaptop || !selectedLaptopAvailability?.blocked) {
      return;
    }

    setSelectedLaptopId(null);

    if (selectedLaptopAvailability.reason === 'periodOverlap') {
      triggerToast(
        '선택한 대여 기간에는 기존 선택 기기를 사용할 수 없어 선택이 해제되었습니다.',
        'error'
      );
      return;
    }

    if (selectedLaptopAvailability.reason === 'assetUnavailable') {
      triggerToast(
        '선택한 기기가 대여불가 상태여서 선택이 해제되었습니다.',
        'error'
      );
      return;
    }

    triggerToast(
      '선택한 기기가 현재 신청할 수 없는 상태여서 선택이 해제되었습니다.',
      'error'
    );
  }, [
    selectedLaptopId,
    selectedLaptop?.id,
    selectedLaptopAvailability?.blocked,
    selectedLaptopAvailability?.reason,
    selectedLaptopAvailability?.blockingRequest?.startDate,
    selectedLaptopAvailability?.blockingRequest?.dueDate,
  ]);

  const filteredBorrowers = data.borrowers.filter((b) => b.team === form.team);

  const rentalPeriodFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateInputWithWeekday
        label="대여 시작일"
        value={form.startDate}
        min={today()}
        onInvalidDate={() => triggerToast('올바른 날짜를 입력해 주세요.', 'error')}
        onChange={(v) => {
          const minStartDate = today();

          if (!v) {
            const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          if (isTemporaryDateInputValue(v)) {
            setForm({
              ...form,
              startDate: v,
            });

            return v;
          }

          if (v < minStartDate) {
            const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

            triggerToast(
              `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          const nextStartDate = getAdjustedRentalStartDate(v, data.settings);

          if (nextStartDate !== v) {
            const reason = getNonBusinessDayReason(v, data.settings);

            triggerToast(
              `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. ${formatDateWithKoreanWeekday(nextStartDate)}로 조정되었습니다.`,
              'error'
            );
          }

          setForm({
            ...form,
            startDate: nextStartDate,
            dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
          });

          return nextStartDate;
        }}
        onDateBlur={(v) => {
          const minStartDate = today();

          if (!v || isTemporaryDateInputValue(v) || v < minStartDate) {
            const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

            triggerToast(
              `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          const nextStartDate = getAdjustedRentalStartDate(v, data.settings);

          if (nextStartDate !== v) {
            const reason = getNonBusinessDayReason(v, data.settings);

            triggerToast(
              `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. ${formatDateWithKoreanWeekday(nextStartDate)}로 조정되었습니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          setForm({
            ...form,
            startDate: nextStartDate,
            dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
          });

          return nextStartDate;
        }}
      />

      <DateInputWithWeekday
        label="반납 예정일"
        value={form.dueDate}
        min={form.startDate}
        max={getMaxRentalDueDate(form.startDate, data.settings)}
        onInvalidDate={() => triggerToast('올바른 날짜를 입력해 주세요.', 'error')}
        onChange={(v) => {
          const minDueDate = form.startDate;
          const maxDueDate = getMaxRentalDueDate(form.startDate, data.settings);
          const maxRentalDays = getSafeMaxRentalDays(data.settings);
          let nextDueDate = v;

          if (!nextDueDate) {
            setForm({ ...form, dueDate: minDueDate });
            return minDueDate;
          }

          if (isTemporaryDateInputValue(nextDueDate)) {
            setForm({ ...form, dueDate: nextDueDate });
            return nextDueDate;
          }

          if (nextDueDate < minDueDate) {
            triggerToast(
              `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(minDueDate)}입니다.`,
              'error'
            );

            nextDueDate = minDueDate;
          }

          if (nextDueDate > maxDueDate) {
            triggerToast(
              `대여 가능일은 최대 ${maxRentalDays}일입니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxDueDate)}까지 선택할 수 있습니다.`,
              'error'
            );

            nextDueDate = maxDueDate;
          }

          setForm({ ...form, dueDate: nextDueDate });

          return nextDueDate;
        }}
        onDateBlur={(v) => {
          const minDueDate = form.startDate;
          const maxDueDate = getMaxRentalDueDate(form.startDate, data.settings);
          const maxRentalDays = getSafeMaxRentalDays(data.settings);
          let nextDueDate = v;

          if (!nextDueDate || isTemporaryDateInputValue(nextDueDate) || nextDueDate < minDueDate) {
            triggerToast(
              `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(minDueDate)}입니다.`,
              'error'
            );

            setForm({ ...form, dueDate: minDueDate });

            return minDueDate;
          }

          if (nextDueDate > maxDueDate) {
            triggerToast(
              `대여 가능일은 최대 ${maxRentalDays}일입니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxDueDate)}까지 선택할 수 있습니다.`,
              'error'
            );

            setForm({ ...form, dueDate: maxDueDate });

            return maxDueDate;
          }

          setForm({ ...form, dueDate: nextDueDate });

          return nextDueDate;
        }}
      />
    </div>
  );

  const displayedTempBorrowers = tempBorrowers
    .map((borrower, originalIndex) => ({ ...borrower, originalIndex }))
    .filter((borrower) => newBorrowerTeam === '전체' || borrower.team === newBorrowerTeam);

  const rentalStartAdjustmentInfo = getRentalStartAdjustmentInfo(data.settings);
  const tempBusinessDayAdjustmentEnabled =
    tempSettings.adjustStartDateToNextBusinessDay ??
    tempSettings.adjustStartDateAfterWorkEnd ??
    DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY;
  const tempHolidayList = Array.isArray(tempSettings.holidays) ? tempSettings.holidays : [];

  const tempAllowNonOverlappingSameAssetRequests =
    tempSettings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  const editLaptopIndex = editLaptop ? adminFilteredLaptops.findIndex((l) => l.id === editLaptop.id) : -1;
  const editLaptopInsertIndex =
    editLaptopIndex >= 0
      ? Math.min(
          Math.ceil((editLaptopIndex + 1) / assetGridColumns) * assetGridColumns - 1,
          adminFilteredLaptops.length - 1
        )
      : -1;

  const submitRequest = async () => {
    if (
      requestSubmitInProgressRef.current ||
      requestSubmitLoading
    ) {
      return;
    }

    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 대여신청을 제출할 수 없습니다. 관리자에게 문의해 주세요.',
        'error'
      );
      return;
    }

    if (!firebaseAuthReady || !currentAuthRoleReady || !userProfileReady) {
      triggerToast(
        '로그인 계정과 회원 정보를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.',
        'error'
      );
      return;
    }

    if (!firebaseAuthUser) {
      triggerToast('기기 대여신청은 일반회원 로그인 후 이용할 수 있습니다.', 'error');
      goToUserLogin();
      return;
    }

    if (currentAuthRoleErrorMessage) {
      triggerToast(currentAuthRoleErrorMessage, 'error');
      return;
    }

    if (currentAuthAdminAccount || isAdminAuthenticated) {
      triggerToast(
        '관리자 계정은 일반 사용자 대여신청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    if (!userProfile) {
      triggerToast(
        '회원 정보가 등록되어 있지 않습니다. 마이페이지에서 이름과 부서 정보를 저장해 주세요.',
        'error'
      );
      goToUserMypage();
      return;
    }

    const currentUserStatus = userProfile.status || '';

    if (currentUserStatus === USER_PROFILE_STATUS.BLOCKED) {
      triggerToast(
        '이용이 중지된 회원 계정은 기기 대여신청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    if (currentUserStatus !== USER_PROFILE_STATUS.ACTIVE) {
      triggerToast(
        '현재 회원 상태에서는 기기 대여신청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    const requesterEmail = String(
      firebaseAuthUser.email || ''
    );

    const requesterName = String(
      userProfile.name || ''
    );

    const requesterTeam = String(
      userProfile.team || ''
    );

    if (
      !requesterEmail.trim() ||
      !requesterName.trim() ||
      !requesterTeam.trim()
    ) {
      triggerToast(
        '회원 이메일, 이름 또는 부서 정보가 완성되지 않았습니다. 마이페이지에서 회원 정보를 확인해 주세요.',
        'error'
      );
      goToUserMypage();
      return;
    }

    if (!selectedLaptop) {
      triggerToast('신청할 기기를 선택해 주세요.', 'error');
      return;
    }

    const selectedLaptopAvailability = getLaptopRentalAvailability(
      selectedLaptop,
      data.requests,
      data.settings,
      form.startDate,
      form.dueDate
    );

    if (selectedLaptopAvailability.blocked) {
      const blockingRequest = selectedLaptopAvailability.blockingRequest;

      if (selectedLaptopAvailability.reason === 'periodOverlap' && blockingRequest) {
        triggerToast(
          `${selectedLaptop.assetNo}은(는) ${formatDateWithKoreanWeekday(blockingRequest.startDate)} ~ ${formatDateWithKoreanWeekday(blockingRequest.dueDate)} 기간에 이미 ${blockingRequest.status} 상태의 신청이 있어 선택한 기간에는 신청할 수 없습니다.`,
          'error'
        );
        return;
      }

      if (selectedLaptopAvailability.reason === 'assetUnavailable') {
        triggerToast('대여불가로 설정된 기기입니다.', 'error');
        return;
      }

      triggerToast('이미 예약 중이거나 이용 불가한 기기입니다.', 'error');
      return;
    }
    if (!form.team || !form.borrower || !form.startDate || !form.dueDate) {
      triggerToast('팀명, 대여자명, 대여 예정일을 모두 작성해 주세요.', 'error');
      return;
    }

    const minStartDate = today();

    if (form.startDate < minStartDate) {
      const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

      triggerToast(
        `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
        'error'
      );
      return;
    }

    const adjustedStartDate = getAdjustedRentalStartDate(form.startDate, data.settings);

    if (adjustedStartDate !== form.startDate) {
      const reason = getNonBusinessDayReason(form.startDate, data.settings);

      triggerToast(
        `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(adjustedStartDate)}입니다.`,
        'error'
      );
      return;
    }

    if (form.dueDate < form.startDate) {
      triggerToast(
        `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(form.startDate)}입니다.`,
        'error'
      );
      return;
    }

    const maxAllowedDate = getMaxRentalDueDate(form.startDate, data.settings);
    const maxRentalDays = getSafeMaxRentalDays(data.settings);

    if (form.dueDate > maxAllowedDate) {
      triggerToast(
        `대여 가능일은 최대 ${maxRentalDays}일입니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxAllowedDate)}까지 선택할 수 있습니다.`,
        'error'
      );
      return;
    }

    const requestId = `REQ-${doc(
      RENTAL_REQUESTS_COLLECTION_REF
    ).id}`;

    const requestDocRef = doc(
      db,
      'rentalRequests',
      requestId
    );

    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      requestId
    );

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      selectedLaptop.id
    );

    const requestedAt = new Date().toLocaleString('ko-KR');

    const nextRequest = {
      id: requestId,
      requesterUid: firebaseAuthUser.uid,
      requesterEmail,
      requesterName,
      requesterTeam,
      laptopId: selectedLaptop.id,
      assetCategory: selectedLaptop.category || '노트북',
      assetNo: selectedLaptop.assetNo,
      team: form.team,
      borrower: form.borrower,
      startDate: form.startDate,
      dueDate: form.dueDate,
      purpose: form.purpose,
      status: STATUS.REQUESTED,
      adminMemo: '',
      requestedAt,
    };

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;

    requestSubmitInProgressRef.current = true;
    setRequestSubmitLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        const assetSnapshot =
          await transaction.get(assetDocRef);

        if (!assetSnapshot.exists()) {
          throw new Error('selected-laptop-not-found');
        }

        const latestAsset = {
          ...assetSnapshot.data(),
          id: assetSnapshot.id,
        };

        const storedReservations =
          Array.isArray(
            latestAsset.reservations
          )
            ? latestAsset.reservations
            : [];

        const latestReservations =
          normalizeAssetReservations(
            storedReservations
          );

        const latestAvailability =
          getLaptopRentalAvailability(
            latestAsset,
            latestReservations,
            data.settings,
            form.startDate,
            form.dueDate
          );

        if (latestAvailability.blocked) {
          const conflictError =
            new Error('rental-conflict');

          conflictError.availability =
            latestAvailability;

          throw conflictError;
        }

        const nextCommittedRequest = {
          ...nextRequest,
          laptopId: latestAsset.id,
          assetCategory:
            latestAsset.category || '노트북',
          assetNo: latestAsset.assetNo,
        };

        const availabilityRequest =
          toRentalAvailabilityRequest(
            nextCommittedRequest
          );

        const nextReservations = [
          ...storedReservations,
          availabilityRequest,
        ];

        transaction.set(
          requestDocRef,
          {
            ...nextCommittedRequest,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );

        transaction.set(
          availabilityDocRef,
          {
            ...availabilityRequest,
            updatedAt: serverTimestamp(),
          }
        );

        transaction.update(
          assetDocRef,
          {
            reservations:
              nextReservations,
            updatedAt:
              serverTimestamp(),
          }
        );

        committedRequest =
          nextCommittedRequest;

        committedAvailabilityRequest =
          availabilityRequest;

        committedAsset = {
          ...latestAsset,
          reservations:
            nextReservations,
        };
      });

      if (
        !committedRequest ||
        !committedAsset ||
        !committedAvailabilityRequest
      ) {
        throw new Error(
          'rental-transaction-result-missing'
        );
      }

      setRentalRequests((prev) => [
        committedRequest,
        ...(prev || []).filter(
          (request) =>
            request.id !== requestId
        ),
      ]);

      setData((prev) => ({
        ...prev,
        requests: [
          committedAvailabilityRequest,
          ...(prev.requests || []).filter(
            (request) =>
              request.id !== requestId
          ),
        ],
        laptops: (prev.laptops || []).map(
          (asset) =>
            asset.id === committedAsset.id
              ? committedAsset
              : asset
        ),
      }));

      setSelectedLaptopId(null);
      setForm(
        createDefaultRequestForm(
          data.settings
        )
      );

      triggerToast(
        '대여 신청이 성공적으로 접수되었습니다. 관리자 승인을 대기합니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'Rental request create error:',
        error
      );

      if (
        error?.message ===
        'rental-conflict'
      ) {
        const blockingRequest =
          error.availability?.blockingRequest;

        triggerToast(
          blockingRequest
            ? `${selectedLaptop.assetNo}은(는) ${formatDateWithKoreanWeekday(blockingRequest.startDate)} ~ ${formatDateWithKoreanWeekday(blockingRequest.dueDate)} 기간에 이미 ${blockingRequest.status} 상태의 신청이 있어 신청할 수 없습니다.`
            : '다른 사용자의 신청이 먼저 접수되어 현재 선택한 기기를 신청할 수 없습니다.',
          'error'
        );
      } else if (
        error?.message ===
        'selected-laptop-not-found'
      ) {
        triggerToast(
          '선택한 기기 정보를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.',
          'error'
        );
      } else {
        const firebaseErrorCode =
          error?.code || 'unknown-error';

        const firebaseErrorMessage =
          error?.message || '오류 메시지 없음';

        console.error(
          'Rental request create error details:',
          {
            code: firebaseErrorCode,
            message: firebaseErrorMessage,
            requesterUid:
              firebaseAuthUser?.uid || '',
            requestId,
            assetId:
              selectedLaptop?.id || '',
            assetNo:
              selectedLaptop?.assetNo || '',
          }
        );

        triggerToast(
          `대여 신청 저장에 실패했습니다. 오류 코드: ${firebaseErrorCode}`,
          'error'
        );
      }
    } finally {
      requestSubmitInProgressRef.current = false;
      setRequestSubmitLoading(false);
    }
  };

    const openUserActionDialog = (request, type) => {
    if (
      request.userActionRequest?.status ===
      USER_REQUEST_REVIEW_STATUS.PENDING
    ) {
      triggerToast(
        '이미 검토 중인 사용자 요청이 있습니다.',
        'error'
      );
      return;
    }

    const canRequestChange =
      [STATUS.REQUESTED, STATUS.ON_HOLD].includes(
        request.status
      );

    const canRequestRentalAction =
      request.status === STATUS.APPROVED;

    if (
      [USER_REQUEST_ACTION.CHANGE, USER_REQUEST_ACTION.CANCEL].includes(type) &&
      !canRequestChange
    ) {
      triggerToast(
        '신청 변경과 취소 요청은 신청중 또는 보류 상태에서만 가능합니다.',
        'error'
      );
      return;
    }

    if (
      [USER_REQUEST_ACTION.EXTEND, USER_REQUEST_ACTION.RETURN].includes(type) &&
      !canRequestRentalAction
    ) {
      triggerToast(
        '연장과 반납 요청은 대여중 상태에서만 가능합니다.',
        'error'
      );
      return;
    }

    const maxDueDate = addDaysFrom(
      request.startDate,
      data.settings.maxRentalDays
    );

    const suggestedExtensionDueDate = addDaysFrom(
      request.dueDate,
      1
    );

    setUserActionDialog({
      requestId: request.id,
      type,
    });

    setUserActionForm({
      type,
      reason: '',
      team: request.team || '',
      borrower: request.borrower || '',
      startDate: request.startDate || '',
      dueDate:
        type === USER_REQUEST_ACTION.EXTEND &&
        suggestedExtensionDueDate <= maxDueDate
          ? suggestedExtensionDueDate
          : request.dueDate || '',
      purpose: request.purpose || '',
    });
  };

  const closeUserActionDialog = () => {
    if (userActionSaving) return;

    setUserActionDialog(null);
    setUserActionForm(
      createDefaultUserActionForm()
    );
  };

  const submitUserActionRequest = async () => {
    const requestId =
      userActionDialog?.requestId || '';

    const actionType =
      userActionDialog?.type || '';

    const currentRequest =
      currentUserRequests.find(
        (request) =>
          request.id === requestId
      );

    if (
      !firebaseAuthUser?.uid ||
      !currentRequest ||
      currentRequest.requesterUid !==
        firebaseAuthUser.uid
    ) {
      triggerToast(
        '본인 신청 정보를 확인할 수 없습니다.',
        'error'
      );
      return;
    }

    if (
      currentRequest.userActionRequest?.status ===
      USER_REQUEST_REVIEW_STATUS.PENDING
    ) {
      triggerToast(
        '이미 검토 중인 사용자 요청이 있습니다.',
        'error'
      );
      return;
    }

    const allowedStatuses =
      [USER_REQUEST_ACTION.CHANGE, USER_REQUEST_ACTION.CANCEL].includes(
        actionType
      )
        ? [STATUS.REQUESTED, STATUS.ON_HOLD]
        : [STATUS.APPROVED];

    if (
      !allowedStatuses.includes(
        currentRequest.status
      )
    ) {
      triggerToast(
        '현재 신청 상태에서는 해당 요청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    const nextReason =
      String(
        userActionForm.reason || ''
      ).trim();

    const nextTeam =
      String(
        userActionForm.team || ''
      ).trim();

    const nextBorrower =
      String(
        userActionForm.borrower || ''
      ).trim();

    const nextStartDate =
      String(
        userActionForm.startDate || ''
      );

    const nextDueDate =
      String(
        userActionForm.dueDate || ''
      );

    const nextPurpose =
      String(
        userActionForm.purpose || ''
      ).trim();

    if (!nextReason) {
      triggerToast(
        '요청 사유를 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      actionType ===
      USER_REQUEST_ACTION.CHANGE
    ) {
      if (
        !nextTeam ||
        !nextBorrower ||
        !nextStartDate ||
        !nextDueDate
      ) {
        triggerToast(
          '변경할 소속, 대여자명과 대여 기간을 모두 입력해 주세요.',
          'error'
        );
        return;
      }

      if (nextStartDate < today()) {
        triggerToast(
          '변경할 대여 시작일은 오늘 이전으로 선택할 수 없습니다.',
          'error'
        );
        return;
      }

      if (
        nextDueDate <
        nextStartDate
      ) {
        triggerToast(
          '변경할 반납 예정일은 대여 시작일 이후여야 합니다.',
          'error'
        );
        return;
      }

      const maxAllowedDate =
        addDaysFrom(
          nextStartDate,
          data.settings.maxRentalDays
        );

      if (
        nextDueDate >
        maxAllowedDate
      ) {
        triggerToast(
          `최장 허용 대여 기한(${data.settings.maxRentalDays}일)을 초과할 수 없습니다.`,
          'error'
        );
        return;
      }
    }

    if (
      actionType ===
      USER_REQUEST_ACTION.EXTEND
    ) {
      if (
        !nextDueDate ||
        nextDueDate <=
          currentRequest.dueDate
      ) {
        triggerToast(
          '현재 반납 예정일보다 뒤의 날짜를 선택해 주세요.',
          'error'
        );
        return;
      }

      const maxAllowedDate =
        addDaysFrom(
          currentRequest.startDate,
          data.settings.maxRentalDays
        );

      if (
        nextDueDate >
        maxAllowedDate
      ) {
        triggerToast(
          `최장 허용 대여 기한(${data.settings.maxRentalDays}일)을 초과할 수 없습니다.`,
          'error'
        );
        return;
      }
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      requestId
    );

    let committedActionRequest = null;

    setUserActionSaving(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestSnapshot =
            await transaction.get(
              requestDocRef
            );

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          if (
            actionType ===
            USER_REQUEST_ACTION.RETURN
          ) {
            throw new Error(
              'return-request-disabled'
            );
          }

          if (
            latestRequest.requesterUid !==
            firebaseAuthUser.uid
          ) {
            throw new Error(
              'rental-request-owner-mismatch'
            );
          }

          if (
            latestRequest.userActionRequest?.status ===
            USER_REQUEST_REVIEW_STATUS.PENDING
          ) {
            throw new Error(
              'user-action-request-already-pending'
            );
          }

          const latestAllowedStatuses =
            [USER_REQUEST_ACTION.CHANGE, USER_REQUEST_ACTION.CANCEL].includes(
              actionType
            )
              ? [STATUS.REQUESTED, STATUS.ON_HOLD]
              : [STATUS.APPROVED];

          if (
            !latestAllowedStatuses.includes(
              latestRequest.status
            )
          ) {
            throw new Error(
              'invalid-user-action-request-status'
            );
          }

          committedActionRequest = {
            type: actionType,
            status:
              USER_REQUEST_REVIEW_STATUS.PENDING,
            reason: nextReason,
            team: nextTeam,
            borrower: nextBorrower,
            startDate: nextStartDate,
            dueDate: nextDueDate,
            purpose: nextPurpose,
            requestedAt:
              serverTimestamp(),
            reviewedAt: null,
            reviewedByUid: '',
            reviewedByName: '',
            reviewMemo: '',
          };

          transaction.update(
            requestDocRef,
            {
              userActionRequest:
                committedActionRequest,
              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      setRentalRequests((prev) =>
        (prev || []).map((request) =>
          request.id === requestId
            ? {
                ...request,
                userActionRequest: {
                  ...committedActionRequest,
                  requestedAt:
                    new Date(),
                },
              }
            : request
        )
      );

      triggerToast(
        `${getUserRequestActionLabel(
          actionType
        )}이 접수되었습니다.`,
        'success'
      );

      setUserActionDialog(null);
      setUserActionForm(
        createDefaultUserActionForm()
      );
    } catch (error) {
      console.error(
        'User rental action request error:',
        error
      );

      const errorMessage =
        error?.message ===
        'user-action-request-already-pending'
          ? '이미 검토 중인 사용자 요청이 있습니다.'
          : error?.message ===
              'invalid-user-action-request-status'
            ? '현재 신청 상태에서는 해당 요청을 제출할 수 없습니다.'
            : error?.message ===
                'rental-request-owner-mismatch'
              ? '본인 신청이 아닌 항목은 변경할 수 없습니다.'
              : error?.message ===
                  'rental-request-not-found'
                ? '정식 대여 신청 문서를 찾을 수 없습니다.'
                : `사용자 요청 저장에 실패했습니다. 오류 코드: ${
                    error?.code ||
                    error?.message ||
                    'unknown-error'
                  }`;

      triggerToast(
        errorMessage,
        'error'
      );
    } finally {
      setUserActionSaving(false);
    }
  };

  const getCurrentAdminAuditActor = () => ({
    uid:
      firebaseAuth.currentUser?.uid ||
      authenticatedAdminAccount?.authUid ||
      '',

    adminId:
      authenticatedAdminAccount?.id ||
      '',

    name:
      authenticatedAdminAccount?.userName ||
      authenticatedAdminAccount?.adminLoginId ||
      authenticatedAdminAccount?.authEmail ||
      '관리자',
  });

    const reviewUserActionRequest = async (
    id,
    approved
  ) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 사용자 요청을 처리할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentRequest =
      mergedRentalRequests.find(
        (request) => request.id === id
      );

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 사용자 요청 처리를 중단했습니다.',
        'error'
      );
      return;
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      id
    );

    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      id
    );

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      currentRequest.laptopId
    );

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let shouldKeepAvailability = false;
    let processedActionType = '';

    setAdminUserActionSavingRequestId(id);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const [
            requestSnapshot,
            assetSnapshot,
          ] = await Promise.all([
            transaction.get(
              requestDocRef
            ),
            transaction.get(
              assetDocRef
            ),
          ]);

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          if (!assetSnapshot.exists()) {
            throw new Error(
              'rental-asset-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          const userActionRequest =
            latestRequest.userActionRequest;

          if (
            !userActionRequest ||
            userActionRequest.status !==
              USER_REQUEST_REVIEW_STATUS.PENDING
          ) {
            throw new Error(
              'user-action-request-not-pending'
            );
          }

          processedActionType =
            userActionRequest.type || '';

          if (
            !Object.values(
              USER_REQUEST_ACTION
            ).includes(
              processedActionType
            )
          ) {
            throw new Error(
              'invalid-user-action-request-type'
            );
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const latestReservations =
            normalizeAssetReservations(
              latestAsset.reservations || []
            ).filter(
              (request) =>
                request.id !== id
            );

          const nextReviewStatus =
            approved
              ? USER_REQUEST_REVIEW_STATUS.APPROVED
              : USER_REQUEST_REVIEW_STATUS.DENIED;

          const nextUserActionRequest = {
            ...userActionRequest,
            status: nextReviewStatus,
            reviewedAt:
              serverTimestamp(),
            reviewedByUid:
              auditActor.uid,
            reviewedByName:
              auditActor.name,
            reviewMemo:
              latestRequest.adminMemo || '',
          };

          const previousStatus =
            latestRequest.status || '';

          let nextStatus =
            previousStatus;

          let nextRequestFields = {
            userActionRequest:
              nextUserActionRequest,
            updatedAt:
              serverTimestamp(),
            syncedAt:
              serverTimestamp(),
          };

          let nextCommittedRequest = {
            ...latestRequest,
            userActionRequest:
              nextUserActionRequest,
          };

          if (approved) {
            if (
              processedActionType ===
              USER_REQUEST_ACTION.CHANGE
            ) {
              if (
                ![
                  STATUS.REQUESTED,
                  STATUS.ON_HOLD,
                ].includes(
                  previousStatus
                )
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              const nextStartDate =
                userActionRequest.startDate || '';

              const nextDueDate =
                userActionRequest.dueDate || '';

              const latestAvailability =
                getLaptopRentalAvailability(
                  latestAsset,
                  latestReservations,
                  data.settings,
                  nextStartDate,
                  nextDueDate
                );

              if (
                latestAvailability.blocked
              ) {
                throw new Error(
                  'user-action-period-conflict'
                );
              }

              nextRequestFields = {
                ...nextRequestFields,
                team:
                  userActionRequest.team || '',
                borrower:
                  userActionRequest.borrower || '',
                startDate:
                  nextStartDate,
                dueDate:
                  nextDueDate,
                purpose:
                  userActionRequest.purpose || '',
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                team:
                  userActionRequest.team || '',
                borrower:
                  userActionRequest.borrower || '',
                startDate:
                  nextStartDate,
                dueDate:
                  nextDueDate,
                purpose:
                  userActionRequest.purpose || '',
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.EXTEND
            ) {
              if (
                previousStatus !==
                STATUS.APPROVED
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              const nextDueDate =
                userActionRequest.dueDate || '';

              if (
                !nextDueDate ||
                nextDueDate <=
                  latestRequest.dueDate
              ) {
                throw new Error(
                  'invalid-extension-due-date'
                );
              }

              const latestAvailability =
                getLaptopRentalAvailability(
                  latestAsset,
                  latestReservations,
                  data.settings,
                  latestRequest.startDate,
                  nextDueDate
                );

              if (
                latestAvailability.blocked
              ) {
                throw new Error(
                  'user-action-period-conflict'
                );
              }

              nextRequestFields = {
                ...nextRequestFields,
                dueDate:
                  nextDueDate,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                dueDate:
                  nextDueDate,
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.CANCEL
            ) {
              if (
                ![
                  STATUS.REQUESTED,
                  STATUS.ON_HOLD,
                ].includes(
                  previousStatus
                )
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              nextStatus =
                STATUS.USER_CANCELLED;

              nextRequestFields = {
                ...nextRequestFields,
                status:
                  nextStatus,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                status:
                  nextStatus,
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.RETURN
            ) {
              if (
                previousStatus !==
                STATUS.APPROVED
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              nextStatus =
                STATUS.RETURNED;

              nextRequestFields = {
                ...nextRequestFields,
                status:
                  nextStatus,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                status:
                  nextStatus,
              };
            }
          }

          const nextAvailabilityRequest =
            toRentalAvailabilityRequest(
              nextCommittedRequest
            );

          shouldKeepAvailability =
            approved
              ? RENTAL_BLOCKING_REQUEST_STATUSES.includes(
                  nextStatus
                )
              : RENTAL_BLOCKING_REQUEST_STATUSES.includes(
                  previousStatus
                );

          const updatedReservations =
            approved
              ? shouldKeepAvailability
                ? [
                    ...latestReservations,
                    nextAvailabilityRequest,
                  ]
                : latestReservations
              : normalizeAssetReservations(
                  latestAsset.reservations || []
                );

          const representativeRequest =
            getLaptopRepresentativeRequest(
              updatedReservations,
              latestAsset.id
            );

          const nextAsset = {
            ...latestAsset,
            reservations:
              updatedReservations,
            status:
              latestAsset.status ===
              STATUS.UNAVAILABLE
                ? STATUS.UNAVAILABLE
                : representativeRequest
                  ? representativeRequest.status
                  : STATUS.AVAILABLE,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          transaction.update(
            requestDocRef,
            nextRequestFields
          );

          if (approved) {
            if (shouldKeepAvailability) {
              transaction.set(
                availabilityDocRef,
                {
                  ...nextAvailabilityRequest,
                  updatedAt:
                    serverTimestamp(),
                }
              );
            } else {
              transaction.delete(
                availabilityDocRef
              );
            }

            transaction.update(
              assetDocRef,
              {
                reservations:
                  nextAsset.reservations,
                status:
                  nextAsset.status,
                currentRequestId:
                  nextAsset.currentRequestId,
                updatedAt:
                  serverTimestamp(),
              }
            );

            committedAsset =
              nextAsset;

            committedAvailabilityRequest =
              shouldKeepAvailability
                ? nextAvailabilityRequest
                : null;
          }

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.USER_ACTION_REVIEWED,
              previousStatus,
              nextStatus,
              previousMemo:
                latestRequest.adminMemo || '',
              nextMemo:
                latestRequest.adminMemo || '',
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              detail:
                `${getUserRequestActionLabel(
                  processedActionType
                )} ${
                  approved
                    ? '승인'
                    : '불허'
                } · 요청 사유: ${
                  userActionRequest.reason ||
                  '-'
                }`,
              createdAt:
                serverTimestamp(),
            }
          );

          committedRequest =
            nextCommittedRequest;
        }
      );

      if (!committedRequest) {
        throw new Error(
          'user-action-review-result-missing'
        );
      }

      setRentalRequests((prev) =>
        (prev || []).map((request) =>
          request.id === id
            ? {
                ...committedRequest,
                userActionRequest: {
                  ...committedRequest.userActionRequest,
                  reviewedAt:
                    new Date(),
                },
              }
            : request
        )
      );

      if (
        approved &&
        committedAsset
      ) {
        setData((prev) => ({
          ...prev,
          requests:
            shouldKeepAvailability
              ? [
                  committedAvailabilityRequest,
                  ...(prev.requests || []).filter(
                    (request) =>
                      request.id !== id
                  ),
                ]
              : (prev.requests || []).filter(
                  (request) =>
                    request.id !== id
                ),
          laptops:
            (prev.laptops || []).map(
              (asset) =>
                asset.id ===
                committedAsset.id
                  ? committedAsset
                  : asset
            ),
        }));
      }

      triggerToast(
        `${getUserRequestActionLabel(
          processedActionType
        )}을 ${
          approved
            ? '승인'
            : '불허'
        }했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'User rental action review error:',
        error
      );

      const errorMessage =
        error?.message ===
        'user-action-request-not-pending'
          ? '검토 대기 중인 사용자 요청이 없습니다.'
          : error?.message ===
              'invalid-user-action-request-status'
            ? '현재 신청 상태에서는 해당 사용자 요청을 승인할 수 없습니다.'
            : error?.message ===
                'user-action-period-conflict'
              ? '변경 또는 연장 요청 기간이 다른 예약과 겹쳐 승인할 수 없습니다.'
              : error?.message ===
                  'invalid-extension-due-date'
                ? '연장 요청 반납일이 현재 반납일보다 늦지 않습니다.'
                : error?.message ===
                    'rental-request-not-found'
                  ? '정식 대여 신청 문서를 찾을 수 없습니다.'
                  : error?.message ===
                      'rental-asset-not-found'
                    ? '신청과 연결된 자산 문서를 찾을 수 없습니다.'
                    : `사용자 요청 처리에 실패했습니다. 오류 코드: ${
                        error?.code ||
                        error?.message ||
                        'unknown-error'
                      }`;

      triggerToast(
        errorMessage,
        'error'
      );
    } finally {
      setAdminUserActionSavingRequestId('');
    }
  };

  const openNoticePost = async (post) => {
    if (!post?.id) {
      return;
    }

    setSelectedNoticePostId(
      post.id
    );

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const postDocRef = doc(
            NOTICE_POSTS_COLLECTION_REF,
            post.id
          );

          const postSnapshot =
            await transaction.get(
              postDocRef
            );

          if (!postSnapshot.exists()) {
            return;
          }

          const currentViewCount =
            Number(
              postSnapshot.data().viewCount
            ) || 0;

          transaction.update(
            postDocRef,
            {
              viewCount:
                currentViewCount + 1,
            }
          );
        }
      );
    } catch (error) {
      console.error(
        'Notice post view count update error:',
        error
      );
    }
  };

  const closeNoticePost = () => {
    setSelectedNoticePostId('');
  };

  const openNoticePostDialog = (
    post = null
  ) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 공지사항을 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    setNoticePostDialog({
      mode: post ? 'edit' : 'create',
      postId: post?.id || '',
    });

    setNoticePostForm({
      title: post?.title || '',
      content: post?.content || '',
      isPinned: Boolean(
        post?.isPinned
      ),
    });
  };

  const closeNoticePostDialog = () => {
    if (noticePostSaving) return;

    setNoticePostDialog(null);
    setNoticePostForm(
      createDefaultNoticePostForm()
    );
  };

  const saveNoticePost = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 공지사항을 저장할 수 있습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 공지사항 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const title =
      String(
        noticePostForm.title || ''
      ).trim();

    const content =
      String(
        noticePostForm.content || ''
      ).trim();

    if (!title) {
      triggerToast(
        '공지사항 제목을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!content) {
      triggerToast(
        '공지사항 내용을 입력해 주세요.',
        'error'
      );
      return;
    }

    const isEditing =
      noticePostDialog?.mode === 'edit';

    const editingPost =
      isEditing
        ? noticePosts.find(
            (post) =>
              post.id ===
              noticePostDialog?.postId
          ) || null
        : null;

    if (isEditing && !editingPost) {
      triggerToast(
        '수정할 공지사항을 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    if (
      isEditing &&
      !editingPost.createdAt
    ) {
      triggerToast(
        '공지사항 등록 시각을 확인할 수 없어 수정을 중단했습니다.',
        'error'
      );
      return;
    }

    const postDocRef =
      isEditing
        ? doc(
            NOTICE_POSTS_COLLECTION_REF,
            editingPost.id
          )
        : doc(
            NOTICE_POSTS_COLLECTION_REF
          );

    setNoticePostSaving(true);

    try {
      await setDoc(
        postDocRef,
        {
          id: postDocRef.id,
          title,
          content,
          isPinned: Boolean(
            noticePostForm.isPinned
          ),
          authorUid:
            editingPost?.authorUid ||
            auditActor.uid,
          authorName:
            editingPost?.authorName ||
            auditActor.name,
          viewCount:
            Number(
              editingPost?.viewCount
            ) || 0,
          createdAt:
            editingPost?.createdAt ||
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
        }
      );

      triggerToast(
        `공지사항을 ${
          isEditing
            ? '수정'
            : '등록'
        }했습니다.`,
        'success'
      );

      setNoticePostDialog(null);
      setNoticePostForm(
        createDefaultNoticePostForm()
      );
    } catch (error) {
      console.error(
        'Notice post save error:',
        error
      );

      triggerToast(
        `공지사항 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setNoticePostSaving(false);
    }
  };

  const confirmDeleteNoticePost = (
    post
  ) => {
    if (
      !isAdminAuthenticated ||
      !post?.id
    ) {
      triggerToast(
        '관리자 인증과 공지사항 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      '공지사항 삭제',
      `[${post.title || '제목 없음'}] 공지사항을 삭제하시겠습니까? 삭제한 게시글은 복구할 수 없습니다.`,
      async () => {
        setNoticePostDeletingId(
          post.id
        );

        try {
          await deleteDoc(
            doc(
              NOTICE_POSTS_COLLECTION_REF,
              post.id
            )
          );

          if (
            selectedNoticePostId ===
            post.id
          ) {
            setSelectedNoticePostId('');
          }

          if (
            noticePostDialog?.postId ===
            post.id
          ) {
            setNoticePostDialog(null);
            setNoticePostForm(
              createDefaultNoticePostForm()
            );
          }

          triggerToast(
            '공지사항을 삭제했습니다.',
            'success'
          );
        } catch (error) {
          console.error(
            'Notice post delete error:',
            error
          );

          triggerToast(
            `공지사항 삭제에 실패했습니다. 오류 코드: ${
              error?.code ||
              error?.message ||
              'unknown-error'
            }`,
            'error'
          );
        } finally {
          setNoticePostDeletingId('');
        }
      }
    );
  };

  const saveNoticeBoardConfig = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 공지사항 목록 설정을 저장할 수 있습니다.',
        'error'
      );
      return;
    }

    const postsPerPage =
      getSafeNoticePostsPerPage(
        noticePostsPerPageInput
      );

    setNoticeBoardConfigSaving(true);

    try {
      await setDoc(
        NOTICE_BOARD_CONFIG_DOC_REF,
        {
          postsPerPage,
          updatedAt:
            serverTimestamp(),
        }
      );

      setNoticePage(1);
      setAdminNoticePage(1);

      triggerToast(
        `공지사항 일반 게시글을 페이지당 ${postsPerPage}개씩 표시하도록 저장했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Notice board config save error:',
        error
      );

      triggerToast(
        `공지사항 목록 설정 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setNoticeBoardConfigSaving(false);
    }
  };

    const toggleFaqPost = (postId) => {
    setExpandedFaqPostId(
      (currentPostId) =>
        currentPostId === postId
          ? ''
          : postId
    );
  };

  const toggleAdminFaqPost = (postId) => {
    setAdminExpandedFaqPostId(
      (currentPostId) =>
        currentPostId === postId
          ? ''
          : postId
    );
  };

  const openFaqPostDialog = (
    post = null
  ) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 FAQ를 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    if (
      !post &&
      faqCategories.length === 0
    ) {
      triggerToast(
        'FAQ를 등록하기 전에 카테고리를 먼저 등록해 주세요.',
        'error'
      );
      return;
    }

    setFaqPostDialog({
      mode: post ? 'edit' : 'create',
      postId: post?.id || '',
    });

    setFaqPostForm({
      categoryId:
        post?.categoryId ||
        faqCategories[0]?.id ||
        '',
      title: post?.title || '',
      content: post?.content || '',
      isPinned: Boolean(
        post?.isPinned
      ),
    });
  };

  const closeFaqPostDialog = () => {
    if (faqPostSaving) return;

    setFaqPostDialog(null);
    setFaqPostForm(
      createDefaultFaqPostForm()
    );
  };

  const saveFaqPost = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 FAQ를 저장할 수 있습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 FAQ 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const categoryId =
      String(
        faqPostForm.categoryId || ''
      ).trim();

    const title =
      String(
        faqPostForm.title || ''
      ).trim();

    const content =
      String(
        faqPostForm.content || ''
      ).trim();

    if (
      !categoryId ||
      !faqCategoryNameById.has(
        categoryId
      )
    ) {
      triggerToast(
        'FAQ 카테고리를 선택해 주세요.',
        'error'
      );
      return;
    }

    if (!title) {
      triggerToast(
        'FAQ 제목을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!content) {
      triggerToast(
        'FAQ 본문을 입력해 주세요.',
        'error'
      );
      return;
    }

    const isEditing =
      faqPostDialog?.mode === 'edit';

    const editingPost =
      isEditing
        ? faqPosts.find(
            (post) =>
              post.id ===
              faqPostDialog?.postId
          ) || null
        : null;

    if (isEditing && !editingPost) {
      triggerToast(
        '수정할 FAQ를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    if (
      isEditing &&
      !editingPost.createdAt
    ) {
      triggerToast(
        'FAQ 등록 시각을 확인할 수 없어 수정을 중단했습니다.',
        'error'
      );
      return;
    }

    const postDocRef =
      isEditing
        ? doc(
            FAQ_POSTS_COLLECTION_REF,
            editingPost.id
          )
        : doc(
            FAQ_POSTS_COLLECTION_REF
          );

    setFaqPostSaving(true);

    try {
      await setDoc(
        postDocRef,
        {
          id: postDocRef.id,
          categoryId,
          title,
          content,
          isPinned: Boolean(
            faqPostForm.isPinned
          ),
          authorUid:
            editingPost?.authorUid ||
            auditActor.uid,
          authorName:
            editingPost?.authorName ||
            auditActor.name,
          createdAt:
            editingPost?.createdAt ||
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
        }
      );

      triggerToast(
        `FAQ를 ${
          isEditing
            ? '수정'
            : '등록'
        }했습니다.`,
        'success'
      );

      setFaqPostDialog(null);
      setFaqPostForm(
        createDefaultFaqPostForm()
      );
    } catch (error) {
      console.error(
        'FAQ post save error:',
        error
      );

      triggerToast(
        `FAQ 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setFaqPostSaving(false);
    }
  };

  const confirmDeleteFaqPost = (
    post
  ) => {
    if (
      !isAdminAuthenticated ||
      !post?.id
    ) {
      triggerToast(
        '관리자 인증과 FAQ 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      'FAQ 삭제',
      `[${post.title || '제목 없음'}] FAQ를 삭제하시겠습니까? 삭제한 FAQ는 복구할 수 없습니다.`,
      async () => {
        setFaqPostDeletingId(
          post.id
        );

        try {
          await deleteDoc(
            doc(
              FAQ_POSTS_COLLECTION_REF,
              post.id
            )
          );

          if (
            expandedFaqPostId ===
            post.id
          ) {
            setExpandedFaqPostId('');
          }

          if (
            adminExpandedFaqPostId ===
            post.id
          ) {
            setAdminExpandedFaqPostId('');
          }

          if (
            faqPostDialog?.postId ===
            post.id
          ) {
            setFaqPostDialog(null);
            setFaqPostForm(
              createDefaultFaqPostForm()
            );
          }

          triggerToast(
            'FAQ를 삭제했습니다.',
            'success'
          );
        } catch (error) {
          console.error(
            'FAQ post delete error:',
            error
          );

          triggerToast(
            `FAQ 삭제에 실패했습니다. 오류 코드: ${
              error?.code ||
              error?.message ||
              'unknown-error'
            }`,
            'error'
          );
        } finally {
          setFaqPostDeletingId('');
        }
      }
    );
  };

  const saveFaqBoardConfig = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 FAQ 목록 설정을 저장할 수 있습니다.',
        'error'
      );
      return;
    }

    const postsPerPage =
      getSafeFaqPostsPerPage(
        faqPostsPerPageInput
      );

    setFaqBoardConfigSaving(true);

    try {
      await setDoc(
        FAQ_BOARD_CONFIG_DOC_REF,
        {
          postsPerPage,
          updatedAt:
            serverTimestamp(),
        }
      );

      setFaqPage(1);
      setAdminFaqPage(1);
      setExpandedFaqPostId('');
      setAdminExpandedFaqPostId('');

      triggerToast(
        `FAQ 일반 게시글을 페이지당 ${postsPerPage}개씩 표시하도록 저장했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'FAQ board config save error:',
        error
      );

      triggerToast(
        `FAQ 목록 설정 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setFaqBoardConfigSaving(false);
    }
  };

  const addFaqCategory = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 FAQ 카테고리를 등록할 수 있습니다.',
        'error'
      );
      return;
    }

    const categoryName =
      String(
        newFaqCategoryName || ''
      ).trim();

    if (!categoryName) {
      triggerToast(
        'FAQ 카테고리명을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      faqCategories.some(
        (category) =>
          String(
            category.name || ''
          ).trim().toLowerCase() ===
          categoryName.toLowerCase()
      )
    ) {
      triggerToast(
        '이미 등록된 FAQ 카테고리명입니다.',
        'error'
      );
      return;
    }

    const categoryDocRef = doc(
      FAQ_CATEGORIES_COLLECTION_REF
    );

    const nextOrder =
      faqCategories.reduce(
        (maximumOrder, category) =>
          Math.max(
            maximumOrder,
            Number(category.order) || 0
          ),
        0
      ) + 1;

    setFaqCategorySavingId('new');

    try {
      await setDoc(
        categoryDocRef,
        {
          id: categoryDocRef.id,
          name: categoryName,
          order: nextOrder,
          createdAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
        }
      );

      setNewFaqCategoryName('');

      triggerToast(
        `[${categoryName}] FAQ 카테고리를 등록했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'FAQ category create error:',
        error
      );

      triggerToast(
        `FAQ 카테고리 등록에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setFaqCategorySavingId('');
    }
  };

  const startEditFaqCategory = (
    category
  ) => {
    setEditingFaqCategoryId(
      category.id
    );
    setEditingFaqCategoryName(
      category.name || ''
    );
  };

  const saveFaqCategoryName = async (
    category
  ) => {
    if (
      !isAdminAuthenticated ||
      !category?.id
    ) {
      triggerToast(
        '관리자 인증과 FAQ 카테고리 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    const nextCategoryName =
      String(
        editingFaqCategoryName || ''
      ).trim();

    if (!nextCategoryName) {
      triggerToast(
        'FAQ 카테고리명을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      faqCategories.some(
        (item) =>
          item.id !== category.id &&
          String(
            item.name || ''
          ).trim().toLowerCase() ===
          nextCategoryName.toLowerCase()
      )
    ) {
      triggerToast(
        '이미 등록된 FAQ 카테고리명입니다.',
        'error'
      );
      return;
    }

    setFaqCategorySavingId(
      category.id
    );

    try {
      await setDoc(
        doc(
          FAQ_CATEGORIES_COLLECTION_REF,
          category.id
        ),
        {
          name: nextCategoryName,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      setEditingFaqCategoryId('');
      setEditingFaqCategoryName('');

      triggerToast(
        'FAQ 카테고리명을 수정했습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'FAQ category update error:',
        error
      );

      triggerToast(
        `FAQ 카테고리 수정에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setFaqCategorySavingId('');
    }
  };

  const confirmDeleteFaqCategory = (
    category
  ) => {
    if (
      !isAdminAuthenticated ||
      !category?.id
    ) {
      triggerToast(
        '관리자 인증과 FAQ 카테고리 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    const categoryPostCount =
      faqPosts.filter(
        (post) =>
          post.categoryId ===
          category.id
      ).length;

    if (categoryPostCount > 0) {
      triggerToast(
        `[${category.name}] 카테고리를 사용하는 FAQ가 ${categoryPostCount}건 있어 삭제할 수 없습니다.`,
        'error'
      );
      return;
    }

    triggerConfirm(
      'FAQ 카테고리 삭제',
      `[${category.name || '이름 없음'}] 카테고리를 삭제하시겠습니까?`,
      async () => {
        setFaqCategoryDeletingId(
          category.id
        );

        try {
          await deleteDoc(
            doc(
              FAQ_CATEGORIES_COLLECTION_REF,
              category.id
            )
          );

          if (
            activeFaqCategoryId ===
            category.id
          ) {
            setActiveFaqCategoryId('all');
            setExpandedFaqPostId('');
            setFaqPage(1);
          }

          if (
            faqPostForm.categoryId ===
            category.id
          ) {
            setFaqPostForm(
              (currentForm) => ({
                ...currentForm,
                categoryId: '',
              })
            );
          }

          if (
            editingFaqCategoryId ===
            category.id
          ) {
            setEditingFaqCategoryId('');
            setEditingFaqCategoryName('');
          }

          triggerToast(
            'FAQ 카테고리를 삭제했습니다.',
            'success'
          );
        } catch (error) {
          console.error(
            'FAQ category delete error:',
            error
          );

          triggerToast(
            `FAQ 카테고리 삭제에 실패했습니다. 오류 코드: ${
              error?.code ||
              error?.message ||
              'unknown-error'
            }`,
            'error'
          );
        } finally {
          setFaqCategoryDeletingId('');
        }
      }
    );
  };

  const getAdminRequestRestoreTargets = (
    request
  ) => {
    if (!request?.id) {
      return [];
    }

    const requestLogs =
      rentalRequestLogsByRequestId.get(
        request.id
      ) || [];

    const latestStatusLog =
      requestLogs.find(
        (log) =>
          [
            RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED,
            RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
          ].includes(log.action) &&
          log.nextStatus ===
            request.status &&
          log.previousStatus &&
          log.previousStatus !==
            request.status
      );

    const fallbackTargets =
      RENTAL_REQUEST_RESTORE_TARGETS[
        request.status
      ] || [];

    return [
      ...new Set([
        latestStatusLog?.previousStatus,
        ...fallbackTargets,
      ].filter(Boolean)),
    ].filter(
      (targetStatus) =>
        (
          RENTAL_REQUEST_STATUS_TRANSITIONS[
            request.status
          ] || []
        ).includes(targetStatus)
    );
  };

  const openAdminRequestEditDialog = (
    request
  ) => {
    if (
      !isAdminAuthenticated ||
      !request?.id ||
      !rentalRequestIdSet.has(request.id)
    ) {
      triggerToast(
        '관리자 인증과 정식 신청 문서를 확인해 주세요.',
        'error'
      );
      return;
    }

    setAdminRequestEditDialog({
      requestId: request.id,
    });
    setAdminRequestEditForm(
      createDefaultAdminRequestEditForm(
        request
      )
    );
  };

  const closeAdminRequestEditDialog = () => {
    if (adminRequestEditSaving) return;

    setAdminRequestEditDialog(null);
    setAdminRequestEditForm(
      createDefaultAdminRequestEditForm()
    );
  };

  const saveAdminRequestEdit = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신청 정보를 수정할 수 없습니다.',
        'error'
      );
      return;
    }

    const requestId =
      adminRequestEditDialog?.requestId ||
      '';

    const currentRequest =
      mergedRentalRequests.find(
        (request) =>
          request.id === requestId
      );

    if (
      !currentRequest ||
      !rentalRequestIdSet.has(requestId)
    ) {
      triggerToast(
        '수정할 정식 대여 신청 문서를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const nextTeam =
      String(
        adminRequestEditForm.team || ''
      ).trim();

    const nextBorrower =
      String(
        adminRequestEditForm.borrower || ''
      ).trim();

    const nextStartDate =
      String(
        adminRequestEditForm.startDate ||
        ''
      );

    const nextDueDate =
      String(
        adminRequestEditForm.dueDate || ''
      );

    const nextPurpose =
      String(
        adminRequestEditForm.purpose || ''
      ).trim();

    const nextAdminMemo =
      String(
        adminRequestEditForm.adminMemo ||
        ''
      ).trim();

    if (
      !nextTeam ||
      !nextBorrower ||
      !nextStartDate ||
      !nextDueDate
    ) {
      triggerToast(
        '부서, 대여자명, 대여 시작일과 반납 예정일을 모두 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      nextDueDate <
      nextStartDate
    ) {
      triggerToast(
        '반납 예정일은 대여 시작일보다 빠를 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 신청 정보 수정을 중단했습니다.',
        'error'
      );
      return;
    }

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let shouldKeepAvailability = false;

    setAdminRequestEditSaving(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestDocRef = doc(
            RENTAL_REQUESTS_COLLECTION_REF,
            requestId
          );

          const availabilityDocRef = doc(
            RENTAL_AVAILABILITY_COLLECTION_REF,
            requestId
          );

          const requestSnapshot =
            await transaction.get(
              requestDocRef
            );

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          shouldKeepAvailability =
            RENTAL_BLOCKING_REQUEST_STATUSES.includes(
              latestRequest.status
            );

          const nextRequest = {
            ...latestRequest,
            team: nextTeam,
            borrower: nextBorrower,
            startDate: nextStartDate,
            dueDate: nextDueDate,
            purpose: nextPurpose,
            adminMemo: nextAdminMemo,
          };

          if (shouldKeepAvailability) {
            const assetDocRef = doc(
              RENTAL_ASSETS_COLLECTION_REF,
              latestRequest.laptopId
            );

            const assetSnapshot =
              await transaction.get(
                assetDocRef
              );

            if (!assetSnapshot.exists()) {
              throw new Error(
                'rental-asset-not-found'
              );
            }

            const latestAsset = {
              ...assetSnapshot.data(),
              id: assetSnapshot.id,
            };

            const latestReservations =
              normalizeAssetReservations(
                latestAsset.reservations ||
                []
              ).filter(
                (request) =>
                  request.id !==
                  requestId
              );

            const nextAvailability =
              getLaptopRentalAvailability(
                latestAsset,
                latestReservations,
                data.settings,
                nextStartDate,
                nextDueDate
              );

            if (nextAvailability.blocked) {
              const conflictError =
                new Error(
                  'rental-period-conflict'
                );

              conflictError.blockingRequest =
                nextAvailability.blockingRequest ||
                null;

              throw conflictError;
            }

            const availabilityRequest =
              toRentalAvailabilityRequest(
                nextRequest
              );

            const updatedReservations = [
              ...latestReservations,
              availabilityRequest,
            ];

            const representativeRequest =
              getLaptopRepresentativeRequest(
                updatedReservations,
                latestAsset.id
              );

            const nextAsset = {
              ...latestAsset,
              reservations:
                updatedReservations,
              status:
                latestAsset.status ===
                STATUS.UNAVAILABLE
                  ? STATUS.UNAVAILABLE
                  : representativeRequest
                    ? representativeRequest.status
                    : STATUS.AVAILABLE,
              currentRequestId:
                representativeRequest?.id ||
                null,
            };

            transaction.set(
              availabilityDocRef,
              {
                ...availabilityRequest,
                updatedAt:
                  serverTimestamp(),
              }
            );

            transaction.update(
              assetDocRef,
              {
                reservations:
                  nextAsset.reservations,
                status:
                  nextAsset.status,
                currentRequestId:
                  nextAsset.currentRequestId,
                updatedAt:
                  serverTimestamp(),
              }
            );

            committedAsset =
              nextAsset;
            committedAvailabilityRequest =
              availabilityRequest;
          }

          const detailParts = [];

          if (
            latestRequest.team !==
            nextTeam
          ) {
            detailParts.push(
              `부서: ${latestRequest.team || '-'} → ${nextTeam}`
            );
          }

          if (
            latestRequest.borrower !==
            nextBorrower
          ) {
            detailParts.push(
              `대여자: ${latestRequest.borrower || '-'} → ${nextBorrower}`
            );
          }

          if (
            latestRequest.startDate !==
            nextStartDate
          ) {
            detailParts.push(
              `대여 시작일: ${latestRequest.startDate || '-'} → ${nextStartDate}`
            );
          }

          if (
            latestRequest.dueDate !==
            nextDueDate
          ) {
            detailParts.push(
              `반납 예정일: ${latestRequest.dueDate || '-'} → ${nextDueDate}`
            );
          }

          if (
            String(
              latestRequest.purpose || ''
            ) !== nextPurpose
          ) {
            detailParts.push(
              '대여 목적 변경'
            );
          }

          if (
            String(
              latestRequest.adminMemo ||
              ''
            ) !== nextAdminMemo
          ) {
            detailParts.push(
              '관리자 메모 변경'
            );
          }

          transaction.update(
            requestDocRef,
            {
              team: nextTeam,
              borrower: nextBorrower,
              startDate: nextStartDate,
              dueDate: nextDueDate,
              purpose: nextPurpose,
              adminMemo: nextAdminMemo,
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.REQUEST_EDITED,
              previousStatus:
                latestRequest.status || '',
              nextStatus:
                latestRequest.status || '',
              previousMemo:
                latestRequest.adminMemo || '',
              nextMemo:
                nextAdminMemo,
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              detail:
                detailParts.length > 0
                  ? detailParts.join(' / ')
                  : '신청 정보를 다시 저장했습니다.',
              createdAt:
                serverTimestamp(),
            }
          );

          committedRequest =
            nextRequest;
        }
      );

      if (!committedRequest) {
        throw new Error(
          'rental-request-edit-result-missing'
        );
      }

      setRentalRequests((prev) =>
        (prev || []).map(
          (request) =>
            request.id === requestId
              ? committedRequest
              : request
        )
      );

      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !==
                    requestId
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !==
                  requestId
              ),
        laptops:
          committedAsset
            ? (prev.laptops || []).map(
                (asset) =>
                  asset.id ===
                  committedAsset.id
                    ? committedAsset
                    : asset
              )
            : prev.laptops,
      }));

      setAdminRequestEditDialog(null);
      setAdminRequestEditForm(
        createDefaultAdminRequestEditForm()
      );

      triggerToast(
        '대여 신청 정보를 수정했습니다. 관리자 수정에는 최대 14일 제한을 적용하지 않았습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'Admin rental request edit error:',
        error
      );

      if (
        error?.message ===
        'rental-period-conflict'
      ) {
        const blockingRequest =
          error.blockingRequest;

        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 신청 정보를 수정할 수 없습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없습니다.',
          'error'
        );
        return;
      }

      triggerToast(
        `대여 신청 정보 수정에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setAdminRequestEditSaving(false);
    }
  };

  const openAdminRequestRestoreDialog = (
    request
  ) => {
    if (
      !isAdminAuthenticated ||
      !request?.id ||
      !rentalRequestIdSet.has(request.id)
    ) {
      triggerToast(
        '관리자 인증과 정식 신청 문서를 확인해 주세요.',
        'error'
      );
      return;
    }

    const targetOptions =
      getAdminRequestRestoreTargets(
        request
      );

    if (targetOptions.length === 0) {
      triggerToast(
        '현재 신청은 되돌릴 수 있는 이전 상태가 없습니다.',
        'error'
      );
      return;
    }

    setAdminRequestRestoreDialog({
      requestId: request.id,
      targetOptions,
    });
    setAdminRequestRestoreTarget(
      targetOptions[0]
    );
    setAdminRequestRestoreReason('');
  };

  const closeAdminRequestRestoreDialog = () => {
    if (adminRequestRestoreSaving) return;

    setAdminRequestRestoreDialog(null);
    setAdminRequestRestoreTarget('');
    setAdminRequestRestoreReason('');
  };

  const restoreAdminRequestStatus = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 상태를 복구할 수 없습니다.',
        'error'
      );
      return;
    }

    const requestId =
      adminRequestRestoreDialog?.requestId ||
      '';

    const currentRequest =
      mergedRentalRequests.find(
        (request) =>
          request.id === requestId
      );

    const nextStatus =
      adminRequestRestoreTarget;

    const restoreReason =
      String(
        adminRequestRestoreReason || ''
      ).trim();

    if (
      !currentRequest ||
      !rentalRequestIdSet.has(requestId)
    ) {
      triggerToast(
        '복구할 정식 대여 신청 문서를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    if (!restoreReason) {
      triggerToast(
        '상태 복구 사유를 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      !(
        RENTAL_REQUEST_STATUS_TRANSITIONS[
          currentRequest.status
        ] || []
      ).includes(nextStatus)
    ) {
      triggerToast(
        '현재 상태에서 선택한 상태로 복구할 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 상태 복구를 중단했습니다.',
        'error'
      );
      return;
    }

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let shouldKeepAvailability = false;

    setAdminRequestRestoreSaving(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestDocRef = doc(
            RENTAL_REQUESTS_COLLECTION_REF,
            requestId
          );

          const availabilityDocRef = doc(
            RENTAL_AVAILABILITY_COLLECTION_REF,
            requestId
          );

          const requestSnapshot =
            await transaction.get(
              requestDocRef
            );

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          if (
            !(
              RENTAL_REQUEST_STATUS_TRANSITIONS[
                latestRequest.status
              ] || []
            ).includes(nextStatus)
          ) {
            const transitionError =
              new Error(
                'invalid-rental-status-transition'
              );

            transitionError.previousStatus =
              latestRequest.status || '';
            transitionError.nextStatus =
              nextStatus;

            throw transitionError;
          }

          if (
            !latestRequest.startDate ||
            !latestRequest.dueDate ||
            latestRequest.dueDate <
              latestRequest.startDate
          ) {
            throw new Error(
              'invalid-rental-period'
            );
          }

          const assetDocRef = doc(
            RENTAL_ASSETS_COLLECTION_REF,
            latestRequest.laptopId
          );

          const assetSnapshot =
            await transaction.get(
              assetDocRef
            );

          if (!assetSnapshot.exists()) {
            throw new Error(
              'rental-asset-not-found'
            );
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const latestReservations =
            normalizeAssetReservations(
              latestAsset.reservations || []
            ).filter(
              (request) =>
                request.id !==
                requestId
            );

          const nextRequest = {
            ...latestRequest,
            status: nextStatus,
            userActionRequest: null,
          };

          const availabilityRequest =
            toRentalAvailabilityRequest(
              nextRequest
            );

          shouldKeepAvailability =
            RENTAL_BLOCKING_REQUEST_STATUSES.includes(
              nextStatus
            );

          if (shouldKeepAvailability) {
            const nextAvailability =
              getLaptopRentalAvailability(
                latestAsset,
                latestReservations,
                data.settings,
                latestRequest.startDate,
                latestRequest.dueDate
              );

            if (nextAvailability.blocked) {
              const conflictError =
                new Error(
                  'rental-period-conflict'
                );

              conflictError.blockingRequest =
                nextAvailability.blockingRequest ||
                null;

              throw conflictError;
            }
          }

          const updatedReservations =
            shouldKeepAvailability
              ? [
                  ...latestReservations,
                  availabilityRequest,
                ]
              : latestReservations;

          const representativeRequest =
            getLaptopRepresentativeRequest(
              updatedReservations,
              latestAsset.id
            );

          const nextAsset = {
            ...latestAsset,
            reservations:
              updatedReservations,
            status:
              latestAsset.status ===
              STATUS.UNAVAILABLE
                ? STATUS.UNAVAILABLE
                : representativeRequest
                  ? representativeRequest.status
                  : STATUS.AVAILABLE,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          transaction.update(
            requestDocRef,
            {
              status: nextStatus,
              userActionRequest: null,
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );

          if (shouldKeepAvailability) {
            transaction.set(
              availabilityDocRef,
              {
                ...availabilityRequest,
                updatedAt:
                  serverTimestamp(),
              }
            );
          } else {
            transaction.delete(
              availabilityDocRef
            );
          }

          transaction.update(
            assetDocRef,
            {
              reservations:
                nextAsset.reservations,
              status:
                nextAsset.status,
              currentRequestId:
                nextAsset.currentRequestId,
              updatedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
              previousStatus:
                latestRequest.status || '',
              nextStatus,
              previousMemo:
                latestRequest.adminMemo || '',
              nextMemo:
                latestRequest.adminMemo || '',
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              detail:
                `상태 복구 사유: ${restoreReason}`,
              createdAt:
                serverTimestamp(),
            }
          );

          committedRequest =
            nextRequest;
          committedAsset =
            nextAsset;
          committedAvailabilityRequest =
            shouldKeepAvailability
              ? availabilityRequest
              : null;
        }
      );

      if (
        !committedRequest ||
        !committedAsset
      ) {
        throw new Error(
          'rental-status-restore-result-missing'
        );
      }

      setRentalRequests((prev) =>
        (prev || []).map(
          (request) =>
            request.id === requestId
              ? committedRequest
              : request
        )
      );

      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !==
                    requestId
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !==
                  requestId
              ),
        laptops:
          (prev.laptops || []).map(
            (asset) =>
              asset.id ===
              committedAsset.id
                ? committedAsset
                : asset
          ),
      }));

      setAdminRequestRestoreDialog(null);
      setAdminRequestRestoreTarget('');
      setAdminRequestRestoreReason('');
      setSelectedAdminRequestId('');
      setAdminRequestPage(1);

      triggerToast(
        `상태를 [${nextStatus}]로 복구했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Admin rental request restore error:',
        error
      );

      if (
        error?.message ===
        'rental-period-conflict'
      ) {
        const blockingRequest =
          error.blockingRequest;

        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 상태를 복구할 수 없습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'invalid-rental-period'
      ) {
        triggerToast(
          '대여 시작일과 반납 예정일을 먼저 올바르게 수정해 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'invalid-rental-status-transition'
      ) {
        triggerToast(
          `허용되지 않은 상태 복구입니다. 현재 상태: ${error.previousStatus || '-'}, 복구 대상: ${error.nextStatus || '-'}`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없습니다.',
          'error'
        );
        return;
      }

      triggerToast(
        `상태 복구에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setAdminRequestRestoreSaving(false);
    }
  };
  
  const updateRequest = async (id, status) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신청 상태를 변경할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentRequest =
      mergedRentalRequests.find(
        (request) => request.id === id
      );

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 상태 변경을 중단했습니다.',
        'error'
      );
      return;
    }

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let shouldKeepAvailability = false;

    const nextDisplayStatus =
      getDisplayRentalStatus(
        status,
        currentRequest.startDate,
        currentRequest.dueDate
      );

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestDocRef = doc(
            RENTAL_REQUESTS_COLLECTION_REF,
            id
          );

          const availabilityDocRef = doc(
            RENTAL_AVAILABILITY_COLLECTION_REF,
            id
          );

          const assetDocRef = doc(
            RENTAL_ASSETS_COLLECTION_REF,
            currentRequest.laptopId
          );

          const [
            requestSnapshot,
            assetSnapshot,
          ] = await Promise.all([
            transaction.get(
              requestDocRef
            ),
            transaction.get(
              assetDocRef
            ),
          ]);

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          if (!assetSnapshot.exists()) {
            throw new Error(
              'rental-asset-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          const previousStatus =
            latestRequest.status || '';

          const allowedNextStatuses =
            RENTAL_REQUEST_STATUS_TRANSITIONS[
              previousStatus
            ] || [];

          if (
            !allowedNextStatuses.includes(
              status
            )
          ) {
            const transitionError =
              new Error(
                'invalid-rental-status-transition'
              );

            transitionError.previousStatus =
              previousStatus;

            transitionError.nextStatus =
              status;

            throw transitionError;
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const nextCommittedRequest = {
            ...latestRequest,
            status,
          };

          const availabilityRequest =
            toRentalAvailabilityRequest(
              nextCommittedRequest
            );

          const latestReservations =
            normalizeAssetReservations(
              latestAsset.reservations || []
            ).filter(
              (request) =>
                request.id !== id
            );

          shouldKeepAvailability =
            RENTAL_BLOCKING_REQUEST_STATUSES.includes(
              status
            );
          
          if (shouldKeepAvailability) {
            const nextAvailability =
              getLaptopRentalAvailability(
                latestAsset,
                latestReservations,
                data.settings,
                latestRequest.startDate,
                latestRequest.dueDate
              );

            if (nextAvailability.blocked) {
              const conflictError =
                new Error(
                  'rental-period-conflict'
                );

              conflictError.blockingRequest =
                nextAvailability.blockingRequest ||
                null;

              throw conflictError;
            }
          }

          const updatedReservations =
            shouldKeepAvailability
              ? [
                  ...latestReservations,
                  availabilityRequest,
                ]
              : latestReservations;

          const representativeRequest =
            getLaptopRepresentativeRequest(
              updatedReservations,
              latestAsset.id
            );

          const nextAsset = {
            ...latestAsset,
            reservations:
              updatedReservations,
            status:
              latestAsset.status ===
              STATUS.UNAVAILABLE
                ? STATUS.UNAVAILABLE
                : representativeRequest
                  ? representativeRequest.status
                  : STATUS.AVAILABLE,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          transaction.update(
            requestDocRef,
            {
              status,
              adminMemo:
                latestRequest.adminMemo || '',
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED,
              previousStatus,
              nextStatus: status,
              previousMemo:
                latestRequest.adminMemo || '',
              nextMemo:
                latestRequest.adminMemo || '',
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              createdAt:
                serverTimestamp(),
            }
          );

          if (shouldKeepAvailability) {
            transaction.set(
              availabilityDocRef,
              {
                ...availabilityRequest,
                updatedAt:
                  serverTimestamp(),
              }
            );
          } else {
            transaction.delete(
              availabilityDocRef
            );
          }

          transaction.update(
            assetDocRef,
            {
              reservations:
                nextAsset.reservations,
              status:
                nextAsset.status,
              currentRequestId:
                nextAsset.currentRequestId,
              updatedAt:
                serverTimestamp(),
            }
          );

          committedRequest =
            nextCommittedRequest;

          committedAsset =
            nextAsset;

          committedAvailabilityRequest =
            shouldKeepAvailability
              ? availabilityRequest
              : null;
        }
      );

      if (
        !committedRequest ||
        !committedAsset
      ) {
        throw new Error(
          'rental-status-transaction-result-missing'
        );
      }

      setRentalRequests((prev) => {
        const requestExists =
          (prev || []).some(
            (request) =>
              request.id === id
          );

        if (!requestExists) {
          return [
            committedRequest,
            ...(prev || []),
          ];
        }

        return (prev || []).map(
          (request) =>
            request.id === id
              ? committedRequest
              : request
        );
      });

      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !== id
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !== id
              ),
        laptops:
          (prev.laptops || []).map(
            (asset) =>
              asset.id ===
              committedAsset.id
                ? committedAsset
                : asset
          ),
      }));

      setSelectedAdminRequestId('');
      setAdminRequestPage(1);

      triggerToast(
        `상태가 [${nextDisplayStatus}]로 업데이트 되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Rental request status update error:',
        error
      );

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없어 상태 변경을 중단했습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없어 상태 변경을 중단했습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'invalid-rental-status-transition'
      ) {
        triggerToast(
          `허용되지 않은 상태 변경입니다. 현재 상태: ${
            error.previousStatus || '-'
          }, 변경 요청: ${
            error.nextStatus || '-'
          }`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'rental-period-conflict'
      ) {
        const blockingRequest =
          error.blockingRequest;

        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 상태를 변경할 수 없습니다.',
          'error'
        );
        return;
      }

      const firebaseErrorCode =
        error?.code ||
        error?.message ||
        'unknown-error';

      triggerToast(
        `신청 상태와 기기 상태 저장에 실패했습니다. 오류 코드: ${firebaseErrorCode}`,
        'error'
      );
    }
  };

  const updateRequestMemo = (id, memo) => {
    const currentRequest = mergedRentalRequests.find(
      (request) => request.id === id
    );

    if (!currentRequest) return;

    const nextRequest = {
      ...currentRequest,
      adminMemo: memo,
    };

    setRentalRequests((prev) => {
      const requestExists = (prev || []).some(
        (request) => request.id === id
      );

      if (!requestExists) {
        return [nextRequest, ...(prev || [])];
      }

      return (prev || []).map((request) =>
        request.id === id ? nextRequest : request
      );
    });
  };

  const saveRequestMemo = async (id, memo) => {
    const currentRequest = mergedRentalRequests.find(
      (request) => request.id === id
    );

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 메모 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      id
    );

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    let memoWasChanged = false;

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestSnapshot =
            await transaction.get(
              requestDocRef
            );

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          const latestRequest =
            requestSnapshot.data();

          const previousMemo = String(
            latestRequest.adminMemo || ''
          );

          const nextMemo = String(
            memo || ''
          );

          if (
            previousMemo === nextMemo
          ) {
            return;
          }

          transaction.update(
            requestDocRef,
            {
              adminMemo: nextMemo,
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED,
              previousStatus:
                latestRequest.status || '',
              nextStatus:
                latestRequest.status || '',
              previousMemo,
              nextMemo,
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              createdAt:
                serverTimestamp(),
            }
          );

          memoWasChanged = true;
        }
      );

      if (!memoWasChanged) {
        return;
      }

      setRentalRequests((prev) =>
        (prev || []).map((request) =>
          request.id === id
            ? {
                ...request,
                adminMemo: memo,
              }
            : request
        )
      );
    } catch (error) {
      console.error(
        'Rental request memo save error:',
        error
      );

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서가 없어 관리자 메모를 저장하지 않았습니다.',
          'error'
        );
        return;
      }

      triggerToast(
        `관리자 메모 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }
  };

  const renderRequestActionButtons = (request) => {
    const displayStatus = getDisplayRentalStatus(
      request.status,
      request.startDate,
      request.dueDate
    );
    const actionButtonClassName = 'px-2.5 py-1.5 text-xs rounded-lg';

    if (request.status === STATUS.REQUESTED) {
      return (
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => updateRequest(request.id, STATUS.APPROVED)}
            variant="primary"
            className={actionButtonClassName}
          >
            승인
          </Button>
          <Button
            onClick={() => updateRequest(request.id, STATUS.ON_HOLD)}
            variant="secondary"
            className={`${actionButtonClassName} text-purple-700 bg-purple-50 hover:bg-purple-100`}
          >
            보류
          </Button>
          <Button
            onClick={() => updateRequest(request.id, STATUS.DENIED)}
            variant="dangerOutline"
            className={actionButtonClassName}
          >
            불허
          </Button>
        </div>
      );
    }

    if (request.status === STATUS.APPROVED) {
      return (
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => updateRequest(request.id, STATUS.RETURNED)}
            variant="outline"
            className={`${actionButtonClassName} text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200`}
          >
            반납확정
          </Button>
        </div>
      );
    }

    if (request.status === STATUS.ON_HOLD) {
      return (
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => updateRequest(request.id, STATUS.APPROVED)}
            variant="primary"
            className={actionButtonClassName}
          >
            승인
          </Button>
          <Button
            onClick={() => updateRequest(request.id, STATUS.DENIED)}
            variant="dangerOutline"
            className={actionButtonClassName}
          >
            불허
          </Button>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
        {displayStatus} 상태는 추가 처리 버튼이 없습니다.
      </div>
    );
  };


  // 신규 자산 생성 제어 로직
  const handleAddLaptopClick = () => {
    setShowUploadPanel(false);
    setEditLaptop(null);

    if (newLaptop) {
      setNewLaptop(null);
      return;
    }

    setNewLaptop({
      category: data.assetCategories?.[0] || '노트북',
      assetNo: '',
      serialNo: '',
      model: '',
      manufactureDate: today(),
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    });
  };
  
  // 수정 후 코드
  const createLaptop = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신규 자산을 등록할 수 없습니다.',
        'error'
      );
      return;
    }

    if (!newLaptop) {
      triggerToast(
        '신규 등록할 자산 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const newAssetNo = String(
      newLaptop.assetNo || ''
    ).trim();

    const newCategory = String(
      newLaptop.category || ''
    ).trim();

    if (!newAssetNo) {
      triggerToast(
        '자산 관리 번호를 정확히 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!newCategory) {
      triggerToast(
        '자산 카테고리를 선택해 주세요.',
        'error'
      );
      return;
    }

    const generatedAssetRef = doc(
      RENTAL_ASSETS_COLLECTION_REF
    );

    const newId =
      `NB-${generatedAssetRef.id}`;

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      newId
    );

    const registryId =
      getAssetNumberRegistryId(
        newAssetNo
      );

    const registryDocRef = doc(
      RENTAL_ASSET_NUMBERS_COLLECTION_REF,
      registryId
    );

    const newLaptopDraft = {
      ...newLaptop,
      id: newId,
      assetNo: newAssetNo,
      assetNoNormalized:
        normalizeAssetNumber(
          newAssetNo
        ),
      category: newCategory,
      status:
        newLaptop.status ===
        STATUS.UNAVAILABLE
          ? STATUS.UNAVAILABLE
          : STATUS.AVAILABLE,
      currentRequestId: null,
      reservations: [],
    };

    let committedAsset = null;

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const [
            configSnapshot,
            registrySnapshot,
          ] = await Promise.all([
            transaction.get(
              PUBLIC_CONFIG_DOC_REF
            ),
            transaction.get(
              registryDocRef
            ),
          ]);

          if (!configSnapshot.exists()) {
            throw new Error(
              'public-config-not-found'
            );
          }

          const categoryExists =
            (
              configSnapshot.data()
                .assetCategories || []
            ).some(
              (category) =>
                String(
                  category || ''
                ).trim() ===
                newCategory
            );

          if (!categoryExists) {
            throw new Error(
              'asset-category-not-found'
            );
          }

          if (registrySnapshot.exists()) {
            const duplicateError =
              new Error(
                'duplicate-asset-number'
              );

            duplicateError.duplicatedLaptop =
              registrySnapshot.data();

            throw duplicateError;
          }

          transaction.set(
            assetDocRef,
            {
              ...newLaptopDraft,
              createdAt:
                serverTimestamp(),
              updatedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            registryDocRef,
            {
              id: registryId,
              assetId: newId,
              assetNo: newAssetNo,
              assetNoNormalized:
                normalizeAssetNumber(
                  newAssetNo
                ),
              updatedAt:
                serverTimestamp(),
            }
          );

          committedAsset =
            newLaptopDraft;
        }
      );

      if (!committedAsset) {
        throw new Error(
          'laptop-create-transaction-result-missing'
        );
      }

      setData((prev) => ({
        ...prev,
        laptops: [
          ...(prev.laptops || []),
          committedAsset,
        ],
      }));

      setNewLaptop(null);

      triggerToast(
        `자산 ${newAssetNo}이(가) 신규 등록되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Laptop create transaction error:',
        error
      );

      if (
        error?.message ===
        'duplicate-asset-number'
      ) {
        const duplicatedAssetNo =
          error.duplicatedLaptop?.assetNo ||
          newAssetNo;

        triggerToast(
          `자산관리번호 [${duplicatedAssetNo}]은(는) 이미 등록되어 있어 신규 자산으로 추가할 수 없습니다.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-category-not-found'
      ) {
        triggerToast(
          '선택한 자산 카테고리가 최신 카테고리 목록에 없습니다. 신규 등록 패널을 닫고 다시 열어 주세요.',
          'error'
        );
        return;
      }

      triggerToast(
        '신규 자산 등록에 실패했습니다. 입력 내용은 유지됩니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
        'error'
      );
    }
  };

  // 엑셀/CSV 파일 일괄 자동 업로드 분석 처리 로직
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCsvFile = fileName.endsWith('.csv');

    if (!isExcelFile && !isCsvFile) {
      triggerToast('엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const dataBytes = new Uint8Array(evt.target.result);
        let jsonResult = [];

        if (isExcelFile) {
          if (!window.XLSX) {
            triggerToast('엑셀 처리 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
            e.target.value = '';
            return;
          }

          const workbook = window.XLSX.read(dataBytes, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          jsonResult = window.XLSX.utils.sheet_to_json(sheet);
        }

        if (isCsvFile) {
          const decoder = new TextDecoder('utf-8');
          const csvText = decoder.decode(dataBytes);

          if (window.XLSX) {
            const workbook = window.XLSX.read(csvText, { type: 'string' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            jsonResult = window.XLSX.utils.sheet_to_json(sheet);
          } else {
            const lines = csvText.split(/\r?\n/).filter(line => line.trim());

            if (lines.length > 0) {
              const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              jsonResult = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                const obj = {};
                headers.forEach((header, index) => {
                  obj[header] = values[index] || '';
                });
                return obj;
              });
            }
          }
        }

        await processParsedData(jsonResult);
        // 파일 인풋 버퍼 초기화로 동일 파일 재업로드 대응
        e.target.value = '';
      } catch (err) {
        triggerToast('파일 파싱 중 에러가 발생했습니다. 규격을 확인해 주세요.', 'error');
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 분석 완료된 자산 데이터 병합 가동
  const processParsedData = async (jsonList) => {
    if (!jsonList || jsonList.length === 0) {
      triggerToast(
        '업로드된 파일에서 읽어올 수 있는 자산이 감지되지 않았습니다.',
        'error'
      );
      return;
    }

    const parsedCandidates = [];
    let missingAssetNoCount = 0;

    jsonList.forEach((row, index) => {
      const matchVal = (keys) => {
        const matchedKey = Object.keys(row).find((keyName) =>
          keys.some((key) =>
            keyName
              .toLowerCase()
              .replace(/\s+/g, '')
              .includes(key.toLowerCase())
          )
        );

        return matchedKey
          ? String(row[matchedKey]).trim()
          : '';
      };

      const category = matchVal([
        '자산카테고리',
        '카테고리',
        '분류',
        'category',
        'assetcategory',
        'asset_category',
      ]);

      const assetNo = matchVal([
        '자산관리번호',
        '관리번호',
        '자산번호',
        'assetno',
        'asset_no',
      ]);

      const model = matchVal([
        '모델명',
        '모델',
        '기종',
        'model',
      ]);

      const serialNo = matchVal([
        '시리얼번호',
        '시리얼',
        'serialno',
        'serial_no',
        'sn',
        's/n',
      ]);

      const manufactureDate = matchVal([
        '제조일자',
        '제조일',
        '구입일자',
        '구입일',
        'manufacturedate',
        'manufacture_date',
      ]);

      const note = matchVal([
        '비고',
        '메모',
        '특이사항',
        'note',
      ]);

      const photo = matchVal([
        '사진url',
        '사진링크',
        '사진',
        'photo',
        'image',
      ]);

      const statusVal = matchVal([
        '대여가능여부',
        '대여가능',
        '대여상태',
        '상태',
        'status',
      ]);

      if (!assetNo) {
        missingAssetNoCount++;
        return;
      }

      const fallbackPhoto =
        'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80';

      const finalStatus =
        statusVal.includes('대여불가') ||
        statusVal.toLowerCase().includes('unavailable') ||
        statusVal.includes('불가')
          ? STATUS.UNAVAILABLE
          : STATUS.AVAILABLE;

      parsedCandidates.push({
        sourceIndex: index,
        category,
        assetNo: assetNo.trim(),
        serialNo:
          serialNo ||
          `SN-AUTO-${Math.floor(
            Math.random() * 90000 + 10000
          )}`,
        model: model || '미지정 기종',
        manufactureDate:
          manufactureDate || today(),
        photo: photo || fallbackPhoto,
        note: note || '',
        status: finalStatus,
        currentRequestId: null,
      });
    });

    if (parsedCandidates.length === 0) {
      if (missingAssetNoCount > 0) {
        triggerToast(
          '자산관리번호가 입력된 행이 없어 업로드하지 않았습니다.',
          'error'
        );
        return;
      }

      triggerToast(
        '헤더(자산카테고리, 자산관리번호, 모델명, 시리얼번호 등) 규격 정보가 일치하지 않아 가져오지 못했습니다.',
        'error'
      );
      return;
    }

    const acceptedAssets = [];
    const duplicateAssetNumbers = new Set();
    const invalidCategoryNames = new Set();

    let invalidCategoryCount = 0;
    let duplicateAssetNoCount = 0;

    try {
      const configSnapshot =
        await getDoc(PUBLIC_CONFIG_DOC_REF);

      if (!configSnapshot.exists()) {
        throw new Error(
          'public-config-not-found'
        );
      }

      const registeredCategoryMap =
        new Map(
          (
            configSnapshot.data()
              .assetCategories || []
          ).map((category) => [
            String(category || '')
              .trim()
              .toLowerCase(),
            category,
          ])
        );

      const fileAssetNoSet =
        new Set();

      const validatedCandidates = [];

      parsedCandidates.forEach(
        (candidate) => {
          const normalizedCategory =
            String(
              candidate.category || ''
            )
              .trim()
              .toLowerCase();

          const matchedCategory =
            registeredCategoryMap.get(
              normalizedCategory
            );

          if (
            !normalizedCategory ||
            !matchedCategory
          ) {
            invalidCategoryCount++;
            invalidCategoryNames.add(
              candidate.category ||
              '미입력'
            );
            return;
          }

          const normalizedAssetNo =
            normalizeAssetNumber(
              candidate.assetNo
            );

          if (
            fileAssetNoSet.has(
              normalizedAssetNo
            )
          ) {
            duplicateAssetNoCount++;
            duplicateAssetNumbers.add(
              candidate.assetNo
            );
            return;
          }

          fileAssetNoSet.add(
            normalizedAssetNo
          );

          const generatedAssetRef =
            doc(
              RENTAL_ASSETS_COLLECTION_REF
            );

          const assetId =
            `NB-UP-${generatedAssetRef.id}`;

          validatedCandidates.push({
            ...candidate,
            id: assetId,
            category:
              matchedCategory,
            assetNoNormalized:
              normalizedAssetNo,
            reservations: [],
          });
        }
      );

      const transactionChunkSize = 100;

      for (
        let startIndex = 0;
        startIndex <
        validatedCandidates.length;
        startIndex +=
        transactionChunkSize
      ) {
        const candidateChunk =
          validatedCandidates.slice(
            startIndex,
            startIndex +
              transactionChunkSize
          );

        let chunkResult = null;

        await runTransaction(
          db,
          async (transaction) => {
            const registryEntries =
              candidateChunk.map(
                (candidate) => {
                  const registryId =
                    getAssetNumberRegistryId(
                      candidate.assetNo
                    );

                  return {
                    candidate,
                    registryId,
                    registryRef: doc(
                      RENTAL_ASSET_NUMBERS_COLLECTION_REF,
                      registryId
                    ),
                    assetRef: doc(
                      RENTAL_ASSETS_COLLECTION_REF,
                      candidate.id
                    ),
                  };
                }
              );

            const registrySnapshots =
              await Promise.all(
                registryEntries.map(
                  (entry) =>
                    transaction.get(
                      entry.registryRef
                    )
                )
              );

            const createdAssets = [];
            const duplicatedAssetNumbers =
              [];

            registryEntries.forEach(
              (entry, index) => {
                if (
                  registrySnapshots[
                    index
                  ].exists()
                ) {
                  duplicatedAssetNumbers.push(
                    entry.candidate.assetNo
                  );
                  return;
                }

                const assetForSave = {
                  id:
                    entry.candidate.id,
                  category:
                    entry.candidate
                      .category,
                  assetNo:
                    entry.candidate
                      .assetNo,
                  assetNoNormalized:
                    entry.candidate
                      .assetNoNormalized,
                  serialNo:
                    entry.candidate
                      .serialNo,
                  model:
                    entry.candidate
                      .model,
                  manufactureDate:
                    entry.candidate
                      .manufactureDate,
                  photo:
                    entry.candidate
                      .photo,
                  note:
                    entry.candidate.note,
                  status:
                    entry.candidate
                      .status,
                  currentRequestId:
                    null,
                  reservations: [],
                };

                transaction.set(
                  entry.assetRef,
                  {
                    ...assetForSave,
                    createdAt:
                      serverTimestamp(),
                    updatedAt:
                      serverTimestamp(),
                  }
                );

                transaction.set(
                  entry.registryRef,
                  {
                    id:
                      entry.registryId,
                    assetId:
                      assetForSave.id,
                    assetNo:
                      assetForSave
                        .assetNo,
                    assetNoNormalized:
                      assetForSave
                        .assetNoNormalized,
                    updatedAt:
                      serverTimestamp(),
                  }
                );

                createdAssets.push(
                  assetForSave
                );
              }
            );

            chunkResult = {
              createdAssets,
              duplicatedAssetNumbers,
            };
          }
        );

        if (!chunkResult) {
          throw new Error(
            'bulk-upload-transaction-result-missing'
          );
        }

        acceptedAssets.push(
          ...chunkResult.createdAssets
        );

        chunkResult
          .duplicatedAssetNumbers
          .forEach((assetNo) => {
            duplicateAssetNoCount++;
            duplicateAssetNumbers.add(
              assetNo
            );
          });
      }

      if (acceptedAssets.length > 0) {
        setData((prev) => ({
          ...prev,
          laptops: [
            ...(prev.laptops || []),
            ...acceptedAssets,
          ],
        }));

        setShowUploadPanel(false);

        const skippedMessages = [];

        if (invalidCategoryCount > 0) {
          skippedMessages.push(
            `카테고리 불일치 ${invalidCategoryCount}건 제외`
          );
        }

        if (missingAssetNoCount > 0) {
          skippedMessages.push(
            `자산관리번호 누락 ${missingAssetNoCount}건 제외`
          );
        }

        if (duplicateAssetNoCount > 0) {
          skippedMessages.push(
            `중복 자산관리번호 ${duplicateAssetNoCount}건 제외`
          );
        }

        triggerToast(
          `총 ${acceptedAssets.length}대의 기기를 엑셀/CSV 데이터베이스로 일괄 추가 등록했습니다.` +
            `${
              skippedMessages.length
                ? ` (${skippedMessages.join(', ')})`
                : ''
            }`,
          'success'
        );
        return;
      }

      if (invalidCategoryCount > 0) {
        const invalidCategoryList =
          Array.from(
            invalidCategoryNames
          )
            .slice(0, 5)
            .join(', ');

        triggerToast(
          `등록된 자산 카테고리와 일치하는 행이 없어 업로드하지 않았습니다. 불일치 카테고리: ${invalidCategoryList}`,
          'error'
        );
        return;
      }

      if (duplicateAssetNoCount > 0) {
        const duplicateAssetNoList =
          Array.from(
            duplicateAssetNumbers
          )
            .slice(0, 5)
            .join(', ');

        triggerToast(
          `기존 자산 또는 업로드 파일 내부에 동일한 자산관리번호가 있어 업로드하지 않았습니다. 중복 번호: ${duplicateAssetNoList}`,
          'error'
        );
        return;
      }

      triggerToast(
        '업로드할 수 있는 유효한 자산이 없습니다.',
        'error'
      );
    } catch (error) {
      console.error(
        'Bulk asset upload transaction error:',
        error
      );

      triggerToast(
        acceptedAssets.length > 0
          ? `엑셀/CSV 등록 중 일부 작업이 중단되었습니다. 현재까지 ${acceptedAssets.length}건은 저장되었으며 나머지는 등록되지 않았습니다.`
          : '엑셀/CSV 자산 등록에 실패했습니다. 기존 자산 목록은 변경되지 않았습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
        'error'
      );
    }
  };

  // 자산 영구 삭제 제어 로직
  const deleteLaptop = (id, assetNo) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산을 삭제할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentBlockingRequest =
      findSameAssetBlockingRequest(
        data.requests,
        id
      );

    if (currentBlockingRequest) {
      const currentBlockingStatus =
        getDisplayRentalStatus(
          currentBlockingRequest.status,
          currentBlockingRequest.startDate
        );

      triggerToast(
        `자산 ${assetNo}에는 현재 [${currentBlockingStatus}] 상태의 신청이 있어 삭제할 수 없습니다. 해당 신청을 불허 또는 반납완료 처리한 후 다시 삭제해 주세요.`,
        'error'
      );
      return;
    }

    triggerConfirm(
      '자산 삭제',
      `정말로 자산 [${assetNo}] 기기를 시스템 목록에서 영구적으로 삭제하시겠습니까? 완료된 신청 원장은 보존되나 기기 목록에서는 삭제됩니다.`,
      async () => {
        let deletedAsset = null;

        try {
          await runTransaction(
            db,
            async (transaction) => {
              const assetDocRef = doc(
                RENTAL_ASSETS_COLLECTION_REF,
                id
              );

              const assetSnapshot =
                await transaction.get(
                  assetDocRef
                );

              if (!assetSnapshot.exists()) {
                throw new Error(
                  'laptop-not-found'
                );
              }

              const latestAsset = {
                ...assetSnapshot.data(),
                id: assetSnapshot.id,
              };

              const latestReservations =
                normalizeAssetReservations(
                  latestAsset.reservations ||
                  []
                );

              const latestBlockingRequest =
                findSameAssetBlockingRequest(
                  latestReservations,
                  id
                );

              if (
                latestBlockingRequest
              ) {
                const conflictError =
                  new Error(
                    'active-rental-exists'
                  );

                conflictError.blockingRequest =
                  latestBlockingRequest;

                throw conflictError;
              }

              const registryDocRef = doc(
                RENTAL_ASSET_NUMBERS_COLLECTION_REF,
                getAssetNumberRegistryId(
                  latestAsset.assetNo
                )
              );

              await transaction.get(
                registryDocRef
              );

              transaction.delete(
                assetDocRef
              );

              transaction.delete(
                registryDocRef
              );

              deletedAsset =
                latestAsset;
            }
          );

          if (!deletedAsset) {
            throw new Error(
              'laptop-delete-transaction-result-missing'
            );
          }

          setData((prev) => ({
            ...prev,
            laptops:
              (prev.laptops || []).filter(
                (asset) =>
                  asset.id !== id
              ),
          }));

          if (
            selectedLaptopId === id
          ) {
            setSelectedLaptopId(null);
          }

          if (
            editLaptop?.id === id
          ) {
            setEditLaptop(null);
          }

          triggerToast(
            `자산 ${assetNo}이(가) 성공적으로 삭제되었습니다.`,
            'success'
          );
        } catch (error) {
          console.error(
            'Laptop delete transaction error:',
            error
          );

          if (
            error?.message ===
            'active-rental-exists'
          ) {
            const blockingRequest =
              error.blockingRequest;

            const blockingStatus =
              getDisplayRentalStatus(
                blockingRequest?.status,
                blockingRequest?.startDate
              );

            triggerToast(
              `삭제 확인 중 자산 ${assetNo}에 새로운 [${blockingStatus}] 신청이 확인되어 삭제를 중단했습니다. 해당 신청을 먼저 처리해 주세요.`,
              'error'
            );
            return;
          }

          if (
            error?.message ===
            'laptop-not-found'
          ) {
            triggerToast(
              `자산 ${assetNo}은(는) 이미 삭제되었거나 최신 자산 목록에서 찾을 수 없습니다.`,
              'error'
            );
            return;
          }

          triggerToast(
            `자산 ${assetNo} 삭제에 실패했습니다. 자산 목록과 Firestore 권한 및 네트워크 상태를 확인해 주세요.`,
            'error'
          );
        }
      }
    );
  };

  const saveLaptop = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산 정보를 저장할 수 없습니다.',
        'error'
      );
      return;
    }

    if (!editLaptop?.id) {
      triggerToast(
        '수정할 자산 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const editingLaptopId =
      editLaptop.id;

    const editedAssetNo = String(
      editLaptop.assetNo || ''
    ).trim();

    const editedCategory = String(
      editLaptop.category || ''
    ).trim();

    if (!editedAssetNo) {
      triggerToast(
        '자산 관리 번호를 정확히 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!editedCategory) {
      triggerToast(
        '자산 카테고리를 선택해 주세요.',
        'error'
      );
      return;
    }

    const editedLaptopDraft = {
      ...editLaptop,
      assetNo: editedAssetNo,
      assetNoNormalized:
        normalizeAssetNumber(
          editedAssetNo
        ),
      category: editedCategory,
    };

    let committedAsset = null;

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const assetDocRef = doc(
            RENTAL_ASSETS_COLLECTION_REF,
            editingLaptopId
          );

          const [
            assetSnapshot,
            configSnapshot,
          ] = await Promise.all([
            transaction.get(
              assetDocRef
            ),
            transaction.get(
              PUBLIC_CONFIG_DOC_REF
            ),
          ]);

          if (!assetSnapshot.exists()) {
            throw new Error(
              'laptop-not-found'
            );
          }

          if (!configSnapshot.exists()) {
            throw new Error(
              'public-config-not-found'
            );
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const categoryExists =
            (
              configSnapshot.data()
                .assetCategories || []
            ).some(
              (category) =>
                String(
                  category || ''
                ).trim() ===
                editedCategory
            );

          if (!categoryExists) {
            throw new Error(
              'asset-category-not-found'
            );
          }

          const oldRegistryId =
            getAssetNumberRegistryId(
              latestAsset.assetNo
            );

          const newRegistryId =
            getAssetNumberRegistryId(
              editedAssetNo
            );

          const oldRegistryDocRef = doc(
            RENTAL_ASSET_NUMBERS_COLLECTION_REF,
            oldRegistryId
          );

          const newRegistryDocRef = doc(
            RENTAL_ASSET_NUMBERS_COLLECTION_REF,
            newRegistryId
          );

          const registrySnapshots =
            oldRegistryId ===
            newRegistryId
              ? [
                  await transaction.get(
                    oldRegistryDocRef
                  ),
                ]
              : await Promise.all([
                  transaction.get(
                    oldRegistryDocRef
                  ),
                  transaction.get(
                    newRegistryDocRef
                  ),
                ]);

          const newRegistrySnapshot =
            oldRegistryId ===
            newRegistryId
              ? registrySnapshots[0]
              : registrySnapshots[1];

          if (
            newRegistrySnapshot.exists() &&
            newRegistrySnapshot.data()
              .assetId !==
              editingLaptopId
          ) {
            const duplicateError =
              new Error(
                'duplicate-asset-number'
              );

            duplicateError.duplicatedLaptop =
              newRegistrySnapshot.data();

            throw duplicateError;
          }

          const reservations =
            normalizeAssetReservations(
              latestAsset.reservations ||
              []
            );

          const blockingRequest =
            findSameAssetBlockingRequest(
              reservations,
              editingLaptopId
            );

          const assetIdentityChanged =
            String(
              latestAsset.assetNo || ''
            ).trim() !==
              editedAssetNo ||
            String(
              latestAsset.category || ''
            ).trim() !==
              editedCategory;

          if (
            blockingRequest &&
            assetIdentityChanged
          ) {
            const identityChangeError =
              new Error(
                'active-rental-identity-change'
              );

            identityChangeError.blockingRequest =
              blockingRequest;

            throw identityChangeError;
          }

          const representativeRequest =
            getLaptopRepresentativeRequest(
              reservations,
              editingLaptopId
            );

          const nextStatus =
            editedLaptopDraft.status ===
            STATUS.UNAVAILABLE
              ? STATUS.UNAVAILABLE
              : representativeRequest
                ? representativeRequest.status
                : STATUS.AVAILABLE;

          const nextAsset = {
            ...latestAsset,
            ...editedLaptopDraft,
            id: latestAsset.id,
            category: editedCategory,
            assetNo: editedAssetNo,
            assetNoNormalized:
              normalizeAssetNumber(
                editedAssetNo
              ),
            reservations,
            status: nextStatus,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          transaction.set(
            assetDocRef,
            {
              ...nextAsset,
              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          if (
            oldRegistryId !==
            newRegistryId
          ) {
            transaction.delete(
              oldRegistryDocRef
            );
          }

          transaction.set(
            newRegistryDocRef,
            {
              id: newRegistryId,
              assetId:
                editingLaptopId,
              assetNo:
                editedAssetNo,
              assetNoNormalized:
                normalizeAssetNumber(
                  editedAssetNo
                ),
              updatedAt:
                serverTimestamp(),
            }
          );

          committedAsset =
            nextAsset;
        }
      );

      if (!committedAsset) {
        throw new Error(
          'laptop-save-transaction-result-missing'
        );
      }

      setData((prev) => ({
        ...prev,
        laptops:
          (prev.laptops || []).map(
            (asset) =>
              asset.id ===
              editingLaptopId
                ? committedAsset
                : asset
          ),
      }));

      setEditLaptop(null);

      triggerToast(
        '자산 상세 정보가 성공적으로 반영되었습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'Laptop save transaction error:',
        error
      );

      if (
        error?.message ===
        'duplicate-asset-number'
      ) {
        const duplicatedAssetNo =
          error.duplicatedLaptop?.assetNo ||
          editedAssetNo;

        triggerToast(
          `자산관리번호 [${duplicatedAssetNo}]은(는) 이미 다른 자산에 등록되어 있어 저장할 수 없습니다.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'active-rental-identity-change'
      ) {
        const blockingRequest =
          error.blockingRequest;

        const blockingStatus =
          getDisplayRentalStatus(
            blockingRequest?.status,
            blockingRequest?.startDate
          );

        triggerToast(
          `현재 [${blockingStatus}] 상태의 신청이 있어 자산 카테고리 또는 자산관리번호를 변경할 수 없습니다. 신청을 불허 또는 반납완료 처리한 후 다시 변경해 주세요.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-category-not-found'
      ) {
        triggerToast(
          '선택한 자산 카테고리가 최신 카테고리 목록에 없습니다. 자산 수정 패널을 닫고 다시 열어 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'laptop-not-found'
      ) {
        triggerToast(
          '수정하려는 자산이 이미 삭제되었거나 최신 자산 목록에서 찾을 수 없습니다.',
          'error'
        );
        setEditLaptop(null);
        return;
      }

      triggerToast(
        '자산 정보 저장에 실패했습니다. 기존 자산 정보는 변경되지 않았습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
        'error'
      );
    }
  };

  const showFirebaseLoadingOverlay = !firebaseReady;

  if (firebaseLoadErrorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 font-sans text-slate-900">
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertCircle size={22} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                Firebase 데이터를 불러오지 못했습니다.
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                원격 DB 보호를 위해 화면 데이터 저장을 차단했습니다.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs leading-relaxed text-rose-700">
            {firebaseLoadErrorMessage}
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              다시 불러오기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans antialiased transition duration-200 ${
        showFirebaseLoadingOverlay ? 'pointer-events-none select-none blur-sm' : ''
      }`}>
      {/* --- 상단 글로벌 네비게이션 --- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={goToUserHome}
            className="flex min-w-0 shrink-0 items-center gap-3.5 text-left sm:gap-4"
          >
            <div className="shrink-0 rounded-2xl mk-brand-gradient-tr p-2.5 text-white mk-brand-shadow-md sm:p-3">
              <Laptop size={26} />
            </div>
            <div className="min-w-0">
              <h1 className="break-keep text-[16px] font-bold leading-snug tracking-tight text-slate-900 sm:text-lg lg:text-[21px]">
                매일경제아카데미 기기 대여 시스템
              </h1>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500 sm:text-sm">
                https://notebook.recruit.kro.kr
              </p>
            </div>
          </button>

          {view === 'user' && (
            <nav
              ref={communityMenuRef}
              className="relative flex w-full flex-wrap items-center justify-end gap-5 sm:gap-8 lg:w-auto lg:gap-12 xl:gap-14"
            >
              <button
                type="button"
                onClick={() => {
                  pushAppPath('user', 'rental');
                  setView('user');
                  setUserTab('rental');
                  setIsCommunityMenuOpen(false);
                }}
                className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                  userTab === 'rental'
                    ? 'bg-orange-50 font-semibold mk-brand-text'
                    : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                대여신청
              </button>

              <button
                type="button"
                onClick={() => {
                  pushAppPath('user', 'history');
                  setView('user');
                  setUserTab('history');
                  setIsCommunityMenuOpen(false);
                }}
                className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                  userTab === 'history'
                    ? 'bg-orange-50 font-semibold mk-brand-text'
                    : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                신청내역
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCommunityMenuOpen((prev) => !prev)}
                  className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                    ['notice', 'faq'].includes(userTab) || isCommunityMenuOpen
                      ? 'bg-orange-50 font-semibold mk-brand-text'
                      : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  커뮤니티
                </button>

                <AnimatePresence>
                  {isCommunityMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      className="absolute left-1/2 top-full z-40 mt-2 w-36 -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          pushAppPath('user', 'notice');
                          setView('user');
                          setUserTab('notice');
                          setIsCommunityMenuOpen(false);
                        }}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'notice'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        공지사항
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          pushAppPath('user', 'faq');
                          setView('user');
                          setUserTab('faq');
                          setIsCommunityMenuOpen(false);
                        }}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'faq'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        FAQ
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2">
                {firebaseAuthUser || isAdminAuthenticated ? (
                  <>
                    {!currentAuthRoleErrorMessage && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={goToUserMypage}
                        className="px-3 py-2 text-xs"
                      >
                        <UserCircle size={14} />
                        마이페이지
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        isCurrentFirebaseAuthAdmin || isAdminAuthenticated
                          ? logoutAdmin
                          : logoutUser
                      }
                      disabled={
                        userAuthLoading ||
                        adminLogoutInProgress ||
                        !firebaseAuthReady
                      }
                      className="px-3 py-2 text-xs"
                    >
                      <LogOut size={14} />
                      {adminLogoutInProgress ? '로그아웃 중...' : '로그아웃'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToUserSignup}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <UserPlus size={14} />
                      회원가입
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToUserLogin}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <LogIn size={14} />
                      로그인
                    </Button>
                  </>
                )}
              </div>
            </nav>
          )}

          {view === 'admin' && (
            <div className="flex w-fit items-center gap-2">
              {isAdminAuthenticated && (
                <div className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:block">
                  {authenticatedAdminAccount.adminLoginId} 인증됨
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                관리자 모드
              </div>

              {isAdminAuthenticated && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToUserMypage}
                    className="px-3 py-2 text-xs"
                  >
                    마이페이지
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={logoutAdmin}
                    disabled={adminLogoutInProgress || !firebaseAuthReady}
                    className="px-3 py-2 text-xs"
                  >
                    {adminLogoutInProgress ? '로그아웃 중...' : '로그아웃'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* --- 메인 워크스페이스 --- */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        
        {/* --- 실시간 주요 대여 현황 보드 --- */}
        {shouldShowStats && (
          <section className="mb-6 grid grid-cols-3 gap-2 sm:mb-8 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Laptop} label="보유 자산" value={stats.total} />
            <StatCard icon={CheckCircle2} label="대여 가능" value={stats.available} tone="green" />
            <StatCard icon={Clock} label="승인 대기중" value={stats.requested} tone="amber" />
            <StatCard icon={ShieldCheck} label="예약중" value={stats.reserved} tone="sky" />
            <StatCard icon={Laptop} label="대여중" value={stats.approved} tone="blue" />
            <StatCard icon={XCircle} label="반납 지연중" value={stats.overdue} tone="rose" />
          </section>
        )}

        {view === 'user' ? (
          userTab === 'rental' ? (
          /* ==================== [사용자 대여 화면] ==================== */
          <div className="space-y-6">
            <Card className="mk-brand-border-soft shadow-sm shadow-slate-100">
              <CardContent className="p-6">
                <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">1. 대여 기간 선택</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      먼저 대여 기간을 선택하면 아래 기기 목록이 현재 운영 방식에 맞게 표시됩니다.
                    </p>
                  </div>

                  <div className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-semibold mk-brand-text">
                    {isPeriodBasedRentalMode ? '기간 기반 예약 사용 중' : '기기 상태 기준 운영 중'}
                  </div>
                </div>

                {rentalPeriodFields}

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">선택한 대여 기간</div>
                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {formatDateWithKoreanWeekday(form.startDate)} ~ {formatDateWithKoreanWeekday(form.dueDate)}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      대여가능일은 최대 {getSafeMaxRentalDays(data.settings)}일입니다.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500 lg:max-w-[23rem]">
                    {isPeriodBasedRentalMode
                      ? '같은 기기라도 기존 신청 기간과 겹치지 않으면 신청할 수 있습니다.'
                      : '신청중, 대여중, 보류 상태인 기기는 선택 기간과 관계없이 신청할 수 없습니다.'}
                  </div>
                </div>

                {rentalStartAdjustmentInfo.adjusted && (
                  <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs leading-relaxed text-orange-700">
                    {rentalStartAdjustmentInfo.reasons.length > 0
                      ? `${rentalStartAdjustmentInfo.reasons.join(', ')} 기준으로 대여 시작일이 다음 영업일(${formatDateWithKoreanWeekday(rentalStartAdjustmentInfo.adjustedDate)})로 조정되었습니다.`
                      : `대여 시작일이 다음 영업일(${formatDateWithKoreanWeekday(rentalStartAdjustmentInfo.adjustedDate)})로 조정되었습니다.`}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
            
            {/* 좌측 자산 카드 셀렉터 (2컬럼 폭 차지) */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="shrink-0">
                      <h2 className="text-lg font-bold text-slate-900">2. {rentalDeviceSectionTitle}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {rentalDeviceSectionDescription}
                      </p>
                    </div>
                    <div className="grid w-full gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)] lg:w-auto lg:grid-cols-[118px_118px_15rem]">
                      <select
                        aria-label="자산 카테고리 필터"
                        value={selectedAssetCategory}
                        onChange={(e) => {
                          setSelectedAssetCategory(e.target.value);
                          setSelectedLaptopId(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                      >
                        <option value="전체">전체</option>
                        {(data.assetCategories || []).map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>

                      <select
                        aria-label="대여 가능여부 필터"
                        value={availabilityFilter}
                        onChange={(e) => {
                          setAvailabilityFilter(e.target.value);
                          setSelectedLaptopId(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                      >
                        <option value="전체">전체</option>
                        <option value={STATUS.AVAILABLE}>{availableFilterLabel}</option>
                        <option value={STATUS.UNAVAILABLE}>{unavailableFilterLabel}</option>
                      </select>

                      <div className="relative w-full">
                        <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="자산관리번호, 기종, 키워드 검색"
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredLaptops.map((l) => {
                      const laptopAvailability = getLaptopRentalAvailability(
                        l,
                        data.requests,
                        data.settings,
                        form.startDate,
                        form.dueDate
                      );
                      const blocked = laptopAvailability.blocked;
                      const statusLabel = getUserLaptopStatusLabel(laptopAvailability);
                      const isSelected = selectedLaptopId === l.id;
                      return (
                        <motion.button
                          whileHover={!blocked ? { y: -4 } : {}}
                          key={l.id}
                          onClick={() => {
			    if (blocked) return;
			    setSelectedLaptopId(isSelected ? null : l.id);
			  }}
                          className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-4 ring-blue-50 bg-blue-50/10'
                              : 'border-slate-200 bg-white hover:shadow-md'
                          } ${blocked ? 'cursor-not-allowed opacity-60 bg-slate-50/50' : 'cursor-pointer'}`}
                        >
                          <div className="p-1 pt-[10px]">
                            <div className="relative h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                              <img
                                src={l.photo}
                                alt={l.assetNo}
                                className="h-full w-full object-cover transition duration-350 group-hover:scale-105"
                              />
                              {blocked && (
                                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center text-white text-xs font-bold gap-1">
                                  <LockIcon size={14} /> {statusLabel}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2 p-4 pt-3">
                            <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {l.category || '노트북'}
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-bold text-slate-900 tracking-tight">{l.assetNo}</span>
                              <Badge>{statusLabel}</Badge>
                            </div>
                            <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                            <div className="space-y-0.5 text-[11px] text-slate-500">
                              <div>S/N: {l.serialNo}</div>
                              <div>출고일: {l.manufactureDate}</div>
                            </div>
                            <div className="mt-1 rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 border border-slate-200/50">
                              💡 {l.note || '특이사항 없음'}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 우측 대여 신청 패널 (1컬럼 폭 차지)
                sticky & top-24 속성을 명시하여 스크롤할 때 우측 가이드 폼이 화면에 우아하게 안착 고정됩니다. */}
            <div className="lg:col-span-1 lg:sticky lg:top-24 h-fit">
              <Card className="mk-brand-border-soft shadow-md shadow-slate-100">
                <div
                  className="px-6 py-4 text-white"
                  style={{ background: 'linear-gradient(90deg, var(--mk-orange-dark), var(--mk-orange))' }}
                >
                  <h2 className="text-lg font-bold text-white">3. 신청 정보 입력</h2>
                  <p className="mt-0.5 text-xs text-orange-100">
                    선택한 기기와 신청자 정보를 확인한 뒤 신청을 접수해 주세요.
                  </p>
                </div>
                <CardContent className="space-y-4 p-6">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                      대여 기기
                    </div>

                    <div className={`rounded-xl px-4 py-3 border text-xs transition-colors duration-150 ${
                      selectedLaptop 
                        ? 'bg-blue-50 border-blue-200 text-blue-800' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      {selectedLaptop ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {selectedLaptop.category || '노트북'}
                            </span>
                            <b className="text-sm ml-1">{selectedLaptop.assetNo}</b>
                          </div>
                          <button onClick={() => setSelectedLaptopId(null)} className="shrink-0 text-blue-500 hover:text-blue-800 font-bold">
                            변경
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Info size={14} className="text-slate-400" />
                          <span>대여 기간을 확인한 뒤, 기기 선택 섹션에서 대여할 기기를 선택해 주세요.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {data.settings.teamInputMode === 'dropdown' ? (
                    <Select
                      label="부서 / 팀 선택"
                      value={form.team}
                      onChange={(v) => setForm({ ...form, team: v, borrower: '' })}
                    >
                      <option value="">팀 선택</option>
                      {data.teams.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="부서 / 팀 직접 입력"
                      value={form.team}
                      onChange={(v) => setForm({ ...form, team: v })}
                      placeholder="부서(팀)명을 입력하세요"
                    />
                  )}

                  {data.settings.borrowerInputMode === 'dropdown' ? (
                    <Select
                      label="대여자명"
                      value={form.borrower}
                      onChange={(v) => setForm({ ...form, borrower: v })}
                    >
                      <option value="">{form.team ? '대여자 선택' : '소속 부서를 먼저 선택해 주세요'}</option>
                      {filteredBorrowers.map((b, index) => (
                        <option key={`${b.team}-${b.name}-${index}`} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="신청 대여자 직접 입력"
                      value={form.borrower}
                      onChange={(v) => setForm({ ...form, borrower: v })}
                      placeholder="성명을 입력하세요"
                    />
                  )}

                  {/* 선택한 대여 기간 요약 표시 */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                      대여 기간
                    </div>
                    <div className="text-sm font-bold leading-relaxed text-slate-900">
                      {formatDateWithKoreanWeekday(form.startDate)}
                      <span className="mx-1 text-slate-400">~</span>
                      {formatDateWithKoreanWeekday(form.dueDate)}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      대여 기간은 상단의 1. 대여 기간 선택 영역에서 변경할 수 있습니다.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">대여 목적</span>
                    <textarea
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      className="h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                      placeholder="출장용, 회의용, 교육 연수 등"
                    />
                  </label>

                  <Button
                    onClick={submitRequest}
                    disabled={
                      requestSubmitLoading ||
                      !selectedLaptop ||
                      selectedLaptopAvailability?.blocked
                    }
                    className="w-full justify-center rounded-xl py-6"
                  >
                    {requestSubmitLoading
                      ? '대여 신청 저장 중...'
                      : '기기 대여 신청'}
                  </Button>
                </CardContent>
              </Card>
            </div>
            </div>
            </div>
          ) : userTab === 'mypage' ? (
            <div className="mx-auto max-w-3xl space-y-6">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                  <div className="relative">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                      <Users size={26} />
                    </div>

                    <h2 className="text-xl font-black tracking-tight">마이페이지</h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      로그인한 본인의 기본 정보를 수정합니다.
                    </p>
                  </div>
                </div>

                <CardContent className="p-6">
                  {!firebaseAuthUser && !isAdminAuthenticated ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
                        마이페이지는 로그인 후 사용할 수 있습니다.
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={goToUserSignup}>
                          회원가입
                        </Button>
                        <Button type="button" variant="primary" onClick={goToUserLogin}>
                          로그인
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {currentAuthRoleReady &&
                        currentAuthAdminAccount &&
                        !isAdminAuthenticated && (
                          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                            <h3 className="text-sm font-bold text-orange-900">
                              관리자 재인증이 필요합니다
                            </h3>

                            <p className="mt-2 text-xs leading-5 text-orange-800">
                              현재 계정은 관리자 계정입니다. 관리자 모드에서 다시 인증한 뒤
                              관리자 마이페이지를 이용해 주세요.
                            </p>

                            <div className="mt-4 flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={logoutAdmin}
                              >
                                로그아웃
                              </Button>

                              <Button
                                type="button"
                                variant="primary"
                                onClick={() => {
                                  pushAppPath('admin');
                                  setView('admin');
                                }}
                              >
                                관리자 모드로 이동
                              </Button>
                            </div>
                          </div>
                        )}

                      {isAdminAuthenticated && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                          <div className="mb-4">
                            <h3 className="text-base font-bold text-slate-900">관리자 내 정보</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              관리자 본인의 표시 정보와 연락처를 수정합니다.
                            </p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <Input
                              label="관리자 ID"
                              value={adminMyProfileForm.adminLoginId}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  adminLoginId: v,
                                })
                              }
                              placeholder="관리자 ID 입력"
                            />

                            <Input
                              label="로그인 이메일"
                              type="email"
                              value={adminMyProfileForm.email}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  email: v,
                                })
                              }
                              disabled
                              placeholder="Firebase Auth 로그인 이메일"
                            />

                            <Input
                              label="조직명"
                              value={adminMyProfileForm.organizationName}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  organizationName: v,
                                })
                              }
                              placeholder="조직명 입력"
                            />

                            <Input
                              label="사용자명"
                              value={adminMyProfileForm.userName}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  userName: v,
                                })
                              }
                              placeholder="사용자명 입력"
                            />

                            <Input
                              label="전화번호"
                              value={adminMyProfileForm.phone}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  phone: v,
                                })
                              }
                              placeholder="전화번호 입력"
                            />

                            <Input
                              label="새 비밀번호"
                              type="password"
                              value={adminMyProfileForm.newPassword || ''}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  newPassword: v,
                                })
                              }
                              placeholder="변경할 때만 입력"
                            />

                            <Input
                              label="새 비밀번호 확인"
                              type="password"
                              value={adminMyProfileForm.newPasswordConfirm || ''}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  newPasswordConfirm: v,
                                })
                              }
                              placeholder="새 비밀번호 재입력"
                            />
                          </div>

                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500">
                            Firebase Auth 로그인 이메일은 이 화면에서 변경하지 않습니다.
                            비밀번호는 새 비밀번호를 입력한 경우에만 변경됩니다.
                            Firebase Auth 계정은 보안상 최근 로그인 상태가 필요할 수 있습니다.
                          </div>

                          <div className="mt-5 flex justify-end">
                            <Button
                              type="button"
                              variant="primary"
                              onClick={saveMyAdminProfile}
                              disabled={adminMyProfileSaving}
                            >
                              {adminMyProfileSaving ? '저장 중...' : '관리자 내 정보 저장'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {isCurrentFirebaseAuthGeneralUser && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                          <div className="mb-4">
                            <h3 className="text-base font-bold text-slate-900">일반 회원 내 정보</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              대여 신청에 사용할 본인 정보를 수정합니다.
                            </p>
                          </div>

                          {!userProfileReady ? (
                            <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">
                              회원 정보를 불러오는 중입니다.
                            </div>
                          ) : (
                            <>
                              <div className="grid gap-4 md:grid-cols-2">
                                <Input
                                  label="이메일"
                                  type="email"
                                  value={firebaseAuthUser.email || userProfile?.email || ''}
                                  onChange={() => {}}
                                  disabled
                                  placeholder="로그인 이메일"
                                />

                                <Input
                                  label="이름"
                                  value={userProfileForm.name}
                                  onChange={(v) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      name: v,
                                    })
                                  }
                                  placeholder="이름 입력"
                                />

                                <Input
                                  label="부서 / 팀"
                                  value={userProfileForm.team}
                                  onChange={(v) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      team: v,
                                    })
                                  }
                                  placeholder="소속 부서 또는 팀명 입력"
                                />

                                <Input
                                  label="연락처"
                                  value={userProfileForm.phone}
                                  onChange={(v) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      phone: v,
                                    })
                                  }
                                  placeholder="연락처 입력"
                                />

                                <Input
                                  label="새 비밀번호"
                                  type="password"
                                  value={userProfileForm.newPassword || ''}
                                  onChange={(v) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      newPassword: v,
                                    })
                                  }
                                  placeholder="변경할 때만 입력"
                                />

                                <Input
                                  label="새 비밀번호 확인"
                                  type="password"
                                  value={userProfileForm.newPasswordConfirm || ''}
                                  onChange={(v) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      newPasswordConfirm: v,
                                    })
                                  }
                                  placeholder="새 비밀번호 재입력"
                                />
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500">
                                비밀번호는 새 비밀번호를 입력한 경우에만 변경됩니다.
                                Firebase Auth 계정은 보안상 최근 로그인 상태가 필요할 수 있습니다.
                              </div>

                              <div className="mt-5 flex justify-end">
                                <Button
                                  type="button"
                                  variant="primary"
                                  onClick={saveMyUserProfile}
                                  disabled={userProfileSaving}
                                >
                                  {userProfileSaving ? '저장 중...' : '일반 회원 내 정보 저장'}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : ['login', 'signup'].includes(userTab) ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                <div className="relative">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <Users size={26} />
                  </div>

                  <h2 className="text-xl font-black tracking-tight">
                    {userTab === 'signup' ? '일반 사용자 회원가입' : '일반 사용자 로그인'}
                  </h2>

                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {userTab === 'signup'
                      ? '대여 신청을 위한 일반 사용자 계정을 생성합니다.'
                      : '가입한 이메일과 비밀번호로 로그인합니다.'}
                  </p>
                </div>
              </div>

              <CardContent className="p-6">
                {firebaseAuthUser ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800">
                      현재 <span className="font-bold">{firebaseAuthUser.email}</span> 계정으로 로그인되어 있습니다.
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={logoutUser}
                        disabled={userAuthLoading}
                      >
                        로그아웃
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          pushAppPath('user', 'rental');
                          setView('user');
                          setUserTab('rental');
                          setIsCommunityMenuOpen(false);
                        }}
                      >
                        대여신청으로 이동
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={submitUserAuthForm}>
                    <Input
                      label="이메일"
                      value={userAuthForm.email}
                      onChange={(v) => setUserAuthForm({ ...userAuthForm, email: v })}
                      placeholder="example@company.com"
                      type="email"
                      autoComplete="email"
                    />

                    {userTab === 'signup' && (
                      <>
                        <Input
                          label="이름"
                          value={userAuthForm.name}
                          onChange={(v) => setUserAuthForm({ ...userAuthForm, name: v })}
                          placeholder="성명을 입력하세요"
                          autoComplete="name"
                        />

                        <Input
                          label="부서 / 팀"
                          value={userAuthForm.team}
                          onChange={(v) => setUserAuthForm({ ...userAuthForm, team: v })}
                          placeholder="소속 부서 또는 팀명을 입력하세요"
                        />

                        <Input
                          label="연락처"
                          value={userAuthForm.phone}
                          onChange={(v) => setUserAuthForm({ ...userAuthForm, phone: v })}
                          placeholder="연락처를 입력하세요"
                          autoComplete="tel"
                        />
                      </>
                    )}

                    <Input
                      label="비밀번호"
                      value={userAuthForm.password}
                      onChange={(v) => setUserAuthForm({ ...userAuthForm, password: v })}
                      placeholder="6자 이상 입력"
                      type="password"
                      autoComplete={userTab === 'signup' ? 'new-password' : 'current-password'}
                    />

                    {userTab === 'signup' && (
                      <Input
                        label="비밀번호 확인"
                        value={userAuthForm.passwordConfirm}
                        onChange={(v) => setUserAuthForm({ ...userAuthForm, passwordConfirm: v })}
                        placeholder="비밀번호를 한 번 더 입력"
                        type="password"
                        autoComplete="new-password"
                      />
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
                      일반 사용자 계정은 Firebase Authentication 이메일/비밀번호 방식으로 생성됩니다.
                      기존 관리자 모드 로그인 방식은 이번 단계에서 변경하지 않습니다.
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="w-full justify-center py-3"
                    >
                      {userAuthLoading
                        ? '처리 중...'
                        : userTab === 'signup'
                          ? '회원가입'
                          : '로그인'}
                    </Button>

                    <div className="flex justify-center border-t border-slate-100 pt-4 text-xs text-slate-500">
                      {userTab === 'signup' ? (
                        <button
                          type="button"
                          onClick={goToUserLogin}
                          className="font-bold mk-brand-text hover:underline"
                        >
                          이미 계정이 있으면 로그인하기
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={goToUserSignup}
                          className="font-bold mk-brand-text hover:underline"
                        >
                          계정이 없으면 회원가입하기
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : userTab === 'history' ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                  <div className="relative">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                      <ClipboardList size={26} />
                    </div>

                    <h2 className="text-xl font-black tracking-tight">
                      나의 대여 신청내역
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      로그인한 계정으로 제출한 기기 대여신청과 처리 상태를 확인합니다.
                    </p>
                  </div>
                </div>

                <CardContent className="p-6">
                  {!firebaseAuthReady ||
                  !currentAuthRoleReady ||
                  !rentalRequestsReady ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                      로그인 계정과 신청내역을 확인하는 중입니다.
                    </div>
                  ) : rentalRequestsLoadErrorMessage ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                      {rentalRequestsLoadErrorMessage}
                    </div>
                  ) : !firebaseAuthUser ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
                        신청내역은 일반회원 로그인 후 확인할 수 있습니다.
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={goToUserLogin}
                        >
                          로그인
                        </Button>
                      </div>
                    </div>
                  ) : currentAuthAdminAccount || isAdminAuthenticated ? (
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
                      관리자 계정의 전체 대여신청은 관리자 모드의 대여 신청 관리에서 확인해 주세요.
                    </div>
                  ) : currentUserRequests.length === 0 ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                        <ClipboardList
                          size={28}
                          className="mx-auto mb-3 text-slate-300"
                        />

                        <h3 className="text-sm font-bold text-slate-700">
                          등록된 신청내역이 없습니다
                        </h3>

                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          로그인한 계정으로 기기 대여신청을 제출하면 이 화면에서 처리 상태를 확인할 수 있습니다.
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => {
                            pushAppPath('user', 'rental');
                            setView('user');
                            setUserTab('rental');
                            setIsCommunityMenuOpen(false);
                          }}
                        >
                          대여신청으로 이동
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentUserRequests.map((request) => (
                        <div
                          key={request.id}
                          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {request.assetCategory || '기기'}
                                </span>

                                <span className="text-sm font-bold text-slate-950">
                                  {request.assetNo}
                                </span>

                                <Badge>
                                  {getDisplayRentalStatus(
                                    request.status,
                                    request.startDate
                                  )}
                                </Badge>
                              </div>

                              <div className="text-xs text-slate-600">
                                대여 기간:{' '}
                                <span className="font-semibold text-slate-900">
                                  {request.startDate} ~ {request.dueDate}
                                </span>
                              </div>

                              <div className="text-xs text-slate-600">
                                소속:{' '}
                                <span className="font-semibold text-slate-900">
                                  {request.team}
                                </span>
                                {' · '}
                                대여자명:{' '}
                                <span className="font-semibold text-slate-900">
                                  {request.borrower}
                                </span>
                              </div>

                              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                목적:{' '}
                                <span className="font-medium text-slate-700">
                                  {request.purpose || '서술 목적 없음'}
                                </span>
                              </div>

                              {request.adminMemo && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                                  관리자 안내: {request.adminMemo}
                                </div>
                              )}

                              {request.userActionRequest && (
                                <div
                                  className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
                                    request.userActionRequest.status ===
                                    USER_REQUEST_REVIEW_STATUS.PENDING
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : request.userActionRequest.status ===
                                          USER_REQUEST_REVIEW_STATUS.APPROVED
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : 'border-rose-200 bg-rose-50 text-rose-800'
                                  }`}
                                >
                                  <div className="font-bold">
                                    {getUserRequestActionLabel(
                                      request.userActionRequest.type
                                    )}{' '}
                                    ·{' '}
                                    {getUserRequestReviewStatusLabel(
                                      request.userActionRequest.status
                                    )}
                                  </div>

                                  <div className="mt-1">
                                    요청 사유:{' '}
                                    {request.userActionRequest.reason || '-'}
                                  </div>

                                  {request.userActionRequest.type ===
                                    USER_REQUEST_ACTION.CHANGE && (
                                    <div className="mt-1">
                                      변경 요청:{' '}
                                      {request.userActionRequest.team || '-'} ·{' '}
                                      {request.userActionRequest.borrower || '-'} ·{' '}
                                      {request.userActionRequest.startDate || '-'} ~{' '}
                                      {request.userActionRequest.dueDate || '-'}
                                    </div>
                                  )}

                                  {request.userActionRequest.type ===
                                    USER_REQUEST_ACTION.EXTEND && (
                                    <div className="mt-1">
                                      연장 요청일:{' '}
                                      {request.userActionRequest.dueDate || '-'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                              <div className="text-[10px] text-slate-400">
                                접수 일시: {request.requestedAt}
                              </div>

                              {request.userActionRequest?.status ===
                              USER_REQUEST_REVIEW_STATUS.PENDING ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                  사용자 요청 검토 대기중
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  {[STATUS.REQUESTED, STATUS.ON_HOLD].includes(
                                    request.status
                                  ) && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.CHANGE
                                          )
                                        }
                                        className="px-3 py-2 text-xs"
                                      >
                                        신청 변경 요청
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="dangerOutline"
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.CANCEL
                                          )
                                        }
                                        className="px-3 py-2 text-xs"
                                      >
                                        신청 취소 요청
                                      </Button>
                                    </>
                                  )}

                                  {request.status ===
                                    STATUS.APPROVED && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.EXTEND
                                          )
                                        }
                                        className="px-3 py-2 text-xs"
                                      >
                                        대여 연장 요청
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                <div className="relative mx-auto max-w-3xl text-center">
                  <h2 className="text-2xl font-black tracking-tight">
                    {userTab === 'home' && '초기화면 준비중입니다'}
                    {userTab === 'history' && '신청내역 화면 준비중입니다'}
                    {userTab === 'notice' && '공지사항'}
                    {userTab === 'faq' && '자주 묻는 질문'}
                    {userTab === 'notFound' && '404 - 페이지를 찾을 수 없습니다'}
                  </h2>

                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    {userTab === 'home' && '상단의 서비스 제목과 아이콘을 클릭하면 언제든 이 초기화면으로 돌아옵니다.'}
                    {userTab === 'history' && '사용자의 대여 신청 현황과 처리 상태를 확인할 수 있는 화면을 준비하고 있습니다.'}
                    {userTab === 'notice' && '운영 공지, 대여 정책, 점검 안내를 확인할 수 있습니다.'}
                    {userTab === 'faq' && '질문 유형별 FAQ를 선택하고 제목을 눌러 답변을 확인할 수 있습니다.'}
                    {userTab === 'notFound' && '입력하신 주소와 일치하는 메뉴를 찾을 수 없습니다.'}
                  </p>
                </div>
              </div>

              <CardContent className="p-6">
                {userTab === 'notFound' ? (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 px-6 py-12 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm">
                      <AlertCircle size={26} />
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">
                      요청하신 페이지가 없습니다
                    </h3>

                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                      주소가 잘못 입력되었거나, 아직 제공되지 않는 메뉴입니다.
                      아래 버튼을 통해 기기 대여 시스템의 주요 화면으로 이동할 수 있습니다.
                    </p>

                    <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                      <Button
                        type="button"
                        onClick={goToUserHome}
                        variant="primary"
                        className="w-full sm:w-auto"
                      >
                        초기화면으로 이동
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          pushAppPath('user', 'rental');
                          setView('user');
                          setUserTab('rental');
                          setIsCommunityMenuOpen(false);
                        }}
                        className="w-full sm:w-auto"
                      >
                        대여신청으로 이동
                      </Button>
                    </div>
                  </div>
                ) : userTab === 'notice' ? (
                  selectedNoticePost ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            공지사항
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            선택한 공지사항의 상세 내용을 확인합니다.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={closeNoticePost}
                        >
                          목록으로
                        </Button>
                      </div>

                      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedNoticePost.isPinned && (
                              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                                상단 고정
                              </span>
                            )}

                            <h3 className="break-words text-base font-bold text-slate-900">
                              {selectedNoticePost.title}
                            </h3>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                            <span>
                              등록자: {selectedNoticePost.authorName || '관리자'}
                            </span>
                            <span>
                              등록일: {formatFirestoreDate(
                                selectedNoticePost.createdAt
                              )}
                            </span>
                            <span>
                              조회수: {Number(
                                selectedNoticePost.viewCount
                              ) || 0}
                            </span>
                          </div>
                        </div>

                        <div className="min-h-[260px] whitespace-pre-wrap break-words px-5 py-6 text-sm leading-7 text-slate-700">
                          {selectedNoticePost.content}
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="border-b border-slate-100 pb-4">
                        <h3 className="text-base font-bold text-slate-900">
                          공지사항
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          제목을 클릭하면 공지사항 상세 내용을 확인할 수 있습니다.
                        </p>
                      </div>

                      {!noticePostsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          공지사항을 불러오는 중입니다.
                        </div>
                      ) : noticePostsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {noticePostsLoadErrorMessage}
                        </div>
                      ) : noticePosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          등록된 공지사항이 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="min-w-[720px] w-full border-collapse text-left">
                              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <tr>
                                  <th className="w-20 border-b border-slate-200 px-4 py-3 text-center">
                                    번호
                                  </th>
                                  <th className="border-b border-slate-200 px-4 py-3">
                                    제목
                                  </th>
                                  <th className="w-32 border-b border-slate-200 px-4 py-3 text-center">
                                    등록자
                                  </th>
                                  <th className="w-32 border-b border-slate-200 px-4 py-3 text-center">
                                    등록일
                                  </th>
                                  <th className="w-24 border-b border-slate-200 px-4 py-3 text-center">
                                    조회수
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {[
                                  ...pinnedNoticePosts.map(
                                    (post) => ({
                                      post,
                                      number: '공지',
                                    })
                                  ),
                                  ...paginatedNoticePosts.map(
                                    (post, index) => ({
                                      post,
                                      number:
                                        regularNoticePosts.length -
                                        (
                                          (safeNoticePage - 1) *
                                          noticePostsPerPage
                                        ) -
                                        index,
                                    })
                                  ),
                                ].map((item) => (
                                  <tr
                                    key={item.post.id}
                                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                                  >
                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {item.number}
                                    </td>

                                    <td className="px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openNoticePost(
                                            item.post
                                          )
                                        }
                                        className="break-words text-left text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline"
                                      >
                                        {item.post.isPinned && (
                                          <span className="mr-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                            고정
                                          </span>
                                        )}
                                        {item.post.title}
                                      </button>
                                    </td>

                                    <td className="px-4 py-3 text-center text-xs text-slate-600">
                                      {item.post.authorName || '관리자'}
                                    </td>

                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {formatFirestoreDate(
                                        item.post.createdAt
                                      )}
                                    </td>

                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {Number(
                                        item.post.viewCount
                                      ) || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {regularNoticePosts.length > 0 && (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={safeNoticePage <= 1}
                                onClick={() =>
                                  setNoticePage((prev) =>
                                    Math.max(1, prev - 1)
                                  )
                                }
                              >
                                이전
                              </Button>

                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeNoticePage} / {noticeTotalPages}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeNoticePage >=
                                  noticeTotalPages
                                }
                                onClick={() =>
                                  setNoticePage((prev) =>
                                    Math.min(
                                      noticeTotalPages,
                                      prev + 1
                                    )
                                  )
                                }
                              >
                                다음
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                ) : userTab === 'faq' ? (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-base font-bold text-slate-900">
                        자주 묻는 질문
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        카테고리를 선택한 뒤 제목을 클릭하면 같은 화면에서 답변이 열립니다.
                      </p>
                    </div>

                    {!faqCategoriesReady ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
                        FAQ 카테고리를 불러오는 중입니다.
                      </div>
                    ) : faqCategoriesLoadErrorMessage ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                        {faqCategoriesLoadErrorMessage}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            id: 'all',
                            name: '전체',
                          },
                          ...faqCategories,
                        ].map((category) => {
                          const isActive =
                            activeFaqCategoryId ===
                            category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => {
                                setActiveFaqCategoryId(
                                  category.id
                                );
                                setExpandedFaqPostId('');
                                setFaqPage(1);
                              }}
                              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                                isActive
                                  ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                              }`}
                            >
                              {category.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!faqPostsReady ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                        FAQ를 불러오는 중입니다.
                      </div>
                    ) : faqPostsLoadErrorMessage ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                        {faqPostsLoadErrorMessage}
                      </div>
                    ) : categoryFilteredFaqPosts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                        선택한 카테고리에 등록된 FAQ가 없습니다.
                      </div>
                    ) : (
                      <>
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          {[
                            ...pinnedFaqPosts,
                            ...paginatedFaqPosts,
                          ].map((post, index, displayedPosts) => {
                            const isExpanded =
                              expandedFaqPostId ===
                              post.id;

                            return (
                              <div
                                key={post.id}
                                className={
                                  index <
                                  displayedPosts.length - 1
                                    ? 'border-b border-slate-100'
                                    : ''
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleFaqPost(
                                      post.id
                                    )
                                  }
                                  className="grid w-full grid-cols-[minmax(0,1fr)_28px] items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:grid-cols-[150px_minmax(0,1fr)_28px] sm:px-5"
                                >
                                  <div className="hidden sm:block">
                                    <span className="inline-flex max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                      {faqCategoryNameById.get(
                                        post.categoryId
                                      ) || '미분류'}
                                    </span>
                                  </div>

                                  <div className="min-w-0">
                                    <div className="mb-1 flex flex-wrap items-center gap-2 sm:hidden">
                                      <span className="inline-flex max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                        {faqCategoryNameById.get(
                                          post.categoryId
                                        ) || '미분류'}
                                      </span>
                                    </div>

                                    <div className="flex min-w-0 items-center gap-2">
                                      {post.isPinned && (
                                        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                          고정
                                        </span>
                                      )}

                                      <span className="min-w-0 flex-1 break-words text-sm font-bold text-slate-800">
                                        {post.title}
                                      </span>
                                    </div>
                                  </div>

                                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-500">
                                    {isExpanded
                                      ? '−'
                                      : '+'}
                                  </span>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{
                                        height: 0,
                                        opacity: 0,
                                      }}
                                      animate={{
                                        height: 'auto',
                                        opacity: 1,
                                      }}
                                      exit={{
                                        height: 0,
                                        opacity: 0,
                                      }}
                                      transition={{
                                        duration: 0.2,
                                      }}
                                      className="overflow-hidden"
                                    >
                                      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-5 sm:pl-[175px]">
                                        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                                          {post.content}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>

                        {regularFaqPosts.length > 0 && (
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-2 text-xs"
                              disabled={safeFaqPage <= 1}
                              onClick={() => {
                                setFaqPage((prev) =>
                                  Math.max(1, prev - 1)
                                );
                                setExpandedFaqPostId('');
                              }}
                            >
                              이전
                            </Button>

                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                              {safeFaqPage} / {faqTotalPages}
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-2 text-xs"
                              disabled={
                                safeFaqPage >=
                                faqTotalPages
                              }
                              onClick={() => {
                                setFaqPage((prev) =>
                                  Math.min(
                                    faqTotalPages,
                                    prev + 1
                                  )
                                );
                                setExpandedFaqPostId('');
                              }}
                            >
                              다음
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                      <Clock size={22} />
                    </div>

                    <h3 className="text-base font-bold text-slate-900">준비중입니다</h3>

                    <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">
                      현재는 화면 구조만 먼저 분리했습니다. 세부 기능은 이후 단계에서 하나씩 추가할 예정입니다.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        ) : (
          shouldShowAdminLoadingPage ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardContent className="p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl mk-brand-gradient-tr text-white mk-brand-shadow-md">
                  <ShieldCheck size={26} />
                </div>
                <h2 className="text-lg font-black tracking-tight text-slate-900">
                  관리자 데이터를 확인하는 중입니다.
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">
                  Firebase 원격 DB 기준으로 관리자 ID 등록 상태를 확인한 뒤 관리자 인증 화면을 표시합니다.
                </p>
              </CardContent>
            </Card>
          ) : shouldShowAdminAccountsErrorPage ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-rose-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-rose-700 via-rose-600 to-orange-600 px-6 py-8 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

                <div className="relative flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <AlertCircle size={26} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black tracking-tight">
                      관리자 ID 데이터 연결 오류
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-rose-100">
                      관리자 ID 전용 데이터에 접근하지 못해 관리자 화면 진입을 차단했습니다.
                    </p>
                  </div>
                </div>
              </div>

              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                  {adminAccountsLoadErrorMessage || currentAuthRoleErrorMessage}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
                  Firestore 보안 규칙에서 <span className="font-semibold text-slate-900">adminAccounts/{`{uid}`}</span> 컬렉션의 읽기/쓰기 권한이 허용되어 있는지 확인해 주세요.
                  기존 관리자 ID 데이터 보호를 위해, 전용 관리자 ID 문서가 정상 연결되기 전에는 관리자 화면을 열지 않습니다.
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToUserHome}
                  >
                    사용자 화면으로 이동
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => window.location.reload()}
                  >
                    다시 시도
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : shouldShowAdminLoginPage ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                <div className="relative flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <ShieldCheck size={26} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black tracking-tight">
                      관리자 인증
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      등록된 관리자 로그인 이메일로 인증해야 관리자 모드에 접근할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>

              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                      <LockIcon size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        관리자 화면 잠금 상태
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        관리자 ID 또는 로그인 이메일과 비밀번호를 입력하면 인증 후 관리자 메뉴와 세부 기능이 표시됩니다.
                      </p>
                    </div>
                  </div>
                </div>

                <Input
                  label="관리자 로그인 이메일"
                  value={adminAuthForm.adminLoginId}
                  onChange={(v) =>
                    setAdminAuthForm({
                      ...adminAuthForm,
                      adminLoginId: v,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      authenticateAdmin();
                    }
                  }}
                  placeholder="관리자 로그인 이메일 입력"
                  autoFocus
                />

                <Input
                  label="비밀번호"
                  type="password"
                  value={adminAuthForm.password}
                  onChange={(v) =>
                    setAdminAuthForm({
                      ...adminAuthForm,
                      password: v,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      authenticateAdmin();
                    }
                  }}
                  placeholder="비밀번호 입력"
                />

                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs leading-5 text-orange-800">
                  신규 관리자 계정은 Firebase Authentication 이메일/비밀번호 방식으로 인증합니다.
                  기존 PBKDF2 관리자 계정은 이메일이 등록되어 있으면 로그인 성공 시 Firebase Auth 계정으로 자동 연결됩니다.
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToUserHome}
                  >
                    사용자 화면으로 이동
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={authenticateAdmin}
                    disabled={adminAuthLoading}
                  >
                    {adminAuthLoading ? '인증 중...' : '관리자 인증'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          /* ==================== [관리자 설정 화면] ==================== */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
            
            {/* 좌측 사이드 네비게이션 메뉴 */}
            <div className="lg:sticky lg:top-24 h-fit">
              <Card>
                <div className="bg-slate-900 px-5 py-4 text-white">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">관리 메뉴</h3>
                </div>
                <CardContent className="space-y-1.5 p-3">
                  {[
                    ['dashboard', LayoutDashboard, '실시간 대시보드'],
                    ['requests', ClipboardList, '기기 대여 신청 관리'],
                    ['laptops', Laptop, '대여 자산 관리'],
                    ['categories', ClipboardList, '자산 카테고리 관리'],
                    ['people', Users, '부서·사용자 관리'],
                    ['noticePosts', ClipboardList, '공지사항 관리'],
                    ['faqPosts', ClipboardList, 'FAQ 관리'],
                    ['memberAccounts', UserCircle, '회원 계정 관리'],
                    ['adminAccounts', ShieldCheck, '관리자 ID 관리'],
                    ['settings', Settings, '시스템 설정'],
                  ].map(([key, Icon, label]) => (
                    <Button
                      key={key}
                      variant={adminTab === key ? 'primary' : 'ghost'}
                      onClick={() => setAdminTab(key)}
                      className={`w-full justify-start ${adminTab === key ? '' : 'hover:bg-slate-100 text-slate-700'}`}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* 우측 세부 탭 컨텐츠 영역 */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  
                  {/* 대시보드 탭 */}
                  {adminTab === 'dashboard' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">관리자 대시보드 및 지침</h2>
                        <p className="text-xs text-slate-500 mt-1">
                          본 서비스는 Firebase Firestore 원격 DB를 기준으로 데이터를 동기화합니다.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">주요 프로세스 매칭 규정</h4>
                          <ul className="mt-3 space-y-2 text-xs text-slate-600 list-disc pl-4">
                            <li>시스템 설정에 따라 기기 상태 기준 또는 선택 기간 기준으로 신청 가능 여부를 판단합니다.</li>
                            <li>승인된 미래 신청은 &apos;예약중&apos;, 대여 시작일이 도래한 승인 신청은 &apos;대여중&apos;으로 표시됩니다.</li>
                            <li>신청중, 예약중, 대여중, 보류 상태는 신청 가능 여부 판단에 반영되며, 불허와 반납완료는 충돌 판단에서 제외됩니다.</li>
                          </ul>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 text-blue-800">
                          <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">외부 서버 통합 시 권장 개발 기술</h4>
                          <p className="mt-3 text-xs leading-relaxed text-blue-700">
                            상용 통합 배포 시, 본 프로토타입의 데이터 구조를 활용하여 Firebase Firestore, Postgres DB 등을 바인딩하고 알림톡/메일 API 서비스와 연계하여 통합 사내망 알림을 설계할 수 있습니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 신청 관리 원장 탭 */}
                  {adminTab === 'requests' && (
                    <div className="space-y-5">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">
                          기기 대여 신청 관리
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          신청·보류, 대여관리, 불허·취소, 반납완료 기록을 목록과 상세 화면으로 관리합니다.
                        </p>
                      </div>

                      {rentalRequestsLoadErrorMessage && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {rentalRequestsLoadErrorMessage}
                        </div>
                      )}

                      {orphanedRentalAvailabilityRequests.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800">
                          정식 rentalRequests 문서 없이 예약 요약만 남은 항목이{' '}
                          {orphanedRentalAvailabilityRequests.length}건 있습니다.
                          해당 항목은 상태 변경, 정보 수정과 메모 저장을 차단합니다.
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            id: ADMIN_REQUEST_TAB.PENDING,
                            label: '신청·보류',
                          },
                          {
                            id: ADMIN_REQUEST_TAB.RENTAL,
                            label: '대여관리',
                          },
                          {
                            id: ADMIN_REQUEST_TAB.CLOSED,
                            label: '불허·취소',
                          },
                          {
                            id: ADMIN_REQUEST_TAB.RETURNED,
                            label: '반납완료',
                          },
                        ].map((tab) => {
                          const isActive =
                            adminRequestTab ===
                            tab.id;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setAdminRequestTab(
                                  tab.id
                                );
                                setAdminRequestQuery('');
                                setAdminRequestPage(1);
                                setSelectedAdminRequestId('');
                              }}
                              className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                                isActive
                                  ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                              }`}
                            >
                              {tab.label}{' '}
                              <span
                                className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${
                                  isActive
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {adminRequestTabCounts[
                                  tab.id
                                ] || 0}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {!selectedAdminRequest && (
                        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end">
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                              신청 검색
                            </span>
                            <div className="relative">
                              <Search
                                size={15}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                              />
                              <input
                                type="text"
                                value={adminRequestQuery}
                                onChange={(event) => {
                                  setAdminRequestQuery(
                                    event.target.value
                                  );
                                  setAdminRequestPage(1);
                                }}
                                placeholder="자산번호, 신청자, 대여자, 부서, 이메일, 목적"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none mk-form-border-focus"
                              />
                            </div>
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                              페이지당 표시
                            </span>
                            <select
                              value={adminRequestPageSize}
                              onChange={(event) => {
                                setAdminRequestPageSize(
                                  Number(
                                    event.target.value
                                  )
                                );
                                setAdminRequestPage(1);
                              }}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
                            >
                              {ADMIN_REQUEST_PAGE_SIZE_OPTIONS.map(
                                (option) => (
                                  <option
                                    key={option}
                                    value={option}
                                  >
                                    {option}개
                                  </option>
                                )
                              )}
                            </select>
                          </label>
                        </div>
                      )}

                      {!rentalRequestsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          전체 대여신청 정보를 불러오는 중입니다.
                        </div>
                      ) : rentalRequestsLoadErrorMessage ? null : mergedRentalRequests.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          현재 접수되거나 처리된 대여 신청 목록이 없습니다.
                        </div>
                      ) : selectedAdminRequest ? (
                        (() => {
                          const r =
                            selectedAdminRequest;

                          const isOverdue =
                            r.status ===
                              STATUS.APPROVED &&
                            r.dueDate &&
                            r.dueDate < today();

                          const hasRentalRequestDocument =
                            rentalRequestIdSet.has(
                              r.id
                            );

                          const requestAuditLogs =
                            rentalRequestLogsByRequestId.get(
                              r.id
                            ) || [];

                          const userActionRequest =
                            r.userActionRequest ||
                            null;

                          const hasPendingUserAction =
                            userActionRequest?.status ===
                            USER_REQUEST_REVIEW_STATUS.PENDING;

                          const isUserActionSaving =
                            adminUserActionSavingRequestId ===
                            r.id;

                          const restoreTargets =
                            getAdminRequestRestoreTargets(
                              r
                            );

                          return (
                            <div className="space-y-4">
                              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="shrink-0 px-4 py-2 text-xs"
                                  onClick={() =>
                                    setSelectedAdminRequestId(
                                      ''
                                    )
                                  }
                                >
                                  목록으로
                                </Button>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="px-3 py-2 text-xs"
                                    disabled={
                                      !hasRentalRequestDocument
                                    }
                                    onClick={() =>
                                      openAdminRequestEditDialog(
                                        r
                                      )
                                    }
                                  >
                                    <Edit3 size={14} />
                                    신청정보 수정
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="px-3 py-2 text-xs"
                                    disabled={
                                      !hasRentalRequestDocument ||
                                      restoreTargets.length ===
                                        0
                                    }
                                    onClick={() =>
                                      openAdminRequestRestoreDialog(
                                        r
                                      )
                                    }
                                  >
                                    상태 되돌리기
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                        {r.assetCategory}
                                      </span>

                                      <span className="text-sm font-bold text-slate-950">
                                        {r.assetNo}
                                      </span>

                                      <Badge>
                                        {getDisplayRentalStatus(
                                          r.status,
                                          r.startDate,
                                          r.dueDate
                                        )}
                                      </Badge>

                                      {isOverdue && (
                                        <span className="inline-flex animate-pulse items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                                          반납 기한 지연중
                                        </span>
                                      )}
                                    </div>

                                    <div className="text-xs font-medium text-slate-600">
                                      신청자:{' '}
                                      <span className="text-slate-900">
                                        {r.requesterName ||
                                          r.requesterEmail ||
                                          '-'}
                                      </span>
                                      {' · '}
                                      소속:{' '}
                                      <span className="text-slate-900">
                                        {r.team || '-'}
                                      </span>
                                      {' · '}
                                      대여자명:{' '}
                                      <span className="text-slate-900">
                                        {r.borrower || '-'}
                                      </span>
                                    </div>

                                    <div className="text-[11px] text-slate-500">
                                      대여 일정: {r.startDate || '-'} ~{' '}
                                      {r.dueDate || '-'}
                                    </div>

                                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-600">
                                      목적:{' '}
                                      <span className="font-medium text-slate-700">
                                        {r.purpose ||
                                          '서술 목적 없음'}
                                      </span>
                                    </div>

                                    <div className="text-[10px] text-slate-400">
                                      등록 접수 일시:{' '}
                                      {r.requestedAt ||
                                        formatFirestoreTimestamp(
                                          r.createdAt
                                        )}
                                    </div>
                                  </div>

                                  {hasRentalRequestDocument ? (
                                    hasPendingUserAction ? (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                        사용자 요청 검토를 먼저 완료해 주세요.
                                      </div>
                                    ) : (
                                      renderRequestActionButtons(
                                        r
                                      )
                                    )
                                  ) : (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                      정식 신청 문서가 없어 상태 변경을 차단했습니다.
                                    </div>
                                  )}
                                </div>

                                {userActionRequest && (
                                  <div
                                    className={`rounded-xl border px-4 py-3 text-xs ${
                                      hasPendingUserAction
                                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                                        : userActionRequest.status ===
                                            USER_REQUEST_REVIEW_STATUS.APPROVED
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                          : 'border-rose-200 bg-rose-50 text-rose-800'
                                    }`}
                                  >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0 space-y-1">
                                        <div className="font-bold">
                                          {getUserRequestActionLabel(
                                            userActionRequest.type
                                          )}{' '}
                                          ·{' '}
                                          {getUserRequestReviewStatusLabel(
                                            userActionRequest.status
                                          )}
                                        </div>

                                        <div className="leading-5">
                                          요청 사유:{' '}
                                          {userActionRequest.reason ||
                                            '-'}
                                        </div>

                                        {userActionRequest.type ===
                                          USER_REQUEST_ACTION.CHANGE && (
                                          <div className="leading-5">
                                            변경 요청:{' '}
                                            {userActionRequest.team ||
                                              '-'}
                                            {' · '}
                                            {userActionRequest.borrower ||
                                              '-'}
                                            {' · '}
                                            {userActionRequest.startDate ||
                                              '-'}
                                            {' ~ '}
                                            {userActionRequest.dueDate ||
                                              '-'}
                                          </div>
                                        )}

                                        {userActionRequest.type ===
                                          USER_REQUEST_ACTION.EXTEND && (
                                          <div className="leading-5">
                                            연장 요청일:{' '}
                                            {userActionRequest.dueDate ||
                                              '-'}
                                          </div>
                                        )}
                                      </div>

                                      {hasPendingUserAction && (
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            variant="primary"
                                            disabled={
                                              isUserActionSaving
                                            }
                                            onClick={() =>
                                              reviewUserActionRequest(
                                                r.id,
                                                true
                                              )
                                            }
                                            className="px-3 py-2 text-xs"
                                          >
                                            승인
                                          </Button>

                                          <Button
                                            type="button"
                                            variant="dangerOutline"
                                            disabled={
                                              isUserActionSaving
                                            }
                                            onClick={() =>
                                              reviewUserActionRequest(
                                                r.id,
                                                false
                                              )
                                            }
                                            className="px-3 py-2 text-xs"
                                          >
                                            불허
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="border-t border-slate-100 pt-2">
                                  <label className="block">
                                    <span className="block text-[10px] font-semibold uppercase text-slate-500">
                                      승인 관리자 심사 및 인수인계 코멘트
                                    </span>

                                    <input
                                      type="text"
                                      value={r.adminMemo || ''}
                                      onChange={(event) =>
                                        updateRequestMemo(
                                          r.id,
                                          event.target.value
                                        )
                                      }
                                      onBlur={(event) => {
                                        if (
                                          hasRentalRequestDocument
                                        ) {
                                          saveRequestMemo(
                                            r.id,
                                            event.target.value
                                          );
                                        }
                                      }}
                                      disabled={
                                        !hasRentalRequestDocument
                                      }
                                      placeholder="전달 혹은 상태 변경 사유 등을 남겨 공유하세요."
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                                    />
                                  </label>
                                </div>

                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] font-semibold uppercase text-slate-500">
                                    관리자 처리 이력
                                  </div>

                                  {!rentalRequestLogsReady ? (
                                    <div className="mt-2 text-[11px] text-slate-400">
                                      처리 이력을 불러오는 중입니다.
                                    </div>
                                  ) : rentalRequestLogsLoadErrorMessage ? (
                                    <div className="mt-2 text-[11px] text-rose-600">
                                      {rentalRequestLogsLoadErrorMessage}
                                    </div>
                                  ) : requestAuditLogs.length === 0 ? (
                                    <div className="mt-2 text-[11px] text-slate-400">
                                      기록된 관리자 처리 이력이 없습니다.
                                    </div>
                                  ) : (
                                    <div className="mt-2 space-y-2">
                                      {requestAuditLogs
                                        .slice(0, 10)
                                        .map((log) => (
                                          <div
                                            key={log.id}
                                            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="font-semibold text-slate-800">
                                                {log.action ===
                                                RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED
                                                  ? `${log.previousStatus || '-'} → ${log.nextStatus || '-'}`
                                                  : log.action ===
                                                      RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED
                                                    ? `상태 복구: ${log.previousStatus || '-'} → ${log.nextStatus || '-'}`
                                                    : log.action ===
                                                        RENTAL_REQUEST_AUDIT_ACTION.REQUEST_EDITED
                                                      ? '신청정보 수정'
                                                      : log.action ===
                                                          RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED
                                                        ? '관리자 메모 변경'
                                                        : '사용자 요청 검토'}
                                              </span>

                                              <span className="text-[10px] text-slate-400">
                                                {formatFirestoreTimestamp(
                                                  log.createdAt
                                                )}
                                              </span>
                                            </div>

                                            <div className="mt-1 text-[10px] text-slate-500">
                                              처리 관리자:{' '}
                                              {log.actorName ||
                                                log.actorAdminId ||
                                                log.actorUid ||
                                                '-'}
                                            </div>

                                            {log.action ===
                                              RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED && (
                                              <div className="mt-1 break-words text-[10px] text-slate-500">
                                                변경 메모:{' '}
                                                {log.nextMemo ||
                                                  '(빈 메모)'}
                                              </div>
                                            )}

                                            {log.detail && (
                                              <div className="mt-1 break-words text-[10px] text-slate-500">
                                                {log.detail}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : filteredAdminRequests.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          선택한 탭과 검색 조건에 해당하는 신청이 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full min-w-[1120px] table-fixed border-collapse text-left">
                              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <tr>
                                  <th className="w-36 border-b border-slate-200 px-3 py-3">
                                    처리·접수일
                                  </th>
                                  <th className="w-32 border-b border-slate-200 px-3 py-3">
                                    자산번호
                                  </th>
                                  <th className="w-28 border-b border-slate-200 px-3 py-3">
                                    기기 분류
                                  </th>
                                  <th className="w-36 border-b border-slate-200 px-3 py-3">
                                    신청자·대여자
                                  </th>
                                  <th className="w-28 border-b border-slate-200 px-3 py-3">
                                    부서
                                  </th>
                                  <th className="border-b border-slate-200 px-3 py-3">
                                    대여 기간
                                  </th>
                                  <th className="w-24 border-b border-slate-200 px-3 py-3 text-center">
                                    상태
                                  </th>
                                  <th className="w-28 border-b border-slate-200 px-3 py-3 text-center">
                                    사용자 요청
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {paginatedAdminRequests.map(
                                  (request) => {
                                    const requestLogs =
                                      rentalRequestLogsByRequestId.get(
                                        request.id
                                      ) || [];

                                    const latestStatusLog =
                                      requestLogs.find(
                                        (log) =>
                                          [
                                            RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED,
                                            RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
                                          ].includes(
                                            log.action
                                          ) &&
                                          log.nextStatus ===
                                            request.status
                                      );

                                    const referenceDate =
                                      latestStatusLog?.createdAt
                                        ? formatFirestoreTimestamp(
                                            latestStatusLog.createdAt
                                          )
                                        : request.requestedAt ||
                                          formatFirestoreTimestamp(
                                            request.createdAt
                                          );

                                    const userAction =
                                      request.userActionRequest;

                                    return (
                                      <tr
                                        key={request.id}
                                        className="cursor-pointer border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50"
                                        onClick={() =>
                                          setSelectedAdminRequestId(
                                            request.id
                                          )
                                        }
                                      >
                                        <td className="px-3 py-3 text-[11px] text-slate-500">
                                          {referenceDate || '-'}
                                        </td>

                                        <td className="px-3 py-3">
                                          <button
                                            type="button"
                                            className="max-w-full truncate text-left text-xs font-bold text-slate-900 hover:text-orange-600 hover:underline"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedAdminRequestId(
                                                request.id
                                              );
                                            }}
                                          >
                                            {request.assetNo ||
                                              '-'}
                                          </button>
                                        </td>

                                        <td className="truncate px-3 py-3 text-xs text-slate-600">
                                          {request.assetCategory ||
                                            '-'}
                                        </td>

                                        <td className="px-3 py-3 text-xs text-slate-600">
                                          <div className="truncate font-semibold text-slate-800">
                                            {request.requesterName ||
                                              request.requesterEmail ||
                                              '-'}
                                          </div>
                                          <div className="mt-0.5 truncate text-[10px] text-slate-400">
                                            대여자:{' '}
                                            {request.borrower ||
                                              '-'}
                                          </div>
                                        </td>

                                        <td className="truncate px-3 py-3 text-xs text-slate-600">
                                          {request.team ||
                                            '-'}
                                        </td>

                                        <td className="px-3 py-3 text-xs text-slate-600">
                                          {request.startDate ||
                                            '-'}
                                          {' ~ '}
                                          {request.dueDate ||
                                            '-'}
                                        </td>

                                        <td className="px-3 py-3 text-center">
                                          <Badge>
                                            {getDisplayRentalStatus(
                                              request.status,
                                              request.startDate,
                                              request.dueDate
                                            )}
                                          </Badge>
                                        </td>

                                        <td className="px-3 py-3 text-center text-[11px] text-slate-500">
                                          {userAction
                                            ? `${getUserRequestActionLabel(
                                                userAction.type
                                              )} · ${getUserRequestReviewStatusLabel(
                                                userAction.status
                                              )}`
                                            : '-'}
                                        </td>
                                      </tr>
                                    );
                                  }
                                )}
                              </tbody>
                            </table>
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-[11px] text-slate-500">
                              검색 결과{' '}
                              {filteredAdminRequests.length}건 ·{' '}
                              {safeAdminRequestPage} /{' '}
                              {adminRequestTotalPages}페이지
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminRequestPage <= 1
                                }
                                onClick={() =>
                                  setAdminRequestPage(
                                    (prev) =>
                                      Math.max(
                                        1,
                                        prev - 1
                                      )
                                  )
                                }
                              >
                                이전
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminRequestPage >=
                                  adminRequestTotalPages
                                }
                                onClick={() =>
                                  setAdminRequestPage(
                                    (prev) =>
                                      Math.min(
                                        adminRequestTotalPages,
                                        prev + 1
                                      )
                                  )
                                }
                              >
                                다음
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 자산 목록 관리 탭 */}
                  {adminTab === 'laptops' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">대여 자산 관리</h2>
                          <p className="text-xs text-slate-500 mt-1">자산 고유 시리얼 넘버, 기기 사진 연동, 특이 사항 메모 및 장비를 관리합니다.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {/* 엑셀/CSV 업로드 패널 토글 액션 버튼 추가 */}
                          <Button
                            onClick={() => {
                              setShowUploadPanel((prev) => !prev);
                              setNewLaptop(null);
                              setEditLaptop(null);
                            }}
                            variant="outline"
                            className="py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-sm"
                          >
                            <ClipboardList size={16} /> 엑셀/CSV 업로드
                          </Button>
                          <Button
                            onClick={handleAddLaptopClick}
                            variant="primary"
                            className="py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-md"
                          >
                            <Plus size={16} /> 신규 자산 추가
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid w-full gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)] lg:w-auto lg:grid-cols-[118px_118px_15rem]">
                        <select
                          aria-label="관리자 자산 카테고리 필터"
                          value={adminSelectedAssetCategory}
                          onChange={(e) => {
                            setAdminSelectedAssetCategory(e.target.value);
                            setEditLaptop(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                        >
                          <option value="전체">전체</option>
                          {(data.assetCategories || []).map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>

                        <select
                          aria-label="관리자 대여 가능여부 필터"
                          value={adminAvailabilityFilter}
                          onChange={(e) => {
                            setAdminAvailabilityFilter(e.target.value);
                            setEditLaptop(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                        >
                          <option value="전체">전체</option>
                          <option value={STATUS.AVAILABLE}>대여가능</option>
                          <option value={STATUS.UNAVAILABLE}>대여불가</option>
                        </select>

                        <div className="relative w-full">
                          <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                          <input
                            value={adminLaptopQuery}
                            onChange={(e) => {
                              setAdminLaptopQuery(e.target.value);
                              setEditLaptop(null);
                            }}
                            placeholder="자산관리번호, 기종, 키워드 검색"
                            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                          />
                        </div>
                      </div>

                      {/* 자동 일괄 업로드 가이드 및 파일 셀렉터 드롭존 UI */}
                      {showUploadPanel && (
                        <div className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 p-6 text-center transition-colors duration-150 animate-fadeIn">
                          <div className="mx-auto flex max-w-xl flex-col items-center justify-center">
                            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 mb-3 border border-blue-100">
                              <ClipboardList size={26} />
                            </div>
                            <h4 className="text-sm font-bold text-slate-800">엑셀 / CSV 파일 자동 업로드 일괄 추가</h4>
                            <p className="text-[11px] text-slate-500 mt-1 max-w-lg leading-relaxed">
                              샘플 양식을 기준으로 첫 번째 시트 또는 CSV 첫 줄의 헤더를 유지하고, 다음 행부터 자산 정보를 입력해 업로드해 주세요.
                            </p>
                            <div className="mt-3.5 rounded-lg bg-white px-4 py-3 border border-slate-200 text-left w-full text-[11px] space-y-1.5 text-slate-600 shadow-sm">
                              <div>📌 <b>엑셀은 첫 번째 시트만 읽습니다.</b> 작성가이드 시트는 그대로 두어도 되지만, 첫 번째 시트로 이동시키면 안 됩니다.</div>
                              <div>📌 <b>헤더는 엑셀 1행 또는 CSV 첫 줄에 있어야 합니다.</b> 제목, 안내문, 빈 줄을 헤더 위에 두면 업로드가 정상 인식되지 않을 수 있습니다.</div>
                              <div>📌 <b>자산카테고리와 자산관리번호는 필수입니다.</b> 둘 중 하나라도 비어 있는 행은 등록되지 않습니다.</div>
                              <div>📌 <b>자산카테고리 검증:</b> 관리자 메뉴의 자산 카테고리 등록 목록과 정확히 일치하는 카테고리만 업로드됩니다.</div>
                              <div>📌 <b>일부 칸은 비워도 등록됩니다.</b> 모델명은 미지정 기종, 시리얼번호는 자동 번호, 제조일자는 오늘 날짜, 사진URL은 기본 이미지, 대여가능여부는 대여가능으로 처리됩니다.</div>
                              <div>📌 <b>권장 헤더:</b> 자산카테고리, 자산관리번호, 대여가능여부, 모델명, 시리얼번호, 제조일자, 사진URL, 비고</div>
                              <div>📌 <b>대여불가 처리:</b> 대여가능여부 칸에 대여불가, 불가, unavailable 중 하나가 포함되면 대여불가로 등록됩니다.</div>
                            </div>
                            <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                              <a
                                href="files/sample.xlsx"
                                download
                                className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl text-xs transition-all duration-150 active:scale-[0.98] bg-blue-600 text-white hover:bg-blue-700 px-4 py-3 cursor-pointer shadow-sm shadow-blue-100"
                              >
                                <Save size={14} /> 샘플 엑셀 양식 다운로드
                              </a>
                              <label htmlFor="excel-csv-file-selector" className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl text-xs transition-all duration-150 active:scale-[0.98] bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-3 cursor-pointer shadow-sm">
                                <Plus size={14} /> 엑셀 또는 CSV 파일 선택
                              </label>
                              <input
                                id="excel-csv-file-selector"
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileUpload}
                                className="hidden"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 신규 자산 추가 폼 */}
                      {newLaptop && (
                        <div className="rounded-2xl border-2 border-emerald-400/80 bg-emerald-50/20 p-5 space-y-4 shadow-sm animate-fadeIn">
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                            <span className="text-sm font-bold text-slate-900">신규 대여 자산 등록</span>
                            <Button onClick={() => setNewLaptop(null)} variant="outline" className="px-2 py-1 text-xs">닫기</Button>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Select
                              label="자산 카테고리"
                              value={newLaptop.category || data.assetCategories?.[0] || '노트북'}
                              onChange={(v) => setNewLaptop({ ...newLaptop, category: v })}
                            >
                              {(data.assetCategories || ['노트북']).map((category) => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </Select>
                            <Input
                              label="자산 관리 번호"
                              value={newLaptop.assetNo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, assetNo: v })}
                              placeholder="예: LAPTOP-2026-16"
                            />
                            <Select
                              label="대여 가능 여부"
                              value={newLaptop.status}
                              onChange={(v) => setNewLaptop({ ...newLaptop, status: v })}
                            >
                              <option value={STATUS.AVAILABLE}>대여가능 (기본)</option>
                              <option value={STATUS.UNAVAILABLE}>대여불가 (고장/수리 등)</option>
                            </Select>
                            <Input
                              label="제작/출고 모델명"
                              value={newLaptop.model}
                              onChange={(v) => setNewLaptop({ ...newLaptop, model: v })}
                              placeholder="예: LG Gram 16 Pro"
                            />
                            <Input
                              label="고유 시리얼 번호 (S/N)"
                              value={newLaptop.serialNo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, serialNo: v })}
                              placeholder="예: SN-2026-10500"
                            />
                            <Input
                              label="출고일"
                              type="date"
                              value={newLaptop.manufactureDate}
                              onChange={(v) => setNewLaptop({ ...newLaptop, manufactureDate: v })}
                            />
                            <Input
                              label="자산 기종 사진 연결 URL"
                              value={newLaptop.photo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, photo: v })}
                              placeholder="사진 URL 입력"
                            />
                            <Input
                              label="비고 / 기재 사항"
                              value={newLaptop.note}
                              onChange={(v) => setNewLaptop({ ...newLaptop, note: v })}
                              placeholder="예: 마우스 포함, 액정 흠집 등"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                            <Button onClick={() => setNewLaptop(null)} variant="outline">취소</Button>
                            <Button onClick={createLaptop} variant="primary" className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100">
                              새 자산 등록 완료
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {adminFilteredLaptops.map((l, index) => (
                          <React.Fragment key={l.id}>
                            <div
                              className={`rounded-xl p-4 flex flex-col justify-between hover:shadow-sm transition ${
                                editLaptop?.id === l.id
                                  ? 'border-2 border-blue-400/80 bg-blue-50/20'
                                  : 'border border-slate-200 bg-white'
                              }`}
                            >
                              <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                                <img
                                  src={l.photo}
                                  alt={l.assetNo}
                                  className="h-full w-full object-cover transition duration-350"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {l.category}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900 text-sm">{l.assetNo}</span>
                                  <Badge>{getLaptopAdminDisplayStatus(l, data.requests)}</Badge>
                                </div>
                                <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                                <div className="space-y-0.5 text-[11px] text-slate-500">
                                  <div>S/N: {l.serialNo}</div>
                                  <div>출고일: {l.manufactureDate}</div>
                                </div>
                                <div className="mt-1 rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 border border-slate-200/50">
                                  💡 {l.note || '특이사항 없음'}
                                </div>
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  onClick={() => {
                                    if (editLaptop?.id === l.id) {
                                      setEditLaptop(null);
                                      return;
                                    }

                                    setNewLaptop(null);
                                    setShowUploadPanel(false);
                                    setEditLaptop(l);
                                  }}
                                  variant="outline"
                                  className="flex-1 py-1.5 text-xs rounded-lg"
                                >
                                  <Edit3 size={12} /> 정보 변경 수정
                                </Button>
                                <Button
                                  onClick={() => deleteLaptop(l.id, l.assetNo)}
                                  variant="dangerOutline"
                                  className="py-1.5 text-xs rounded-lg px-3"
                                  title="자산 삭제"
                                >
                                  <Trash2 size={12} /> 삭제
                                </Button>
                              </div>
                            </div>

                            {editLaptopInsertIndex === index && editLaptop && (
                              <div className="col-span-full rounded-2xl border-2 border-blue-400/80 bg-blue-50/20 p-5 space-y-4 shadow-sm animate-fadeIn">
                                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                                  <span className="text-sm font-bold text-slate-900">자산 수정 패널: <b className="text-blue-600">{editLaptop.assetNo}</b></span>
                                  <Button onClick={() => setEditLaptop(null)} variant="outline" className="px-2 py-1 text-xs">닫기</Button>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Select
                                    label="자산 카테고리"
                                    value={editLaptop.category || data.assetCategories?.[0] || '노트북'}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, category: v })}
                                  >
                                    {(data.assetCategories || ['노트북']).map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </Select>
                                  <Input
                                    label="자산 관리 번호"
                                    value={editLaptop.assetNo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, assetNo: v })}
                                  />
                                  <Select
                                    label="대여 가능 여부"
                                    value={editLaptop.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : STATUS.AVAILABLE}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, status: v })}
                                  >
                                    <option value={STATUS.AVAILABLE}>대여가능 (기본)</option>
                                    <option value={STATUS.UNAVAILABLE}>대여불가 (고장/수리 등)</option>
                                  </Select>
                                  <Input
                                    label="제작/출고 모델명"
                                    value={editLaptop.model}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, model: v })}
                                  />
                                  <Input
                                    label="고유 시리얼 번호 (S/N)"
                                    value={editLaptop.serialNo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, serialNo: v })}
                                  />
                                  <Input
                                    label="출고일"
                                    type="date"
                                    value={editLaptop.manufactureDate}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, manufactureDate: v })}
                                  />
                                  <Input
                                    label="자산 기종 사진 연결 URL"
                                    value={editLaptop.photo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, photo: v })}
                                  />
                                  <Input
                                    label="비고 / 기재 사항"
                                    value={editLaptop.note}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, note: v })}
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                                  <Button onClick={() => setEditLaptop(null)} variant="outline">취소</Button>
                                  <Button onClick={saveLaptop} variant="primary">자산 정보 최종 저장</Button>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 자산 카테고리 관리 탭 */}
                  {adminTab === 'categories' && (
                    <div className="space-y-6">
                      <div className="grid gap-8 md:grid-cols-2">
                        {/* 자산 카테고리 관리 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">자산 카테고리 관리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">대여 자산 분류를 관리합니다.</p>
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={newAssetCategory}
                              onChange={(e) => setNewAssetCategory(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addTempAssetCategory();
                                }
                              }}
                              placeholder="새로운 자산 카테고리 명칭"
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />
                            <Button
                              onClick={addTempAssetCategory}
                              className="px-3 py-2"
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                          <div className="rounded-xl bg-slate-100 p-4 border border-slate-200/50 text-xs text-slate-600">
                            💡 <b>운영 안내:</b> 카테고리 추가, 수정, 삭제, 순서 변경은 임시 편집 상태로 먼저 반영됩니다. 하단의 변경사항 저장을 눌러야 최종 DB에 저장됩니다.
                          </div>
                        </div>

                        {/* 등록된 자산 카테고리 목록 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">등록된 자산 카테고리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">카드를 드래그해서 대여 자산 등록 시 사용할 분류 순서를 변경할 수 있습니다.</p>
                          </div>
                          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                            {(tempAssetCategories || []).length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                                현재 등록된 자산 카테고리가 없습니다.
                              </div>
                            ) : (
                              (tempAssetCategories || []).map((category, index) => (
                                <div
                                  key={`${category}-${index}`}
                                  draggable={editingAssetCategoryIndex !== index}
                                  onDragStart={() => setDraggingAssetCategoryIndex(index)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveTempAssetCategory(draggingAssetCategoryIndex, index);
                                    setDraggingAssetCategoryIndex(null);
                                  }}
                                  onDragEnd={() => setDraggingAssetCategoryIndex(null)}
                                  className={`flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700 transition ${
                                    draggingAssetCategoryIndex === index
                                      ? 'opacity-50'
                                      : editingAssetCategoryIndex === index
                                        ? ''
                                        : 'cursor-move hover:bg-slate-100'
                                  }`}
                                >
                                  {editingAssetCategoryIndex === index ? (
                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                                      <input
                                        value={editingAssetCategoryName}
                                        onChange={(e) => setEditingAssetCategoryName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            applyEditTempAssetCategory(category, index);
                                          }

                                          if (e.key === 'Escape') {
                                            setEditingAssetCategoryIndex(null);
                                            setEditingAssetCategoryName('');
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                      />
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => applyEditTempAssetCategory(category, index)}
                                          variant="outline"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <Save size={13} /> 적용
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setEditingAssetCategoryIndex(null);
                                            setEditingAssetCategoryName('');
                                          }}
                                          variant="ghost"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <X size={13} />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <span>{category}</span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditTempAssetCategory(category, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                        >
                                          <Edit3 size={14} />
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTempAssetCategory(category, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          onClick={cancelTempAssetCategoryChanges}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveTempAssetCategoryChanges}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 팀명 및 대여자 관리 탭 */}
                  {adminTab === 'people' && (
                    <div className="space-y-6">
                      <div className="grid gap-8 md:grid-cols-2">
                        {/* 부서/팀 관리 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">부서 관리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">부서 카드를 드래그해서 사용자 화면에 표시될 부서 순서를 변경할 수 있습니다.</p>
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={newTeam}
                              onChange={(e) => setNewTeam(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addTempTeam();
                                }
                              }}
                              placeholder="새로운 등록 부서 명칭"
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />
                            <Button
                              onClick={addTempTeam}
                              className="px-3 py-2"
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                            {(tempTeams || []).length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                                현재 등록된 부서가 없습니다.
                              </div>
                            ) : (
                              (tempTeams || []).map((t, index) => (
                                <div
                                  key={`${t}-${index}`}
                                  draggable={editingTeamIndex !== index}
                                  onDragStart={() => setDraggingTeamIndex(index)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveTempTeam(draggingTeamIndex, index);
                                    setDraggingTeamIndex(null);
                                  }}
                                  onDragEnd={() => setDraggingTeamIndex(null)}
                                  className={`flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700 transition ${
                                    draggingTeamIndex === index
                                      ? 'opacity-50'
                                      : editingTeamIndex === index
                                        ? ''
                                        : 'cursor-move hover:bg-slate-100'
                                  }`}
                                >
                                  {editingTeamIndex === index ? (
                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                                      <input
                                        value={editingTeamName}
                                        onChange={(e) => setEditingTeamName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            applyEditTempTeam(t, index);
                                          }

                                          if (e.key === 'Escape') {
                                            setEditingTeamIndex(null);
                                            setEditingTeamName('');
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                      />
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => applyEditTempTeam(t, index)}
                                          variant="outline"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <Save size={13} /> 적용
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setEditingTeamIndex(null);
                                            setEditingTeamName('');
                                          }}
                                          variant="ghost"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <X size={13} />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <span>{t}</span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditTempTeam(t, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                        >
                                          <Edit3 size={14} />
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTempTeam(t, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* 사원 관리 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">사용자 관리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">부서를 선택하면 해당 부서 사용자만 표시됩니다. 전체를 선택하면 모든 사용자가 표시됩니다.</p>
                          </div>
                          <div className="space-y-2">
                            <select
                              value={newBorrowerTeam}
                              onChange={(e) => {
                                setNewBorrowerTeam(e.target.value);
                                setEditingBorrowerIndex(null);
                                setEditingBorrowerName('');
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                            >
                              <option value="전체">전체</option>
                              {(tempTeams || []).map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <input
                                value={newBorrower}
                                onChange={(e) => setNewBorrower(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    addTempBorrower();
                                  }
                                }}
                                placeholder="새로운 배정 사원명"
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                              />
                              <Button
                                onClick={addTempBorrower}
                                className="px-3 py-2"
                              >
                                <Plus size={16} />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                            {(displayedTempBorrowers || []).length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                                {newBorrowerTeam === '전체'
                                  ? '현재 등록된 사용자가 없습니다.'
                                  : '선택한 부서에 등록된 사용자가 없습니다.'}
                              </div>
                            ) : (
                              (displayedTempBorrowers || []).map((b) => (
                                <div
                                  key={`${b.team}-${b.name}-${b.originalIndex}`}
                                  draggable={editingBorrowerIndex !== b.originalIndex}
                                  onDragStart={() => setDraggingBorrowerIndex(b.originalIndex)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveTempBorrower(draggingBorrowerIndex, b.originalIndex);
                                    setDraggingBorrowerIndex(null);
                                  }}
                                  onDragEnd={() => setDraggingBorrowerIndex(null)}
                                  className={`flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700 transition ${
                                    draggingBorrowerIndex === b.originalIndex
                                      ? 'opacity-50'
                                      : editingBorrowerIndex === b.originalIndex
                                        ? ''
                                        : 'cursor-move hover:bg-slate-100'
                                  }`}
                                >
                                  {editingBorrowerIndex === b.originalIndex ? (
                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                                      <input
                                        value={editingBorrowerName}
                                        onChange={(e) => setEditingBorrowerName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            applyEditTempBorrower(b, b.originalIndex);
                                          }

                                          if (e.key === 'Escape') {
                                            setEditingBorrowerIndex(null);
                                            setEditingBorrowerName('');
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                      />
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => applyEditTempBorrower(b, b.originalIndex)}
                                          variant="outline"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <Save size={13} /> 적용
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setEditingBorrowerIndex(null);
                                            setEditingBorrowerName('');
                                          }}
                                          variant="ghost"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <X size={13} />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <span>
                                        {b.name} <span className="text-[10px] text-slate-400">({b.team})</span>
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditTempBorrower(b, b.originalIndex);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                        >
                                          <Edit3 size={14} />
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTempBorrower(b, b.originalIndex);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          onClick={cancelTempPeopleChanges}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveTempPeopleChanges}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
                  )}

                                    {/* 공지사항 관리 탭 */}
                  {adminTab === 'noticePosts' && (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">
                            공지사항 관리
                          </h2>

                          <p className="mt-1 text-xs text-slate-500">
                            사용자 화면에 표시되는 공지사항을 등록, 수정, 삭제하고 목록 표시 개수를 설정합니다.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="primary"
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={() =>
                            openNoticePostDialog()
                          }
                        >
                          <Plus size={14} />
                          공지사항 등록
                        </Button>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900">
                              목록 표시 설정
                            </h3>

                            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                              상단 고정 게시글은 제외하고 일반 게시글만 설정한 개수만큼 한 페이지에 표시합니다.
                            </p>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-end">
                            <div className="w-full">
                              <Select
                                label="페이지당 일반 게시글 수"
                                value={String(
                                  noticePostsPerPageInput
                                )}
                                onChange={(value) =>
                                  setNoticePostsPerPageInput(
                                    Number(value)
                                  )
                                }
                              >
                                {NOTICE_POSTS_PER_PAGE_OPTIONS.map(
                                  (option) => (
                                    <option
                                      key={option}
                                      value={option}
                                    >
                                      {option}개
                                    </option>
                                  )
                                )}
                              </Select>
                            </div>

                            <Button
                              type="button"
                              variant="primary"
                              className="h-10 w-full whitespace-nowrap px-4 text-xs"
                              disabled={
                                !noticeBoardConfigReady ||
                                noticeBoardConfigSaving
                              }
                              onClick={saveNoticeBoardConfig}
                            >
                              <Save size={14} />
                              {noticeBoardConfigSaving
                                ? '저장 중'
                                : '설정 저장'}
                            </Button>
                          </div>
                        </div>

                        {noticeBoardConfigLoadErrorMessage && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                            {noticeBoardConfigLoadErrorMessage}
                          </div>
                        )}
                      </div>

                      {!noticePostsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          공지사항을 불러오는 중입니다.
                        </div>
                      ) : noticePostsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {noticePostsLoadErrorMessage}
                        </div>
                      ) : noticePosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          등록된 공지사항이 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
                              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <tr>
                                  <th className="w-16 border-b border-slate-200 px-3 py-3 text-center">
                                    번호
                                  </th>
                                  <th className="border-b border-slate-200 px-3 py-3">
                                    제목
                                  </th>
                                  <th className="w-24 border-b border-slate-200 px-3 py-3 text-center">
                                    등록자
                                  </th>
                                  <th className="w-28 border-b border-slate-200 px-3 py-3 text-center">
                                    등록일
                                  </th>
                                  <th className="w-20 border-b border-slate-200 px-3 py-3 text-center">
                                    조회수
                                  </th>
                                  <th className="w-48 border-b border-slate-200 px-3 py-3 text-center">
                                    관리
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {[
                                  ...pinnedNoticePosts.map(
                                    (post) => ({
                                      post,
                                      number: '공지',
                                    })
                                  ),
                                  ...paginatedAdminNoticePosts.map(
                                    (post, index) => ({
                                      post,
                                      number:
                                        regularNoticePosts.length -
                                        (
                                          (safeAdminNoticePage - 1) *
                                          noticePostsPerPage
                                        ) -
                                        index,
                                    })
                                  ),
                                ].map((item) => (
                                  <tr
                                    key={item.post.id}
                                    className="border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50"
                                  >
                                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                                      {item.number}
                                    </td>

                                    <td className="min-w-0 px-3 py-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        {item.post.isPinned && (
                                          <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                            고정
                                          </span>
                                        )}

                                        <span
                                          title={item.post.title}
                                          className="block min-w-0 flex-1 truncate text-sm font-semibold text-slate-800"
                                        >
                                          {item.post.title}
                                        </span>
                                      </div>
                                    </td>

                                    <td className="px-3 py-3 text-center text-xs text-slate-600">
                                      {item.post.authorName || '관리자'}
                                    </td>

                                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                                      {formatFirestoreDate(
                                        item.post.createdAt
                                      )}
                                    </td>

                                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                                      {Number(
                                        item.post.viewCount
                                      ) || 0}
                                    </td>

                                    <td className="px-3 py-3">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="whitespace-nowrap px-2.5 py-2 text-xs"
                                          onClick={() =>
                                            openNoticePostDialog(
                                              item.post
                                            )
                                          }
                                        >
                                          <Edit3 size={13} />
                                          수정
                                        </Button>

                                        <Button
                                          type="button"
                                          variant="dangerOutline"
                                          className="whitespace-nowrap px-2.5 py-2 text-xs"
                                          disabled={
                                            noticePostDeletingId ===
                                            item.post.id
                                          }
                                          onClick={() =>
                                            confirmDeleteNoticePost(
                                              item.post
                                            )
                                          }
                                        >
                                          <Trash2 size={13} />
                                          {noticePostDeletingId ===
                                          item.post.id
                                            ? '삭제 중'
                                            : '삭제'}
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {regularNoticePosts.length > 0 && (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminNoticePage <= 1
                                }
                                onClick={() =>
                                  setAdminNoticePage((prev) =>
                                    Math.max(1, prev - 1)
                                  )
                                }
                              >
                                이전
                              </Button>

                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeAdminNoticePage} / {adminNoticeTotalPages}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminNoticePage >=
                                  adminNoticeTotalPages
                                }
                                onClick={() =>
                                  setAdminNoticePage((prev) =>
                                    Math.min(
                                      adminNoticeTotalPages,
                                      prev + 1
                                    )
                                  )
                                }
                              >
                                다음
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                                    {/* FAQ 관리 탭 */}
                  {adminTab === 'faqPosts' && (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">
                            FAQ 관리
                          </h2>

                          <p className="mt-1 text-xs text-slate-500">
                            FAQ 카테고리와 질문·답변을 등록, 수정, 삭제하고 목록 표시 개수를 설정합니다.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="primary"
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={() =>
                            openFaqPostDialog()
                          }
                        >
                          <Plus size={14} />
                          FAQ 등록
                        </Button>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="border-b border-slate-200 pb-3">
                            <h3 className="text-sm font-bold text-slate-900">
                              FAQ 카테고리 관리
                            </h3>

                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              부서 관리와 같은 방식으로 카테고리를 등록, 수정, 삭제합니다.
                            </p>
                          </div>

                          <div className="mt-4 flex gap-2">
                            <input
                              value={newFaqCategoryName}
                              onChange={(event) =>
                                setNewFaqCategoryName(
                                  event.target.value
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  addFaqCategory();
                                }
                              }}
                              placeholder="새 FAQ 카테고리명"
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />

                            <Button
                              type="button"
                              className="shrink-0 px-3 py-2"
                              disabled={
                                faqCategorySavingId ===
                                'new'
                              }
                              onClick={addFaqCategory}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>

                          {!faqCategoriesReady ? (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                              카테고리를 불러오는 중입니다.
                            </div>
                          ) : faqCategoriesLoadErrorMessage ? (
                            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">
                              {faqCategoriesLoadErrorMessage}
                            </div>
                          ) : faqCategories.length === 0 ? (
                            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                              등록된 FAQ 카테고리가 없습니다.
                            </div>
                          ) : (
                            <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
                              {faqCategories.map(
                                (category) => {
                                  const categoryPostCount =
                                    faqPosts.filter(
                                      (post) =>
                                        post.categoryId ===
                                        category.id
                                    ).length;

                                  const isEditing =
                                    editingFaqCategoryId ===
                                    category.id;

                                  return (
                                    <div
                                      key={category.id}
                                      className="rounded-xl border border-slate-100 bg-white px-3.5 py-2 text-xs text-slate-700"
                                    >
                                      {isEditing ? (
                                        <div className="flex flex-col gap-2">
                                          <input
                                            value={
                                              editingFaqCategoryName
                                            }
                                            onChange={(event) =>
                                              setEditingFaqCategoryName(
                                                event.target.value
                                              )
                                            }
                                            onKeyDown={(event) => {
                                              if (
                                                event.key ===
                                                'Enter'
                                              ) {
                                                saveFaqCategoryName(
                                                  category
                                                );
                                              }

                                              if (
                                                event.key ===
                                                'Escape'
                                              ) {
                                                setEditingFaqCategoryId(
                                                  ''
                                                );
                                                setEditingFaqCategoryName(
                                                  ''
                                                );
                                              }
                                            }}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                          />

                                          <div className="flex justify-end gap-1">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              className="rounded-lg px-2 py-1 text-xs"
                                              disabled={
                                                faqCategorySavingId ===
                                                category.id
                                              }
                                              onClick={() =>
                                                saveFaqCategoryName(
                                                  category
                                                )
                                              }
                                            >
                                              <Save size={13} />
                                              적용
                                            </Button>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="rounded-lg px-2 py-1 text-xs"
                                              disabled={
                                                faqCategorySavingId ===
                                                category.id
                                              }
                                              onClick={() => {
                                                setEditingFaqCategoryId(
                                                  ''
                                                );
                                                setEditingFaqCategoryName(
                                                  ''
                                                );
                                              }}
                                            >
                                              <X size={13} />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="truncate font-semibold text-slate-800">
                                              {category.name}
                                            </div>

                                            <div className="mt-0.5 text-[10px] text-slate-400">
                                              FAQ {categoryPostCount}건
                                            </div>
                                          </div>

                                          <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="rounded-lg px-1 py-1 hover:bg-blue-50 hover:text-blue-600"
                                              onClick={() =>
                                                startEditFaqCategory(
                                                  category
                                                )
                                              }
                                            >
                                              <Edit3 size={14} />
                                            </Button>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="rounded-lg px-1 py-1 hover:bg-rose-50 hover:text-rose-600"
                                              disabled={
                                                faqCategoryDeletingId ===
                                                category.id
                                              }
                                              onClick={() =>
                                                confirmDeleteFaqCategory(
                                                  category
                                                )
                                              }
                                            >
                                              <Trash2 size={14} />
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                          <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900">
                                목록 표시 설정
                              </h3>

                              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                                상단 고정 FAQ는 제외하고 일반 FAQ만 설정한 개수만큼 한 페이지에 표시합니다.
                              </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-end">
                              <div className="w-full">
                                <Select
                                  label="페이지당 일반 FAQ 수"
                                  value={String(
                                    faqPostsPerPageInput
                                  )}
                                  onChange={(value) =>
                                    setFaqPostsPerPageInput(
                                      Number(value)
                                    )
                                  }
                                >
                                  {FAQ_POSTS_PER_PAGE_OPTIONS.map(
                                    (option) => (
                                      <option
                                        key={option}
                                        value={option}
                                      >
                                        {option}개
                                      </option>
                                    )
                                  )}
                                </Select>
                              </div>

                              <Button
                                type="button"
                                variant="primary"
                                className="h-10 w-full whitespace-nowrap px-4 text-xs"
                                disabled={
                                  !faqBoardConfigReady ||
                                  faqBoardConfigSaving
                                }
                                onClick={saveFaqBoardConfig}
                              >
                                <Save size={14} />
                                {faqBoardConfigSaving
                                  ? '저장 중'
                                  : '설정 저장'}
                              </Button>
                            </div>
                          </div>

                          {faqBoardConfigLoadErrorMessage && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                              {faqBoardConfigLoadErrorMessage}
                            </div>
                          )}
                        </div>
                      </div>

                      {!faqPostsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          FAQ를 불러오는 중입니다.
                        </div>
                      ) : faqPostsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {faqPostsLoadErrorMessage}
                        </div>
                      ) : faqPosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          등록된 FAQ가 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="overflow-hidden rounded-xl border border-slate-200">
                            <div className="grid grid-cols-[140px_minmax(0,1fr)_170px] border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                              <div className="px-4 py-3">
                                카테고리
                              </div>
                              <div className="px-4 py-3">
                                제목
                              </div>
                              <div className="px-4 py-3 text-center">
                                관리
                              </div>
                            </div>

                            {[
                              ...adminPinnedFaqPosts,
                              ...paginatedAdminFaqPosts,
                            ].map((post, index, displayedPosts) => {
                              const isExpanded =
                                adminExpandedFaqPostId ===
                                post.id;

                              return (
                                <div
                                  key={post.id}
                                  className={
                                    index <
                                    displayedPosts.length - 1
                                      ? 'border-b border-slate-100'
                                      : ''
                                  }
                                >
                                  <div className="grid grid-cols-[140px_minmax(0,1fr)_170px] items-center">
                                    <div className="px-4 py-3">
                                      <span className="inline-flex max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                        {faqCategoryNameById.get(
                                          post.categoryId
                                        ) || '미분류'}
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAdminFaqPost(
                                          post.id
                                        )
                                      }
                                      className="flex min-w-0 items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
                                    >
                                      {post.isPinned && (
                                        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                          고정
                                        </span>
                                      )}

                                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                                        {post.title}
                                      </span>

                                      <span className="shrink-0 text-base font-semibold text-slate-400">
                                        {isExpanded
                                          ? '−'
                                          : '+'}
                                      </span>
                                    </button>

                                    <div className="flex items-center justify-center gap-1.5 px-3 py-3">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="whitespace-nowrap px-2.5 py-2 text-xs"
                                        onClick={() =>
                                          openFaqPostDialog(
                                            post
                                          )
                                        }
                                      >
                                        <Edit3 size={13} />
                                        수정
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="dangerOutline"
                                        className="whitespace-nowrap px-2.5 py-2 text-xs"
                                        disabled={
                                          faqPostDeletingId ===
                                          post.id
                                        }
                                        onClick={() =>
                                          confirmDeleteFaqPost(
                                            post
                                          )
                                        }
                                      >
                                        <Trash2 size={13} />
                                        {faqPostDeletingId ===
                                        post.id
                                          ? '삭제 중'
                                          : '삭제'}
                                      </Button>
                                    </div>
                                  </div>

                                  <AnimatePresence initial={false}>
                                    {isExpanded && (
                                      <motion.div
                                        initial={{
                                          height: 0,
                                          opacity: 0,
                                        }}
                                        animate={{
                                          height: 'auto',
                                          opacity: 1,
                                        }}
                                        exit={{
                                          height: 0,
                                          opacity: 0,
                                        }}
                                        transition={{
                                          duration: 0.2,
                                        }}
                                        className="overflow-hidden"
                                      >
                                        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-5 text-sm leading-7 text-slate-700">
                                          <div className="whitespace-pre-wrap break-words">
                                            {post.content}
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>

                          {adminRegularFaqPosts.length > 0 && (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminFaqPage <= 1
                                }
                                onClick={() => {
                                  setAdminFaqPage((prev) =>
                                    Math.max(1, prev - 1)
                                  );
                                  setAdminExpandedFaqPostId('');
                                }}
                              >
                                이전
                              </Button>

                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeAdminFaqPage} / {adminFaqTotalPages}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminFaqPage >=
                                  adminFaqTotalPages
                                }
                                onClick={() => {
                                  setAdminFaqPage((prev) =>
                                    Math.min(
                                      adminFaqTotalPages,
                                      prev + 1
                                    )
                                  );
                                  setAdminExpandedFaqPostId('');
                                }}
                              >
                                다음
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* 회원 계정 승인·차단 관리 탭 */}
                  {adminTab === 'memberAccounts' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">
                          회원 계정 관리
                        </h2>

                        <p className="mt-1 text-xs text-slate-500">
                          신규 가입 승인, 이용 차단, 차단 해제와 이용 종료 상태를 관리합니다.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          [
                            '승인 대기',
                            adminUserAccountStatusCounts.pending,
                            'border-amber-200 bg-amber-50 text-amber-700',
                          ],
                          [
                            '활성',
                            adminUserAccountStatusCounts.active,
                            'border-emerald-200 bg-emerald-50 text-emerald-700',
                          ],
                          [
                            '차단',
                            adminUserAccountStatusCounts.blocked,
                            'border-rose-200 bg-rose-50 text-rose-700',
                          ],
                          [
                            '이용 종료',
                            adminUserAccountStatusCounts.retired,
                            'border-slate-200 bg-slate-100 text-slate-700',
                          ],
                        ].map(
                          ([
                            label,
                            count,
                            className,
                          ]) => (
                            <div
                              key={label}
                              className={`rounded-2xl border p-4 ${className}`}
                            >
                              <div className="text-xs font-semibold">
                                {label}
                              </div>

                              <div className="mt-1 text-2xl font-bold">
                                {count}
                              </div>
                            </div>
                          )
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
                            회원 검색
                          </span>

                          <div className="relative">
                            <Search
                              size={15}
                              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />

                            <input
                              value={
                                adminUserAccountQuery
                              }
                              onChange={(event) =>
                                setAdminUserAccountQuery(
                                  event.target.value
                                )
                              }
                              placeholder="이름, 이메일, 부서, 전화번호, UID"
                              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none mk-form-border-focus"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
                            상태
                          </span>

                          <select
                            value={
                              adminUserAccountStatusFilter
                            }
                            onChange={(event) =>
                              setAdminUserAccountStatusFilter(
                                event.target.value
                              )
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none mk-form-border-focus"
                          >
                            <option value="all">
                              전체
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.PENDING
                              }
                            >
                              승인 대기
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.ACTIVE
                              }
                            >
                              활성
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.BLOCKED
                              }
                            >
                              차단
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.RETIRED
                              }
                            >
                              이용 종료
                            </option>
                          </select>
                        </label>
                      </div>

                      {!adminUserAccountsReady ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          회원 계정 목록을 불러오는 중입니다.
                        </div>
                      ) : adminUserAccountsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-xs leading-5 text-rose-700">
                          {
                            adminUserAccountsLoadErrorMessage
                          }
                        </div>
                      ) : filteredManagedUserAccounts.length ===
                        0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          검색 조건에 맞는 회원 계정이 없습니다.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredManagedUserAccounts.map(
                            (account) => {
                              const accountStatus =
                                account.status || '';

                              const isSaving =
                                adminUserAccountSavingUid ===
                                account.uid;

                              const createdAtText =
                                typeof account.createdAt
                                  ?.toDate === 'function'
                                  ? account.createdAt
                                      .toDate()
                                      .toLocaleString(
                                        'ko-KR'
                                      )
                                  : '-';

                              return (
                                <div
                                  key={account.uid}
                                  className="rounded-2xl border border-slate-200 bg-white p-4"
                                >
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-bold text-slate-900">
                                          {account.name ||
                                            '이름 미등록'}
                                        </div>

                                        <span
                                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getUserAccountStatusClassName(
                                            accountStatus
                                          )}`}
                                        >
                                          {getUserAccountStatusLabel(
                                            accountStatus
                                          )}
                                        </span>
                                      </div>

                                      <div className="grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                                        <div>
                                          이메일:{' '}
                                          <span className="text-slate-800">
                                            {account.email ||
                                              '-'}
                                          </span>
                                        </div>

                                        <div>
                                          부서:{' '}
                                          <span className="text-slate-800">
                                            {account.team ||
                                              '-'}
                                          </span>
                                        </div>

                                        <div>
                                          전화번호:{' '}
                                          <span className="text-slate-800">
                                            {account.phone ||
                                              '-'}
                                          </span>
                                        </div>

                                        <div>
                                          가입일:{' '}
                                          <span className="text-slate-800">
                                            {createdAtText}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="break-all text-[10px] text-slate-400">
                                        UID: {account.uid}
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[330px] lg:justify-end">
                                      {accountStatus !==
                                        USER_PROFILE_STATUS.ACTIVE && (
                                        <Button
                                          variant="primary"
                                          className="px-3 py-2 text-xs"
                                          disabled={
                                            isSaving
                                          }
                                          onClick={() =>
                                            confirmUserAccountStatusChange(
                                              account,
                                              USER_PROFILE_STATUS.ACTIVE
                                            )
                                          }
                                        >
                                          <CheckCircle2
                                            size={14}
                                          />

                                          {accountStatus ===
                                          USER_PROFILE_STATUS.PENDING
                                            ? '가입 승인'
                                            : '이용 재개'}
                                        </Button>
                                      )}

                                      {accountStatus !==
                                        USER_PROFILE_STATUS.BLOCKED && (
                                        <Button
                                          variant="dangerOutline"
                                          className="px-3 py-2 text-xs"
                                          disabled={
                                            isSaving
                                          }
                                          onClick={() =>
                                            confirmUserAccountStatusChange(
                                              account,
                                              USER_PROFILE_STATUS.BLOCKED
                                            )
                                          }
                                        >
                                          <XCircle
                                            size={14}
                                          />
                                          이용 차단
                                        </Button>
                                      )}

                                      {accountStatus !==
                                        USER_PROFILE_STATUS.RETIRED && (
                                        <Button
                                          variant="outline"
                                          className="px-3 py-2 text-xs"
                                          disabled={
                                            isSaving
                                          }
                                          onClick={() =>
                                            confirmUserAccountStatusChange(
                                              account,
                                              USER_PROFILE_STATUS.RETIRED
                                            )
                                          }
                                        >
                                          <LogOut
                                            size={14}
                                          />
                                          이용 종료
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 관리자 ID 관리 탭 */}
                  {adminTab === 'adminAccounts' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">관리자 ID 관리</h2>
                        <p className="text-xs text-slate-500 mt-1">
                          공지사항 작성 권한과 관리자 모드 보안 강화를 위한 관리자 ID 등록 대장입니다.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 text-xs leading-5 text-orange-800">
                        신규 관리자 계정은 관리자모드에서 생성하되, 비밀번호 검증은 Firebase Authentication 이메일/비밀번호 방식으로 처리합니다.
                        기존 PBKDF2 관리자 계정은 이메일이 등록되어 있으면 로그인 성공 시 Firebase Auth 계정으로 자동 연결됩니다.
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                        <div className="mb-4">
                          <h3 className="text-base font-bold text-slate-900">관리자 ID 등록</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            조직명과 사용자명은 기존 부서·사용자 목록에서 선택하거나, 기타 직접 입력으로 공용 계정을 등록할 수 있습니다.
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Input
                            label="관리자 ID"
                            value={adminAccountForm.adminLoginId}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                adminLoginId: v,
                              })
                            }
                            placeholder="예: admin01"
                          />

                          <Input
                            label="초기 비밀번호"
                            type="password"
                            value={adminAccountForm.password}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                password: v,
                              })
                            }
                            placeholder="Firebase Auth 초기 비밀번호 입력"
                          />

                          <Select
                            label="조직명"
                            value={adminAccountForm.organizationName}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                organizationName: v,
                                customOrganizationName:
                                  v === ADMIN_CUSTOM_OPTION_VALUE
                                    ? adminAccountForm.customOrganizationName
                                    : '',
                                userName: '',
                                customUserName: '',
                              })
                            }
                          >
                            <option value="">조직 선택</option>
                            {(data.teams || []).map((team) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                            <option value={ADMIN_CUSTOM_OPTION_VALUE}>기타 직접 입력</option>
                          </Select>

                          {adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE ? (
                            <Input
                              label="조직명 직접 입력"
                              value={adminAccountForm.customOrganizationName}
                              onChange={(v) =>
                                setAdminAccountForm({
                                  ...adminAccountForm,
                                  customOrganizationName: v,
                                  userName: ADMIN_CUSTOM_OPTION_VALUE,
                                })
                              }
                              placeholder="예: 관리자, 기획1팀, 공용계정"
                            />
                          ) : (
                            <Select
                              label="사용자명"
                              value={adminAccountForm.userName}
                              onChange={(v) =>
                                setAdminAccountForm({
                                  ...adminAccountForm,
                                  userName: v,
                                  customUserName:
                                    v === ADMIN_CUSTOM_OPTION_VALUE
                                      ? adminAccountForm.customUserName
                                      : '',
                                })
                              }
                            >
                              <option value="">
                                {adminAccountForm.organizationName
                                  ? '사용자 선택'
                                  : '조직명을 먼저 선택해 주세요'}
                              </option>
                              {adminAccountUserOptions.map((borrower, index) => (
                                <option
                                  key={`${borrower.team}-${borrower.name}-${index}`}
                                  value={borrower.name}
                                >
                                  {borrower.name}
                                </option>
                              ))}
                              <option value={ADMIN_CUSTOM_OPTION_VALUE}>기타 직접 입력</option>
                            </Select>
                          )}

                          {(adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE ||
                            adminAccountForm.userName === ADMIN_CUSTOM_OPTION_VALUE) && (
                            <Input
                              label="사용자명 직접 입력"
                              value={adminAccountForm.customUserName}
                              onChange={(v) =>
                                setAdminAccountForm({
                                  ...adminAccountForm,
                                  customUserName: v,
                                  userName: ADMIN_CUSTOM_OPTION_VALUE,
                                })
                              }
                              placeholder="예: 관리자, 기획1팀 공용"
                            />
                          )}

                          <Input
                            label="로그인 이메일"
                            type="email"
                            value={adminAccountForm.email}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                email: v,
                              })
                            }
                            placeholder="예: admin@example.com"
                          />

                          <Input
                            label="전화번호"
                            value={adminAccountForm.phone}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                phone: v,
                              })
                            }
                            placeholder="예: 010-0000-0000"
                          />
                        </div>

                        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200/70 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setAdminAccountForm(createDefaultAdminAccountForm())}
                          >
                            입력 초기화
                          </Button>
                          <Button variant="primary" onClick={registerAdminAccount}>
                            관리자 ID 등록
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-end">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">관리자 ID 현황</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              한 페이지에 최대 {ADMIN_ACCOUNT_PAGE_SIZE}개까지 표시됩니다.
                            </p>
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            총 {(registeredAdminAccounts || []).length}개
                          </div>
                        </div>

                        {(registeredAdminAccounts || []).length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                            등록된 관리자 ID가 없습니다.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {paginatedAdminAccounts.map((account, index) => {
                                const isEditingAdminAccount = editingAdminAccountId === account.id;
                                const isCurrentAdminAccount = account.id === authenticatedAdminId;

                                return (
                                  <div
                                    key={account.id}
                                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                  >
                                    {isEditingAdminAccount ? (
                                      <div className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                          <Input
                                            label="관리자 ID"
                                            value={adminAccountEditForm.adminLoginId}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                adminLoginId: v,
                                              })
                                            }
                                            placeholder="관리자 ID 입력"
                                          />

                                          <Input
                                            label="로그인 이메일"
                                            type="email"
                                            value={adminAccountEditForm.email}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                email: v,
                                              })
                                            }
                                            disabled={Boolean(account.authUid)}
                                            placeholder={
                                              account.authUid
                                                ? 'Firebase Auth 연결 계정은 이메일 변경 불가'
                                                : '관리자 로그인 이메일 입력'
                                            }
                                          />

                                          <Input
                                            label="조직명"
                                            value={adminAccountEditForm.organizationName}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                organizationName: v,
                                              })
                                            }
                                            placeholder="조직명 입력"
                                          />

                                          <Input
                                            label="사용자명"
                                            value={adminAccountEditForm.userName}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                userName: v,
                                              })
                                            }
                                            placeholder="사용자명 입력"
                                          />

                                          <Input
                                            label="전화번호"
                                            value={adminAccountEditForm.phone}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                phone: v,
                                              })
                                            }
                                            placeholder="전화번호 입력"
                                          />

                                          <Input
                                            label="새 비밀번호"
                                            type="password"
                                            value={adminAccountEditForm.newPassword || ''}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                newPassword: v,
                                              })
                                            }
                                            disabled={Boolean(account.authUid) && !isCurrentAdminAccount}
                                            placeholder={
                                              account.authUid && !isCurrentAdminAccount
                                                ? '다른 Firebase Auth 계정은 직접 지정 불가'
                                                : '변경할 때만 입력'
                                            }
                                          />

                                          <Input
                                            label="새 비밀번호 확인"
                                            type="password"
                                            value={adminAccountEditForm.newPasswordConfirm || ''}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                newPasswordConfirm: v,
                                              })
                                            }
                                            disabled={Boolean(account.authUid) && !isCurrentAdminAccount}
                                            placeholder={
                                              account.authUid && !isCurrentAdminAccount
                                                ? '비밀번호 재설정 메일 사용'
                                                : '새 비밀번호 재입력'
                                            }
                                          />
                                        </div>

                                        {account.authUid && (
                                          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
                                            <p>
                                              Firebase Auth 연결 계정의 로그인 이메일은 클라이언트 관리자 화면에서 직접 변경하지 않습니다.
                                              {isCurrentAdminAccount
                                                ? ' 현재 로그인 중인 본인 계정은 새 비밀번호를 직접 변경할 수 있습니다.'
                                                : ' 다른 관리자 계정의 비밀번호는 직접 지정할 수 없으며, 재설정 메일 발송으로 변경합니다.'}
                                            </p>

                                            {!isCurrentAdminAccount && (
                                              <div className="flex justify-end">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="px-3 py-2 text-xs"
                                                  onClick={() => sendAdminAccountPasswordResetEmail(account)}
                                                >
                                                  비밀번호 재설정 메일 발송
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {!account.authUid && (
                                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
                                            기존 해시 계정은 새 비밀번호 입력 시 PBKDF2-SHA-256 방식으로 다시 저장됩니다.
                                          </div>
                                        )}

                                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="px-3 py-2 text-xs"
                                            onClick={cancelEditAdminAccount}
                                          >
                                            취소
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="primary"
                                            className="px-3 py-2 text-xs"
                                            onClick={() => saveAdminAccountEdit(account)}
                                          >
                                            저장
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                              #{(safeAdminAccountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE + index + 1}
                                            </span>
                                            <span className="text-sm font-bold text-slate-900">
                                              {account.adminLoginId}
                                            </span>
                                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                              {account.authUid ? 'Firebase Auth 연결' : '기존 해시 계정'}
                                            </span>
                                            {isCurrentAdminAccount && (
                                              <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold mk-brand-text">
                                                현재 로그인
                                              </span>
                                            )}
                                          </div>

                                          <div className="text-xs text-slate-600">
                                            조직명: <span className="font-semibold text-slate-800">{account.organizationName}</span>
                                            <span className="mx-1 text-slate-300">|</span>
                                            사용자명: <span className="font-semibold text-slate-800">{account.userName}</span>
                                          </div>

                                          <div className="text-[11px] text-slate-500">
                                            이메일: {account.authEmail || account.email || '미입력'}
                                            <span className="mx-1 text-slate-300">|</span>
                                            전화번호: {account.phone || '미입력'}
                                          </div>

                                          <div className="text-[10px] text-slate-400">
                                            등록일: {account.createdAt || '기록 없음'}
                                          </div>
                                        </div>

                                        <div className="flex shrink-0 gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="px-3 py-2 text-xs"
                                            onClick={() => startEditAdminAccount(account)}
                                          >
                                            수정
                                          </Button>

                                          <Button
                                            type="button"
                                            variant="danger"
                                            className="px-3 py-2 text-xs"
                                            disabled={isCurrentAdminAccount || (registeredAdminAccounts || []).length <= 1}
                                            onClick={() => deleteAdminAccount(account)}
                                          >
                                            삭제
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                              <Button
                                variant="outline"
                                disabled={safeAdminAccountPage <= 1}
                                onClick={() =>
                                  setAdminAccountPage((prev) => Math.max(1, prev - 1))
                                }
                                className="px-3 py-2 text-xs"
                              >
                                이전
                              </Button>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeAdminAccountPage} / {adminAccountTotalPages}
                              </div>
                              <Button
                                variant="outline"
                                disabled={safeAdminAccountPage >= adminAccountTotalPages}
                                onClick={() =>
                                  setAdminAccountPage((prev) =>
                                    Math.min(adminAccountTotalPages, prev + 1)
                                  )
                                }
                                className="px-3 py-2 text-xs"
                              >
                                다음
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* 기본 환경 설정 탭 */}
                  {adminTab === 'settings' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">시스템 설정</h2>
                        <p className="text-xs text-slate-500 mt-1">사용자 페이지의 소속 입력 모드 전환 및 최대 기한 제어가 즉각 가동됩니다.</p>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Select
                          label="부서/팀명 입력 유형 선택"
                          value={tempSettings.teamInputMode}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, teamInputMode: v })
                          }
                        >
                          <option value="dropdown">관리자 등록 부서 리스트</option>
                          <option value="text">신청인 자율 입력</option>
                        </Select>

                        <Select
                          label="사원/신청인 이름 입력 유형 선택"
                          value={tempSettings.borrowerInputMode}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, borrowerInputMode: v })
                          }
                        >
                          <option value="dropdown">관리자 등록 사원 리스트</option>
                          <option value="text">신청인 자율 입력</option>
                        </Select>

                        <Input
                          label="기본 최장 허용 대여 기한 (일수)"
                          type="number"
                          value={tempSettings.maxRentalDays}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, maxRentalDays: Number(v) })
                          }
                        />

                        <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-3.5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-slate-700">
                                기간이 겹치지 않으면 동일 기기 신청 허용
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                켜면 같은 기기라도 기존 신청 기간과 겹치지 않는 경우 추가 신청을 허용합니다. 끄면 기존처럼 기기가 신청중, 대여중, 보류 상태일 때 다른 신청을 막습니다.
                              </p>
                            </div>

                            <button
                              type="button"
                              aria-label="기간이 겹치지 않으면 동일 기기 신청 허용"
                              aria-pressed={tempAllowNonOverlappingSameAssetRequests}
                              onClick={() =>
                                setTempSettings({
                                  ...tempSettings,
                                  allowNonOverlappingSameAssetRequests:
                                    !tempAllowNonOverlappingSameAssetRequests,
                                })
                              }
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                tempAllowNonOverlappingSameAssetRequests
                                  ? 'mk-brand-gradient-r border-transparent'
                                  : 'border-slate-300 bg-slate-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                  tempAllowNonOverlappingSameAssetRequests
                                    ? 'translate-x-5'
                                    : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                            업무 종료/휴무일 기준 대여 시작일 다음 영업일로 조정
                          </div>
                          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="text-xs font-medium text-slate-500">사용여부</span>
                                <button
                                  type="button"
                                  aria-label="업무 종료/휴무일 기준 대여 시작일 다음 영업일로 조정 사용 여부"
                                  aria-pressed={tempBusinessDayAdjustmentEnabled}
                                  onClick={() => {
                                    const nextValue = !tempBusinessDayAdjustmentEnabled;

                                    setTempSettings({
                                      ...tempSettings,
                                      adjustStartDateAfterWorkEnd: nextValue,
                                      adjustStartDateToNextBusinessDay: nextValue,
                                    });
                                  }}
                                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                    tempBusinessDayAdjustmentEnabled
                                      ? 'mk-brand-gradient-r border-transparent'
                                      : 'border-slate-300 bg-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                      tempBusinessDayAdjustmentEnabled
                                        ? 'translate-x-5'
                                        : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <span className="shrink-0 text-xs font-medium text-slate-500">업무 종료 시간</span>
                                <input
                                  type="time"
                                  value={tempSettings.workEndTime || DEFAULT_WORK_END_TIME}
                                  disabled={!tempBusinessDayAdjustmentEnabled}
                                  onChange={(e) =>
                                    setTempSettings({
                                      ...tempSettings,
                                      workEndTime: e.target.value || DEFAULT_WORK_END_TIME,
                                    })
                                  }
                                  className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition mk-form-focus sm:w-36 ${
                                    tempBusinessDayAdjustmentEnabled
                                      ? 'bg-white text-slate-900'
                                      : 'cursor-not-allowed bg-slate-100 text-slate-400'
                                  }`}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                <span className="text-xs font-medium text-slate-600">토요일/일요일 제외</span>
                                <input
                                  type="checkbox"
                                  checked={tempSettings.excludeWeekendsForStartDate ?? DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE}
                                  disabled={!tempBusinessDayAdjustmentEnabled}
                                  onChange={(e) =>
                                    setTempSettings({
                                      ...tempSettings,
                                      excludeWeekendsForStartDate: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4"
                                />
                              </label>

                              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                <span className="text-xs font-medium text-slate-600">등록 휴일 제외</span>
                                <input
                                  type="checkbox"
                                  checked={tempSettings.excludeHolidaysForStartDate ?? DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE}
                                  disabled={!tempBusinessDayAdjustmentEnabled}
                                  onChange={(e) =>
                                    setTempSettings({
                                      ...tempSettings,
                                      excludeHolidaysForStartDate: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4"
                                />
                              </label>
                            </div>

                            <p className="text-[11px] leading-relaxed text-slate-500">
                              사용 시 업무 종료 시간 이후, 주말, 등록된 공휴일/임시공휴일/회사휴일에는 대여 시작일이 다음 영업일로 자동 조정됩니다.
                            </p>
                          </div>
                        </div>

                        <div className="sm:col-span-2 space-y-3">
                          <div className="border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-bold text-slate-900">휴일 관리</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              법정공휴일/임시공휴일은 정적 JSON 파일에서 자동 불러오고, 매일경제 자체 휴일은 직접 등록해 주세요. 불러온 휴일도 변경사항 저장을 눌러야 최종 반영됩니다.
                            </p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-blue-900">법정/임시공휴일 자동 불러오기</h4>
                                <p className="mt-1 text-[11px] leading-relaxed text-blue-700">
                                  public/holidays 폴더에 생성된 연도별 JSON 파일을 불러와 임시 휴일 목록에 병합합니다. 회사휴일/수동등록 휴일은 덮어쓰지 않습니다.
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                  type="number"
                                  min="2000"
                                  max="2100"
                                  value={holidayImportYear}
                                  onChange={(e) => setHolidayImportYear(e.target.value)}
                                  className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus sm:w-28"
                                />

                                <Button
                                  onClick={importKoreanPublicHolidaysFromJson}
                                  disabled={holidayImportLoading}
                                  variant="outline"
                                  className="px-3 py-2.5 text-xs bg-white"
                                >
                                  <ClipboardList size={14} />
                                  {holidayImportLoading ? '불러오는 중' : '자동 불러오기'}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-[150px_130px_minmax(0,1fr)_auto]">
                            <input
                              type="date"
                              value={newHolidayDate}
                              onChange={(e) => setNewHolidayDate(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                            />

                            <select
                              value={newHolidayType}
                              onChange={(e) => setNewHolidayType(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                            >
                              <option value="public">법정공휴일</option>
                              <option value="temporary">임시공휴일</option>
                              <option value="company">회사휴일</option>
                              <option value="manual">수동등록</option>
                            </select>

                            <input
                              value={newHolidayName}
                              onChange={(e) => setNewHolidayName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addTempHoliday();
                                }
                              }}
                              placeholder="휴일명 입력 예: 신정, 창립기념 휴무"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none mk-form-border-focus"
                            />

                            <Button
                              onClick={addTempHoliday}
                              className="px-3 py-2.5 text-xs"
                            >
                              <Plus size={14} /> 추가
                            </Button>
                          </div>

                          <div className="space-y-1 max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
                            {tempHolidayList.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                                현재 등록된 휴일이 없습니다.
                              </div>
                            ) : (
                              tempHolidayList.map((holiday, index) => (
                                <div
                                  key={`${holiday.date}-${holiday.name}-${index}`}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-2 text-xs text-slate-700"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-900">
                                      {formatDateWithKoreanWeekday(holiday.date)}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500">
                                      {holiday.name || '휴일'} · {HOLIDAY_TYPE_LABEL[holiday.type] || '휴일'}
                                    </div>
                                  </div>

                                  <Button
                                    onClick={() => deleteTempHoliday(index)}
                                    variant="ghost"
                                    className="shrink-0 px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-100 p-4 border border-slate-200/50 text-xs text-slate-600">
                        💡 <b>운영 권장사항 안내:</b> 실제 사내 보안망 연동 개발 단계에서는 AD 연동 인증, 부서별 허용 기한 할당제, Slack/Alimtalk 실시간 전송, 지연 지연자 메일 자동 발송 모듈을 접목하여 완벽한 자동화를 꾀할 수 있습니다.
                      </div>

                      {isSplitStorageReady ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle2
                              size={18}
                              className="mt-0.5 shrink-0 text-emerald-600"
                            />
                            <div>
                              <h3 className="text-sm font-bold text-emerald-900">
                                Firestore 분리 저장소 전환 완료
                              </h3>
                              <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                                현재 서비스는 rentalSystem/publicConfig,
                                rentalAssets, rentalAvailability,
                                rentalBorrowers, rentalRequests 컬렉션을
                                직접 사용합니다. laptopRentalDashboard/main은
                                더 이상 읽거나 저장하지 않습니다.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="text-sm font-bold text-amber-900">
                                Firestore 분리 저장소 최종 전환
                              </h3>

                              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                                1차 복사된 자산과 진행 중 예약을 검증하고,
                                자산별 예약 잠금 데이터와 자산관리번호
                                중복 방지 레지스트리를 생성합니다. 완료 전에는
                                신청 및 관리자 데이터 변경이 차단됩니다.
                              </p>

                              <div className="mt-2 text-[11px] text-amber-700">
                                검증 대상: 자산 {data.laptops.length}건 ·
                                진행 중 예약 {data.requests.length}건 ·
                                대여자 {data.borrowers.length}건
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              disabled={splitStorageFinalizeLoading}
                              onClick={() => {
                                triggerConfirm(
                                  'Firestore 분리 저장소 최종 전환',
                                  '신규 컬렉션 데이터를 최종 검증하고 자산별 예약 잠금 및 자산관리번호 레지스트리를 생성합니다. 현재 시스템 운영이 중지된 상태에서 한 번만 실행하세요. 계속하시겠습니까?',
                                  finalizeSplitStorageMigration
                                );
                              }}
                              className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                            >
                              <Save size={14} />
                              {splitStorageFinalizeLoading
                                ? '최종 전환 중'
                                : '분리 저장소 최종 전환'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* 하단 저장 및 취소 액션 버튼 컨테이너 추가 */}
                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTempSettings(data.settings);
                            setNewHolidayDate(today());
                            setNewHolidayName('');
                            setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
                            setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
                            setHolidayImportLoading(false);
                            triggerToast('설정 변경사항이 취소되고 이전 상태로 복원되었습니다.', 'success');
                          }}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveSystemSettings}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          )
        )}
      </main>

      {adminRequestEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  대여 신청정보 수정
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  관리자 수정에는 최대 대여 가능일 14일 제한을 적용하지 않습니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdminRequestEditDialog}
                disabled={adminRequestEditSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {data.settings.teamInputMode === 'dropdown' ? (
                <Select
                  label="부서 / 팀"
                  value={adminRequestEditForm.team}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        team: value,
                        borrower: '',
                      })
                    )
                  }
                >
                  <option value="">
                    팀 선택
                  </option>
                  {(data.teams || []).map(
                    (team) => (
                      <option
                        key={team}
                        value={team}
                      >
                        {team}
                      </option>
                    )
                  )}
                </Select>
              ) : (
                <Input
                  label="부서 / 팀"
                  value={adminRequestEditForm.team}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        team: value,
                      })
                    )
                  }
                />
              )}

              {data.settings.borrowerInputMode === 'dropdown' ? (
                <Select
                  label="대여자명"
                  value={adminRequestEditForm.borrower}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        borrower: value,
                      })
                    )
                  }
                >
                  <option value="">
                    {adminRequestEditForm.team
                      ? '대여자 선택'
                      : '소속 부서를 먼저 선택해 주세요'}
                  </option>

                  {adminRequestEditBorrowers.map(
                    (borrower) => (
                      <option
                        key={`${borrower.id}-${borrower.name}`}
                        value={borrower.name}
                      >
                        {borrower.name}
                      </option>
                    )
                  )}
                </Select>
              ) : (
                <Input
                  label="대여자명"
                  value={adminRequestEditForm.borrower}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        borrower: value,
                      })
                    )
                  }
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateInputWithWeekday
                  label="대여 시작일"
                  value={adminRequestEditForm.startDate}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        startDate: value,
                        dueDate:
                          prev.dueDate < value
                            ? value
                            : prev.dueDate,
                      })
                    )
                  }
                />

                <DateInputWithWeekday
                  label="반납 예정일"
                  value={adminRequestEditForm.dueDate}
                  min={adminRequestEditForm.startDate}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        dueDate: value,
                      })
                    )
                  }
                />
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  대여 목적
                </span>
                <textarea
                  value={adminRequestEditForm.purpose}
                  onChange={(event) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        purpose:
                          event.target.value,
                      })
                    )
                  }
                  className="h-28 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  관리자 메모
                </span>
                <textarea
                  value={adminRequestEditForm.adminMemo}
                  onChange={(event) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        adminMemo:
                          event.target.value,
                      })
                    )
                  }
                  className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adminRequestEditSaving}
                onClick={closeAdminRequestEditDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={adminRequestEditSaving}
                onClick={saveAdminRequestEdit}
              >
                {adminRequestEditSaving
                  ? '저장 중...'
                  : '수정 저장'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {adminRequestRestoreDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  신청 상태 되돌리기
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  활성 상태로 복구할 때 자산 예약 정보를 다시 생성하고 다른 예약과의 충돌을 검사합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdminRequestRestoreDialog}
                disabled={adminRequestRestoreSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  복구할 상태
                </span>
                <select
                  value={adminRequestRestoreTarget}
                  onChange={(event) =>
                    setAdminRequestRestoreTarget(
                      event.target.value
                    )
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
                >
                  {(adminRequestRestoreDialog.targetOptions || []).map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  복구 사유
                </span>
                <textarea
                  value={adminRequestRestoreReason}
                  onChange={(event) =>
                    setAdminRequestRestoreReason(
                      event.target.value
                    )
                  }
                  placeholder="잘못 처리한 이유와 복구가 필요한 사유를 입력해 주세요."
                  className="h-28 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                관리자 복구에는 최대 14일 제한을 적용하지 않습니다. 다만 날짜 순서 오류와 동일 기기의 다른 활성 예약 충돌은 차단됩니다.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adminRequestRestoreSaving}
                onClick={closeAdminRequestRestoreDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={adminRequestRestoreSaving}
                onClick={restoreAdminRequestStatus}
              >
                {adminRequestRestoreSaving
                  ? '복구 중...'
                  : '상태 복구'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

            {userActionDialog && activeUserActionRentalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {getUserRequestActionLabel(
                    userActionDialog.type
                  )}
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {activeUserActionRentalRequest.assetNo} ·{' '}
                  {activeUserActionRentalRequest.startDate} ~{' '}
                  {activeUserActionRentalRequest.dueDate}
                </p>
              </div>

              <button
                type="button"
                onClick={closeUserActionDialog}
                disabled={userActionSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {userActionDialog.type ===
                USER_REQUEST_ACTION.CHANGE && (
                <>
                  {data.settings.teamInputMode === 'dropdown' ? (
                    <Select
                      label="변경할 부서 / 팀"
                      value={userActionForm.team}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          team: value,
                          borrower: '',
                        }))
                      }
                    >
                      <option value="">팀 선택</option>
                      {(data.teams || []).map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="변경할 부서 / 팀"
                      value={userActionForm.team}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          team: value,
                        }))
                      }
                    />
                  )}

                  {data.settings.borrowerInputMode === 'dropdown' ? (
                    <Select
                      label="변경할 대여자명"
                      value={userActionForm.borrower}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          borrower: value,
                        }))
                      }
                    >
                      <option value="">
                        {userActionForm.team
                          ? '대여자 선택'
                          : '소속 부서를 먼저 선택해 주세요'}
                      </option>

                      {userActionBorrowers.map((borrower) => (
                        <option
                          key={`${borrower.id}-${borrower.name}`}
                          value={borrower.name}
                        >
                          {borrower.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="변경할 대여자명"
                      value={userActionForm.borrower}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          borrower: value,
                        }))
                      }
                    />
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DateInputWithWeekday
                      label="변경할 대여 시작일"
                      value={userActionForm.startDate}
                      min={today()}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          startDate: value,
                          dueDate:
                            prev.dueDate < value
                              ? value
                              : prev.dueDate,
                        }))
                      }
                    />

                    <DateInputWithWeekday
                      label="변경할 반납 예정일"
                      value={userActionForm.dueDate}
                      min={userActionForm.startDate}
                      max={addDaysFrom(
                        userActionForm.startDate,
                        data.settings.maxRentalDays
                      )}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          dueDate: value,
                        }))
                      }
                    />
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      변경할 대여 목적
                    </span>

                    <textarea
                      value={userActionForm.purpose}
                      onChange={(event) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          purpose: event.target.value,
                        }))
                      }
                      className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                    />
                  </label>
                </>
              )}

              {userActionDialog.type ===
                USER_REQUEST_ACTION.EXTEND && (
                <DateInputWithWeekday
                  label="연장 요청 반납일"
                  value={userActionForm.dueDate}
                  min={addDaysFrom(
                    activeUserActionRentalRequest.dueDate,
                    1
                  )}
                  max={addDaysFrom(
                    activeUserActionRentalRequest.startDate,
                    data.settings.maxRentalDays
                  )}
                  onChange={(value) =>
                    setUserActionForm((prev) => ({
                      ...prev,
                      dueDate: value,
                    }))
                  }
                />
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  요청 사유
                </span>

                <textarea
                  value={userActionForm.reason}
                  onChange={(event) =>
                    setUserActionForm((prev) => ({
                      ...prev,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="관리자가 검토할 수 있도록 요청 사유를 입력해 주세요."
                  className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={userActionSaving}
                onClick={closeUserActionDialog}
              >
                닫기
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={userActionSaving}
                onClick={submitUserActionRequest}
              >
                {userActionSaving
                  ? '저장 중...'
                  : '요청 제출'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

            {faqPostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  FAQ{' '}
                  {faqPostDialog.mode === 'edit'
                    ? '수정'
                    : '등록'}
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  FAQ 작성과 수정은 관리자 모드에서만 가능합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeFaqPostDialog}
                disabled={faqPostSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Select
                label="카테고리"
                value={faqPostForm.categoryId}
                onChange={(value) =>
                  setFaqPostForm(
                    (prev) => ({
                      ...prev,
                      categoryId: value,
                    })
                  )
                }
              >
                <option value="">
                  카테고리 선택
                </option>

                {faqCategories.map(
                  (category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  )
                )}
              </Select>

              <Input
                label="제목"
                value={faqPostForm.title}
                onChange={(value) =>
                  setFaqPostForm(
                    (prev) => ({
                      ...prev,
                      title: value,
                    })
                  )
                }
                placeholder="FAQ 질문 제목을 입력해 주세요."
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  본문
                </span>

                <textarea
                  value={faqPostForm.content}
                  onChange={(event) =>
                    setFaqPostForm(
                      (prev) => ({
                        ...prev,
                        content:
                          event.target.value,
                      })
                    )
                  }
                  placeholder="FAQ 답변 내용을 입력해 주세요."
                  className="h-56 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    faqPostForm.isPinned
                  }
                  onChange={(event) =>
                    setFaqPostForm(
                      (prev) => ({
                        ...prev,
                        isPinned:
                          event.target.checked,
                      })
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />

                <div>
                  <div className="text-xs font-bold text-slate-800">
                    목록 상단에 고정
                  </div>

                  <div className="mt-0.5 text-[10px] text-slate-500">
                    상단 고정 FAQ는 페이지당 일반 FAQ 수에 포함되지 않습니다.
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={faqPostSaving}
                onClick={closeFaqPostDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={faqPostSaving}
                onClick={saveFaqPost}
              >
                {faqPostSaving
                  ? '저장 중...'
                  : faqPostDialog.mode ===
                      'edit'
                    ? '수정 저장'
                    : 'FAQ 등록'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {noticePostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  공지사항{' '}
                  {noticePostDialog.mode === 'edit'
                    ? '수정'
                    : '등록'}
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  공지사항 작성과 수정은 관리자 모드에서만 가능합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeNoticePostDialog}
                disabled={noticePostSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Input
                label="제목"
                value={noticePostForm.title}
                onChange={(value) =>
                  setNoticePostForm(
                    (prev) => ({
                      ...prev,
                      title: value,
                    })
                  )
                }
                placeholder="공지사항 제목을 입력해 주세요."
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  내용
                </span>

                <textarea
                  value={noticePostForm.content}
                  onChange={(event) =>
                    setNoticePostForm(
                      (prev) => ({
                        ...prev,
                        content:
                          event.target.value,
                      })
                    )
                  }
                  placeholder="공지사항 내용을 입력해 주세요."
                  className="h-56 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    noticePostForm.isPinned
                  }
                  onChange={(event) =>
                    setNoticePostForm(
                      (prev) => ({
                        ...prev,
                        isPinned:
                          event.target.checked,
                      })
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />

                <div>
                  <div className="text-xs font-bold text-slate-800">
                    목록 상단에 고정
                  </div>

                  <div className="mt-0.5 text-[10px] text-slate-500">
                    상단 고정 게시글은 페이지당 일반 게시글 수에 포함되지 않습니다.
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={noticePostSaving}
                onClick={closeNoticePostDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={noticePostSaving}
                onClick={saveNoticePost}
              >
                {noticePostSaving
                  ? '저장 중...'
                  : noticePostDialog.mode ===
                      'edit'
                    ? '수정 저장'
                    : '공지사항 등록'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* --- 모던 Custom Toast (iframe 환경 완벽 최적화) --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4.5 py-3.5 shadow-xl border text-xs font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-100/40'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100/40'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="text-rose-600" size={18} />
            ) : (
              <CheckCircle2 className="text-emerald-600" size={18} />
            )}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 모던 Custom Confirm Modal (iframe 차단 방지) --- */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmModal(null)} className="rounded-xl px-4 py-2">
                취소
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="rounded-xl px-4 py-2"
              >
                확인 및 실행
              </Button>
            </div>
          </motion.div>
        </div>
      )}
      </div>

      {showFirebaseLoadingOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/10 px-6 font-sans text-slate-900 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl mk-brand-gradient-tr text-white mk-brand-shadow-md">
              <Laptop size={24} />
            </div>
            <h1 className="text-base font-bold text-slate-900">
              데이터를 불러오는 중입니다.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Firebase 원격 DB 기준으로 데이터를 불러오고 있습니다. 잠시만 기다려 주십시오.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// 간단한 자물쇠/잠금용 인라인 SVG 아이콘
function LockIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  );
}

export default App;