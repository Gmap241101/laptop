const EVENT_NAME = 'rental:rental-request-read-parity';
const SESSION_KEY = 'mk_rental_request_postgres_parity_test';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

const normalizeApiBaseUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
};

export const readRentalRequestParityConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const enabled = bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRequested = Boolean(enabled && params.get('rentalRequestParity') === '1');
  let sessionRequested = false;

  try {
    if (params.get('rentalRequestParity') === '0') storage?.removeItem?.(SESSION_KEY);
    else if (queryRequested) storage?.setItem?.(SESSION_KEY, '1');
    sessionRequested = storage?.getItem?.(SESSION_KEY) === '1';
  } catch {
    sessionRequested = false;
  }

  return Object.freeze({
    enabled,
    requested: Boolean(enabled && (queryRequested || sessionRequested)),
    queryRequested,
    sessionRequested,
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

const timestampIso = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  const text = trim(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
};

const normalizeNested = (value) => {
  if (value == null) return value;
  if (value instanceof Date || typeof value?.toDate === 'function') return timestampIso(value);
  if (Array.isArray(value)) return value.map(normalizeNested);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeNested(value[key])]),
    );
  }
  return value;
};

export const normalizeRentalRequestRead = (request) => {
  if (!request?.id) return null;
  return Object.freeze({
    id: trim(request.id),
    requesterUid: trim(request.requesterUid),
    requesterEmail: trim(request.requesterEmail).toLowerCase(),
    requesterName: trim(request.requesterName),
    requesterTeam: trim(request.requesterTeam),
    laptopId: trim(request.laptopId),
    assetCategory: trim(request.assetCategory),
    assetNo: trim(request.assetNo),
    team: trim(request.team),
    borrower: trim(request.borrower),
    startDate: trim(request.startDate),
    dueDate: trim(request.dueDate),
    purpose: trim(request.purpose),
    status: trim(request.status),
    adminMemo: trim(request.adminMemo),
    extensionCount: Number.isFinite(Number(request.extensionCount)) ? Number(request.extensionCount) : 0,
    lastExtensionApprovedDate: trim(request.lastExtensionApprovedDate),
    nextExtensionRequestDate: trim(request.nextExtensionRequestDate),
    extensionHistory: normalizeNested(Array.isArray(request.extensionHistory) ? request.extensionHistory : []),
    userActionRequest: normalizeNested(request.userActionRequest || null),
    requestedAt: trim(request.requestedAt),
    returnedAt: timestampIso(request.returnedAt),
    overduePenaltyPending: Boolean(request.overduePenaltyPending),
    overduePenaltyBatchId: trim(request.overduePenaltyBatchId),
    syncedAt: timestampIso(request.syncedAt),
    createdAt: timestampIso(request.createdAt),
    updatedAt: timestampIso(request.updatedAt),
  });
};

const sortRequests = (requests) => (requests || [])
  .map(normalizeRentalRequestRead)
  .filter(Boolean)
  .sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return right.id.localeCompare(left.id);
  });

const comparableKeys = Object.freeze([
  'requesterUid',
  'requesterEmail',
  'requesterName',
  'requesterTeam',
  'laptopId',
  'assetCategory',
  'assetNo',
  'team',
  'borrower',
  'startDate',
  'dueDate',
  'purpose',
  'status',
  'adminMemo',
  'extensionCount',
  'lastExtensionApprovedDate',
  'nextExtensionRequestDate',
  'extensionHistory',
  'userActionRequest',
  'requestedAt',
  'returnedAt',
  'overduePenaltyPending',
  'overduePenaltyBatchId',
  'syncedAt',
  'createdAt',
  'updatedAt',
]);

export const compareRentalRequestReads = (firestoreRequests, postgresRequests) => {
  const left = sortRequests(firestoreRequests);
  const right = sortRequests(postgresRequests);
  const leftById = new Map(left.map((request) => [request.id, request]));
  const rightById = new Map(right.map((request) => [request.id, request]));
  const allIds = [...new Set([...leftById.keys(), ...rightById.keys()])].sort();
  const changedFields = [];
  const changedRequestIds = [];

  for (const id of allIds) {
    const leftRequest = leftById.get(id);
    const rightRequest = rightById.get(id);
    if (!leftRequest || !rightRequest) {
      changedRequestIds.push(id);
      changedFields.push(`${id}.requestMissing`);
      continue;
    }
    const requestChanges = comparableKeys.filter((key) =>
      JSON.stringify(leftRequest[key]) !== JSON.stringify(rightRequest[key]),
    );
    if (requestChanges.length > 0) {
      changedRequestIds.push(id);
      changedFields.push(...requestChanges.map((key) => `${id}.${key}`));
    }
  }

  const leftOrder = left.map((request) => request.id);
  const rightOrder = right.map((request) => request.id);
  if (JSON.stringify(leftOrder) !== JSON.stringify(rightOrder)) {
    changedFields.push('requestOrder');
  }

  return Object.freeze({
    equivalent: changedFields.length === 0,
    firestoreCount: left.length,
    postgresCount: right.length,
    changedRequestIds: [...new Set(changedRequestIds)],
    changedFields,
    firestoreOrder: leftOrder,
    postgresOrder: rightOrder,
  });
};

let latestObservation = null;

export const publishRentalRequestReadObservation = ({ requests }) => {
  const config = readRentalRequestParityConfig();
  if (!config.requested || typeof window === 'undefined') return null;
  const normalizedRequests = sortRequests(requests);
  latestObservation = Object.freeze({
    source: 'firestore-onSnapshot',
    requests: normalizedRequests,
    count: normalizedRequests.length,
    observedAt: new Date().toISOString(),
  });
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};

export const getLatestRentalRequestReadObservation = () => latestObservation;

export const subscribeRentalRequestReadObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
