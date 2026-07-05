import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
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
  Info
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyA-hQv4mZwrTWUn10aiS3QSLgwSWzBNds0",
  authDomain: "laptop-system-mk.firebaseapp.com",
  projectId: "laptop-system-mk",
  storageBucket: "laptop-system-mk.firebasestorage.app",
  messagingSenderId: "978421108190",
  appId: "1:978421108190:web:6bc9af49a57471ae2a614f"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const DATA_DOC_REF = doc(db, 'laptopRentalDashboard', 'main');

// --- 상태 및 스타일 정의 ---
const STATUS = {
  AVAILABLE: '대여가능',
  REQUESTED: '신청중',
  APPROVED: '대여중',
  ON_HOLD: '보류',
  DENIED: '불허',
  RETURNED: '반납완료',
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
  '보류': 'bg-purple-50 text-purple-700 border-purple-200',
  '불허': 'bg-rose-50 text-rose-700 border-rose-200',
  '반납완료': 'bg-slate-100 text-slate-700 border-slate-200',
  '대여불가': 'bg-rose-100 text-rose-800 border-rose-300',
};

const RENTAL_BLOCKING_REQUEST_STATUSES = [
  STATUS.REQUESTED,
  STATUS.APPROVED,
  STATUS.ON_HOLD,
];

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

const getDisplayRentalStatus = (status, startDate) => {
  if (status === STATUS.APPROVED && startDate && startDate > today()) {
    return DISPLAY_STATUS.RESERVED;
  }

  return status || STATUS.AVAILABLE;
};

const getLaptopAdminDisplayStatus = (laptop, requests = []) => {
  if (!laptop) {
    return STATUS.UNAVAILABLE;
  }

  if (laptop.status === STATUS.UNAVAILABLE) {
    return STATUS.UNAVAILABLE;
  }

  const currentRequest =
    requests.find((request) => request.id === laptop.currentRequestId) ||
    findSameAssetBlockingRequest(requests, laptop.id);

  if (!currentRequest) {
    return STATUS.AVAILABLE;
  }

  return getDisplayRentalStatus(currentRequest.status, currentRequest.startDate);
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
  return borrowers.map((borrower, index) => {
    if (typeof borrower === 'string') {
      return { name: borrower, team: teams[index % teams.length] || '' };
    }
    return { name: borrower.name || '', team: borrower.team || teams[0] || '' };
  });
}

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

  return {
    ...parsed,
    assetCategories,
    settings,
    laptops: (parsed.laptops || []).map((asset) => ({
      ...asset,
      category: asset.category || assetCategories[0] || '노트북',
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
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-2xl p-3 border ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}>
          <Icon className={toneMap[tone].split(' ')[1]} size={22} />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
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

function App() {
  const [data, setData] = useState(initialData);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseLoadErrorMessage, setFirebaseLoadErrorMessage] = useState('');
  const applyingRemoteRef = useRef(false);
  const initializedRemoteFormRef = useRef(false);
  const lastSyncedDataRef = useRef('');
  const saveTimerRef = useRef(null);
  const allowFirebaseWriteRef = useRef(false);
  const [view, setView] = useState('user'); // 'user' | 'admin'
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

  // Toast 메시지 상태
  const [toast, setToast] = useState(null);
  // 커스텀 모달 확인창 상태
  const [confirmModal, setConfirmModal] = useState(null);

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
    const unsubscribe = onSnapshot(
      DATA_DOC_REF,
      async (snapshot) => {
        try {
          if (!snapshot.exists()) {
            const message = 'Firebase 원격 데이터 문서가 없습니다. 기본 데이터로 자동 초기화하지 않도록 저장을 차단했습니다. Firestore의 laptopRentalDashboard/main 문서를 확인해 주세요.';

            allowFirebaseWriteRef.current = false;
            setFirebaseLoadErrorMessage(message);
            setFirebaseReady(true);
            setToast({
              message,
              type: 'error'
            });
            return;
          }

          const remotePayload = snapshot.data();
          const remoteData = mergePersistedData(remotePayload.data || remotePayload);
          const remoteJson = JSON.stringify(remoteData);

          allowFirebaseWriteRef.current = true;
          setFirebaseLoadErrorMessage('');

          if (remoteJson === lastSyncedDataRef.current) {
            setFirebaseReady(true);
            return;
          }

          lastSyncedDataRef.current = remoteJson;
          applyingRemoteRef.current = true;
          setData(remoteData);

          if (!initializedRemoteFormRef.current) {
            setForm(createDefaultRequestForm(remoteData.settings));
            setTempSettings(remoteData.settings);
            initializedRemoteFormRef.current = true;
          }

          setFirebaseReady(true);
        } catch (error) {
          const message = 'Firebase 데이터 동기화 처리 중 오류가 발생했습니다. 원격 DB 보호를 위해 저장을 차단했습니다. 콘솔과 Firestore 규칙을 확인해 주세요.';

          console.error('Firebase snapshot handling error:', error);
          allowFirebaseWriteRef.current = false;
          setFirebaseLoadErrorMessage(message);
          setFirebaseReady(true);
          setToast({
            message,
            type: 'error'
          });
        }
      },
      (error) => {
        const message = 'Firebase 연결 또는 권한 오류가 발생했습니다. 원격 DB 보호를 위해 저장을 차단했습니다. Firestore Database 생성 여부와 보안 규칙을 확인해 주세요.';

        console.error('Firebase sync error:', error);
        allowFirebaseWriteRef.current = false;
        setFirebaseLoadErrorMessage(message);
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error'
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const dataJson = JSON.stringify(data);

    if (!firebaseReady || !allowFirebaseWriteRef.current) return;

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    if (dataJson === lastSyncedDataRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      lastSyncedDataRef.current = dataJson;

      setDoc(DATA_DOC_REF, { data, updatedAt: serverTimestamp() }).catch((error) => {
        lastSyncedDataRef.current = '';
        console.error('Firebase save error:', error);
        setToast({ message: 'Firebase 저장에 실패했습니다. Firestore 보안 규칙과 네트워크 상태를 확인해 주세요.', type: 'error' });
      });
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [data, firebaseReady]);

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

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
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

  const saveTempAssetCategoryChanges = () => {
    const nextAssetCategories = tempAssetCategories
      .map((category) => String(category || '').trim())
      .filter(Boolean);

    const duplicatedCategory = nextAssetCategories.find(
      (category, index) => nextAssetCategories.indexOf(category) !== index
    );

    if (duplicatedCategory) {
      triggerToast(`[${duplicatedCategory}] 카테고리명이 중복되어 저장할 수 없습니다.`, 'error');
      return;
    }

    setData((prev) => ({
      ...prev,
      assetCategories: nextAssetCategories,
      laptops: prev.laptops.map((asset) => ({
        ...asset,
        category: tempAssetCategoryRenameMap[asset.category] || asset.category,
      })),
    }));

    setSelectedAssetCategory('전체');
    setAdminSelectedAssetCategory('전체');
    setTempAssetCategories(nextAssetCategories);
    setTempAssetCategoryRenameMap({});
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    setDraggingAssetCategoryIndex(null);
    triggerToast('자산 카테고리 변경사항이 원장에 성공적으로 저장 및 반영되었습니다.', 'success');
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

  const saveTempPeopleChanges = () => {
    const nextTeams = tempTeams
      .map((team) => String(team || '').trim())
      .filter(Boolean);

    const duplicatedTeam = nextTeams.find(
      (team, index) => nextTeams.indexOf(team) !== index
    );

    if (duplicatedTeam) {
      triggerToast(`[${duplicatedTeam}] 부서명이 중복되어 저장할 수 없습니다.`, 'error');
      return;
    }

    const nextBorrowers = tempBorrowers
      .map((borrower) => ({
        name: String(borrower.name || '').trim(),
        team: String(borrower.team || '').trim(),
      }))
      .filter((borrower) => borrower.name && borrower.team && nextTeams.includes(borrower.team));

    const duplicatedBorrower = nextBorrowers.find(
      (borrower, index) =>
        nextBorrowers.findIndex(
          (item) => item.team === borrower.team && item.name === borrower.name
        ) !== index
    );

    if (duplicatedBorrower) {
      triggerToast(`[${duplicatedBorrower.team}] ${duplicatedBorrower.name} 사용자명이 중복되어 저장할 수 없습니다.`, 'error');
      return;
    }

    setData((prev) => ({
      ...prev,
      teams: nextTeams,
      borrowers: nextBorrowers,
    }));

    setTempTeams(nextTeams);
    setTempBorrowers(nextBorrowers);
    setEditingTeamIndex(null);
    setEditingTeamName('');
    setDraggingTeamIndex(null);
    setEditingBorrowerIndex(null);
    setEditingBorrowerName('');
    setDraggingBorrowerIndex(null);
    setNewTeam('');
    setNewBorrower('');
    setNewBorrowerTeam('전체');
    triggerToast('부서·사용자 변경사항이 원장에 성공적으로 저장 및 반영되었습니다.', 'success');
  };

  const blockedLaptopIds = useMemo(() => {
    return new Set(
      data.requests
        .filter((r) => ['신청중', '대여중', '보류'].includes(r.status))
        .map((r) => r.laptopId)
    );
  }, [data.requests]);

  const stats = useMemo(() => ({
    total: data.laptops.length,
    available: data.laptops.filter((l) => !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE).length,
    requested: data.requests.filter((r) => r.status === STATUS.REQUESTED).length,
    approved: data.requests.filter((r) => r.status === STATUS.APPROVED).length,
    overdue: data.requests.filter((r) => r.status === STATUS.APPROVED && r.dueDate < today()).length,
  }), [data, blockedLaptopIds]);

  const filteredLaptops = data.laptops.filter((l) => {
    const laptopAvailability = getLaptopRentalAvailability(
      l,
      data.requests,
      data.settings,
      form.startDate,
      form.dueDate
    );

    const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
      .toLowerCase()
      .includes(query.toLowerCase());

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

  const adminFilteredLaptops = data.laptops.filter((l) => {
    const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
      .toLowerCase()
      .includes(adminLaptopQuery.toLowerCase());

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

  const submitRequest = () => {
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

    const requestId = `REQ-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      laptops: prev.laptops.map((l) =>
        l.id === selectedLaptop.id ? { ...l, status: STATUS.REQUESTED, currentRequestId: requestId } : l
      ),
      requests: [
        {
          id: requestId,
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
          requestedAt: new Date().toLocaleString('ko-KR'),
        },
        ...prev.requests,
      ],
    }));

    setSelectedLaptopId(null);
    setForm(createDefaultRequestForm(data.settings));
    triggerToast('대여 신청이 성공적으로 접수되었습니다. 관리자 승인을 대기합니다.', 'success');
  };

  const updateRequest = (id, status) => {
    setData((prev) => {
      const req = prev.requests.find((r) => r.id === id);
      if (!req) return prev;
      return {
        ...prev,
        requests: prev.requests.map((r) => (r.id === id ? { ...r, status } : r)),
        laptops: prev.laptops.map((l) =>
          l.id === req.laptopId
            ? {
                ...l,
                status: status === STATUS.DENIED || status === STATUS.RETURNED ? STATUS.AVAILABLE : status,
                currentRequestId: status === STATUS.DENIED || status === STATUS.RETURNED ? null : id,
              }
            : l
        ),
      };
    });
    triggerToast(`상태가 [${status}]로 업데이트 되었습니다.`, 'success');
  };

  const updateRequestMemo = (id, memo) => {
    setData((prev) => ({
      ...prev,
      requests: prev.requests.map((r) => (r.id === id ? { ...r, adminMemo: memo } : r)),
    }));
  };

  // 신규 노트북 자산 생성 제어 로직
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
  
  const createLaptop = () => {
    if (!newLaptop.assetNo.trim()) {
      triggerToast('자산 관리 번호를 정확히 입력해 주세요.', 'error');
      return;
    }
    const newId = `NB-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      laptops: [
        ...prev.laptops,
        {
          ...newLaptop,
          id: newId,
          category: newLaptop.category || prev.assetCategories?.[0] || '노트북',
        },
      ],
    }));
    setNewLaptop(null);
    triggerToast(`자산 ${newLaptop.assetNo}이(가) 신규 등록되었습니다.`, 'success');
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
    reader.onload = (evt) => {
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

        processParsedData(jsonResult);
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
  const processParsedData = (jsonList) => {
    if (!jsonList || jsonList.length === 0) {
      triggerToast('업로드된 파일에서 읽어올 수 있는 자산이 감지되지 않았습니다.', 'error');
      return;
    }

    const uploadedLaptops = [];
    let addCount = 0;
    let missingAssetNoCount = 0;
    let invalidCategoryCount = 0;
    const invalidCategoryNames = new Set();

    jsonList.forEach((row, index) => {
      // 실무자 유연한 대소문자 및 유사어 추적 필터
      const matchVal = (keys) => {
        const matchedKey = Object.keys(row).find(k =>
          keys.some(key => k.toLowerCase().replace(/\s+/g, '').includes(key.toLowerCase()))
        );
        return matchedKey ? String(row[matchedKey]).trim() : '';
      };

      const category = matchVal(['자산카테고리', '카테고리', '분류', 'category', 'assetcategory', 'asset_category']);
      const assetNo = matchVal(['자산관리번호', '관리번호', '자산번호', 'assetno', 'asset_no']);
      const model = matchVal(['모델명', '모델', '기종', 'model']);
      const serialNo = matchVal(['시리얼번호', '시리얼', 'serialno', 'serial_no', 'sn', 's/n']);
      const manufactureDate = matchVal(['제조일자', '제조일', '구입일자', '구입일', 'manufacturedate', 'manufacture_date']);
      const note = matchVal(['비고', '메모', '특이사항', 'note']);
      const photo = matchVal(['사진url', '사진링크', '사진', 'photo', 'image']);
      const statusVal = matchVal(['대여가능여부', '대여가능', '대여상태', '상태', 'status']);

      // 필수 충족요건인 '자산관리번호' 존재 체크
      if (!assetNo) {
        missingAssetNoCount++;
        return;
      }

      // 등록된 자산 카테고리와 일치하는 행만 업로드
      const matchedCategory = (data.assetCategories || []).find(
        (registeredCategory) =>
          String(registeredCategory || '').trim().toLowerCase() === category.trim().toLowerCase()
      );

      if (!category || !matchedCategory) {
        invalidCategoryCount++;
        invalidCategoryNames.add(category || '미입력');
        return;
      }

      const fallbackPhoto = `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`;
      let finalStatus = STATUS.AVAILABLE;
      
      if (statusVal.includes('대여불가') || statusVal.toLowerCase().includes('unavailable') || statusVal.includes('불가')) {
        finalStatus = STATUS.UNAVAILABLE;
      }

      uploadedLaptops.push({
        id: `NB-UP-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        category: matchedCategory,
        assetNo: assetNo,
        serialNo: serialNo || `SN-AUTO-${Math.floor(Math.random() * 90000 + 10000)}`,
        model: model || '미지정 기종',
        manufactureDate: manufactureDate || today(),
        photo: photo || fallbackPhoto,
        note: note || '',
        status: finalStatus,
        currentRequestId: null
      });
      addCount++;
    });

    if (uploadedLaptops.length > 0) {
      setData((prev) => ({
        ...prev,
        laptops: [...prev.laptops, ...uploadedLaptops],
      }));
      setShowUploadPanel(false);

      const skippedMessages = [];
      if (invalidCategoryCount > 0) {
        skippedMessages.push(`카테고리 불일치 ${invalidCategoryCount}건 제외`);
      }
      if (missingAssetNoCount > 0) {
        skippedMessages.push(`자산관리번호 누락 ${missingAssetNoCount}건 제외`);
      }

      triggerToast(
        `총 ${addCount}대의 기기를 엑셀/CSV 데이터베이스로 일괄 추가 등록했습니다.${skippedMessages.length ? ` (${skippedMessages.join(', ')})` : ''}`,
        'success'
      );
    } else {
      const invalidCategoryList = Array.from(invalidCategoryNames).slice(0, 5).join(', ');

      if (invalidCategoryCount > 0) {
        triggerToast(
          `등록된 자산 카테고리와 일치하는 행이 없어 업로드하지 않았습니다. 불일치 카테고리: ${invalidCategoryList}`,
          'error'
        );
        return;
      }

      if (missingAssetNoCount > 0) {
        triggerToast('자산관리번호가 입력된 행이 없어 업로드하지 않았습니다.', 'error');
        return;
      }

      triggerToast('헤더(자산카테고리, 자산관리번호, 모델명, 시리얼번호 등) 규격 정보가 일치하지 않아 가져오지 못했습니다.', 'error');
    }
  };

  // 자산 영구 삭제 제어 로직
  const deleteLaptop = (id, assetNo) => {
    triggerConfirm(
      '자산 삭제',
      `정말로 자산 [${assetNo}] 기기를 시스템 목록에서 영구적으로 삭제하시겠습니까? 신청 원장은 보존되나 기기 목록에서는 삭제됩니다.`,
      () => {
        setData((prev) => ({
          ...prev,
          laptops: prev.laptops.filter((l) => l.id !== id),
        }));
        if (selectedLaptopId === id) setSelectedLaptopId(null);
        triggerToast(`자산 ${assetNo}이(가) 성공적으로 삭제되었습니다.`, 'success');
      }
    );
  };

  const saveLaptop = () => {
    setData((prev) => ({
      ...prev,
      laptops: prev.laptops.map((l) => (l.id === editLaptop.id ? editLaptop : l)),
    }));
    setEditLaptop(null);
    triggerToast('자산 상세 정보가 성공적으로 반영되었습니다.', 'success');
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
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-2xl mk-brand-gradient-tr p-2 text-white mk-brand-shadow-md">
              <Laptop size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="break-keep text-base font-bold leading-snug tracking-tight text-slate-900 sm:text-lg">
                매일경제아카데미 기기 대여 시스템
              </h1>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                https://notebook.recruit.kro.kr
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-1.5 rounded-xl border border-slate-200/60 bg-slate-100 p-1 sm:w-auto sm:min-w-[176px]">
            <button
              onClick={() => setView('user')}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition sm:py-1.5 ${
                view === 'user'
                  ? 'bg-white mk-brand-text shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              사용자 화면
            </button>
            <button
              onClick={() => setView('admin')}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition sm:py-1.5 ${
                view === 'admin'
                  ? 'bg-white mk-brand-text shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              관리자 모드
            </button>
          </div>
        </div>
      </header>

      {/* --- 메인 워크스페이스 --- */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        
        {/* --- 실시간 주요 대여 현황 보드 --- */}
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard icon={Laptop} label="보유 자산" value={stats.total} />
          <StatCard icon={CheckCircle2} label="대여 가능" value={stats.available} tone="green" />
          <StatCard icon={Clock} label="승인 대기중" value={stats.requested} tone="amber" />
          <StatCard icon={ShieldCheck} label="대여(예약)중" value={stats.approved} tone="blue" />
          <StatCard icon={XCircle} label="반납 지연중" value={stats.overdue} tone="rose" />
        </section>

        {view === 'user' ? (
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
                    disabled={!selectedLaptop || selectedLaptopAvailability?.blocked}
                    className="w-full justify-center rounded-xl py-6"
                  >
                    기기 대여 신청
                  </Button>
                </CardContent>
              </Card>
            </div>
            </div>
          </div>
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
                            <li>사용자의 원클릭 신청이 완료되는 즉시, 타 사원의 추가 신청 접수가 제한됩니다.</li>
                            <li>승인, 대기, 보류, 불허, 반납완료 등 총 5단계의 승인 상태 전환 로직이 유기적으로 가동됩니다.</li>
                            <li>불허 혹은 최종 반납완료 처리가 가해지는 순간, 자산은 즉각 &apos;대여가능&apos; 상태로 마킹 복귀됩니다.</li>
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
                    <div className="space-y-4">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">기기 대여 신청 관리</h2>
                        <p className="text-xs text-slate-500 mt-1">부서원들이 제출한 실시간 신청서에 대한 승인/대기/반납 전환 관리 창구입니다.</p>
                      </div>
                      <div className="space-y-4">
                        {data.requests.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-12 text-center text-slate-400 text-xs">
                            현재 접수되거나 처리된 대여 신청 목록이 없습니다.
                          </div>
                        ) : (
                          data.requests.map((r) => {
                            const isOverdue = r.status === STATUS.APPROVED && r.dueDate < today();
                            return (
                              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                        {r.assetCategory}
                                      </span>
                                      <span className="font-bold text-slate-950 text-sm">{r.assetNo}</span>
                                      <Badge>{getDisplayRentalStatus(r.status, r.startDate)}</Badge>
                                      {isOverdue && (
                                        <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10 animate-pulse">
                                          반납 기한 지연중
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-600 font-medium">
                                      소속: <span className="text-slate-900">{r.team}</span> &middot; 대여자명: <span className="text-slate-900">{r.borrower}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      대여 일정: {r.startDate} ~ {r.dueDate}
                                    </div>
                                    <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                      목적: <span className="text-slate-700 font-medium">{r.purpose || '서술 목적 없음'}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      등록 접수 일시: {r.requestedAt}
                                    </div>
                                  </div>

                                  {/* 상태 전환 버튼 피드 */}
                                  <div className="flex flex-wrap gap-1">
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.APPROVED)}
                                      variant="primary"
                                      className="px-2.5 py-1.5 text-xs rounded-lg"
                                    >
                                      승인
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.REQUESTED)}
                                      variant="outline"
                                      className="px-2.5 py-1.5 text-xs rounded-lg"
                                    >
                                      대기
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.ON_HOLD)}
                                      variant="secondary"
                                      className="px-2.5 py-1.5 text-xs rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100"
                                    >
                                      보류
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.DENIED)}
                                      variant="dangerOutline"
                                      className="px-2.5 py-1.5 text-xs rounded-lg"
                                    >
                                      불허
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.RETURNED)}
                                      variant="outline"
                                      className="px-2.5 py-1.5 text-xs rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                                    >
                                      반납확정
                                    </Button>
                                  </div>
                                </div>
                                
                                <div className="pt-2 border-t border-slate-100">
                                  <label className="block">
                                    <span className="block text-[10px] font-semibold text-slate-500 uppercase">승인 관리자 심사 및 인수인계 코멘트</span>
                                    <input
                                      type="text"
                                      value={r.adminMemo}
                                      onChange={(e) => updateRequestMemo(r.id, e.target.value)}
                                      placeholder="전달 혹은 상태 변경 사유 등을 남겨 공유하세요."
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
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
                          onClick={() => {
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
                              holidays: Array.isArray(tempSettings.holidays)
                                ? tempSettings.holidays
                                    .filter((holiday) => holiday && holiday.date)
                                    .map((holiday) => ({
                                      date: holiday.date,
                                      name: holiday.name || '',
                                      type: holiday.type || DEFAULT_HOLIDAY_TYPE,
                                      enabled: holiday.enabled !== false,
                                    }))
                                : [],
                            };

                            setData((prev) => ({
                              ...prev,
                              settings: nextSettings,
                            }));
                            setTempSettings(nextSettings);
                            setNewHolidayDate(today());
                            setNewHolidayName('');
                            setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
                            setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
                            setHolidayImportLoading(false);
                            triggerToast('설정 변경사항이 원장에 성공적으로 저장 및 반영되었습니다.', 'success');
                          }}
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
        )}
      </main>

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