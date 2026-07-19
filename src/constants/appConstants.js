export const STATUS = {
  AVAILABLE: '대여가능',
  REQUESTED: '신청중',
  APPROVED: '대여중',
  ON_HOLD: '보류',
  DENIED: '불허',
  RETURNED: '반납완료',
  USER_CANCELLED: '사용자취소',
  UNAVAILABLE: '대여불가',
};

export const DISPLAY_STATUS = {
  RESERVED: '예약중',
};

export const statusStyle = {
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

export const RENTAL_BLOCKING_REQUEST_STATUSES = [
  STATUS.REQUESTED,
  STATUS.APPROVED,
  STATUS.ON_HOLD,
];

export const RENTAL_REQUEST_AUDIT_ACTION = {
  STATUS_CHANGED: 'status-changed',
  STATUS_RESTORED: 'status-restored',
  REQUEST_EDITED: 'request-edited',
  MEMO_CHANGED: 'memo-changed',
  USER_ACTION_REVIEWED: 'user-action-reviewed',
};

export const USER_REQUEST_ACTION = {
  CHANGE: 'change',
  CANCEL: 'cancel',
  EXTEND: 'extend',
  RETURN: 'return',
};

export const USER_REQUEST_REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
};

export const RENTAL_EXTENSION_APPROVAL_MODE = {
  MANUAL: 'manual',
  AUTO: 'auto',
};

export const OVERDUE_PENALTY_MODE = {
  FIXED_PER_ASSET: 'fixedPerAsset',
  OVERDUE_DAY_MULTIPLIER: 'overdueDayMultiplier',
};

export const DEFAULT_NOTICE_POSTS_PER_PAGE = 10;

export const NOTICE_POSTS_PER_PAGE_OPTIONS = [
  5,
  10,
  15,
  20,
  30,
  50,
];

export const DEFAULT_FAQ_POSTS_PER_PAGE = 10;

export const FAQ_POSTS_PER_PAGE_OPTIONS = [
  5,
  10,
  15,
  20,
  30,
  50,
];

export const ADMIN_REQUEST_TAB = {
  PENDING: 'pending',
  RENTAL: 'rental',
  CLOSED: 'closed',
  RETURNED: 'returned',
};

export const ADMIN_REQUEST_PAGE_SIZE_OPTIONS = [
  5,
  10,
  15,
  20,
  30,
  50,
];

export const RENTAL_REQUEST_RESTORE_TARGETS = {
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

export const RENTAL_REQUEST_STATUS_TRANSITIONS = {
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
