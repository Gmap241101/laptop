import { getActiveClerkRuntimeClient } from '../../clerk/clerkRuntimeClient.js';
import { readFirebaseRuntimeRetirementConfig } from '../auth/firebaseRuntimeRetirement.js';

const READ_SESSION_KEY = 'mk_board_content_postgres_read';
const WRITE_SESSION_KEY = 'mk_board_content_postgres_write';
const OBSERVATION_EVENT = 'rental:board-content-cutover';
const REFRESH_EVENT = 'rental:board-content-refresh';
const BOARD_READ_CACHE_TTL_MS = 60_000;
const NOTICE_VIEWER_STORAGE_KEY = 'mk_notice_viewer_id_v1';
let fallbackNoticeViewerId = '';
const boardReadCache = new Map();
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';


export const getOrCreateNoticeViewerId = ({ storage = globalThis.localStorage, cryptoApi = globalThis.crypto } = {}) => {
  try {
    const stored = trim(storage?.getItem?.(NOTICE_VIEWER_STORAGE_KEY));
    if (/^notice-viewer-v1-[A-Za-z0-9_-]{16,120}$/.test(stored)) return stored;
  } catch {
    // Storage can be unavailable in privacy-restricted contexts; use the in-memory fallback below.
  }
  if (!fallbackNoticeViewerId) {
    let token = '';
    try {
      if (typeof cryptoApi?.randomUUID === 'function') token = cryptoApi.randomUUID().replace(/-/g, '');
      else if (typeof cryptoApi?.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        token = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      token = '';
    }
    if (!token) token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    fallbackNoticeViewerId = `notice-viewer-v1-${token}`;
  }
  try { storage?.setItem?.(NOTICE_VIEWER_STORAGE_KEY, fallbackNoticeViewerId); } catch { /* no-op */ }
  return fallbackNoticeViewerId;
};

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

export const readBoardContentCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const firebaseRuntimeRetired = readFirebaseRuntimeRetirementConfig({ env, location }).requested;
  const readEnabled = staging && (bool(env?.VITE_BOARD_CONTENT_POSTGRES_READ_ENABLED) || firebaseRuntimeRetired);
  const writeEnabled = staging && (bool(env?.VITE_BOARD_CONTENT_POSTGRES_WRITE_ENABLED) || firebaseRuntimeRetired);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRead = readEnabled && params.get('boardContent') === 'postgres';
  const queryWrite = writeEnabled && params.get('boardWrite') === 'postgres';
  let sessionRead = false;
  let sessionWrite = false;
  try {
    if (params.get('boardContent') === 'firestore') storage?.removeItem?.(READ_SESSION_KEY);
    else if (queryRead) storage?.setItem?.(READ_SESSION_KEY, '1');
    if (params.get('boardWrite') === 'firestore') storage?.removeItem?.(WRITE_SESSION_KEY);
    else if (queryWrite) storage?.setItem?.(WRITE_SESSION_KEY, '1');
    sessionRead = storage?.getItem?.(READ_SESSION_KEY) === '1';
    sessionWrite = storage?.getItem?.(WRITE_SESSION_KEY) === '1';
  } catch {
    sessionRead = false;
    sessionWrite = false;
  }
  return Object.freeze({
    readEnabled,
    writeEnabled,
    readRequested: Boolean(firebaseRuntimeRetired || (readEnabled && (queryRead || sessionRead))),
    writeRequested: Boolean(firebaseRuntimeRetired || (writeEnabled && (queryWrite || sessionWrite))),
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

let latestObservation = null;
export const publishBoardContentObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OBSERVATION_EVENT, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestBoardContentObservation = () => latestObservation;
export const subscribeBoardContentObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(OBSERVATION_EVENT, handler);
  return () => window.removeEventListener(OBSERVATION_EVENT, handler);
};

export const publishBoardContentRefresh = (detail = {}) => {
  const boardType = trim(detail?.boardType || 'all');
  for (const key of boardReadCache.keys()) {
    if (boardType === 'all' || key.startsWith(`${boardType}|`)) boardReadCache.delete(key);
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { ...detail, refreshedAt: Date.now() } }));
};
export const subscribeBoardContentRefresh = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(REFRESH_EVENT, handler);
  return () => window.removeEventListener(REFRESH_EVENT, handler);
};

const requireApi = (config) => {
  if (!config.apiBaseUrl) throw Object.assign(new Error('VITE_API_URL is required for Phase 26 board cutover.'), { code: 'board_api_missing' });
};

const readJson = async (response) => {
  try { return await response.json(); } catch { return null; }
};

const getFreshBoardReadValue = (key) => {
  const cached = boardReadCache.get(key);
  if (!cached || cached.pending || Date.now() >= cached.expiresAt) {
    if (cached && !cached.pending) boardReadCache.delete(key);
    return null;
  }
  return cached.value ?? null;
};

const withBoardReadCache = async ({ key, useCache = true, loader }) => {
  if (!useCache) return loader();
  const now = Date.now();
  const cached = boardReadCache.get(key);
  if (cached?.promise && (cached.pending || cached.expiresAt > now)) return cached.promise;

  const entry = { pending: true, expiresAt: 0, promise: null, value: null };
  entry.promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      entry.pending = false;
      entry.value = value;
      entry.expiresAt = Date.now() + BOARD_READ_CACHE_TTL_MS;
      return value;
    })
    .catch((error) => {
      boardReadCache.delete(key);
      throw error;
    });
  boardReadCache.set(key, entry);
  return entry.promise;
};

const publicRequest = async (path, { method = 'GET', body = undefined, fetchImpl = fetch } = {}) => {
  const config = readBoardContentCutoverConfig();
  requireApi(config);
  const hasBody = body !== undefined;
  const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(`PostgreSQL board request failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'board_request_failed';
    throw error;
  }
  return payload;
};

const createNoticeBoardPath = ({ search = '', page = 1, pageSize = null, home = false, summaryOnly = false } = {}) => {
  const params = new URLSearchParams();
  if (summaryOnly) params.set('summary', '1');
  if (home) params.set('home', '1');
  else {
    if (trim(search)) params.set('search', trim(search));
    params.set('page', String(page));
    if (Number(pageSize) > 0) params.set('pageSize', String(pageSize));
  }
  return `/api/boards/notice?${params.toString()}`;
};

export const getCachedNoticeBoard = (options = {}) => {
  const path = createNoticeBoardPath(options);
  return getFreshBoardReadValue(`notice|${path}`);
};

export const requestNoticeBoard = async ({ search = '', page = 1, pageSize = null, home = false, summaryOnly = false, useCache = true, fetchImpl = fetch } = {}) => {
  const path = createNoticeBoardPath({ search, page, pageSize, home, summaryOnly });
  return withBoardReadCache({
    key: `notice|${path}`,
    useCache: useCache && fetchImpl === fetch,
    loader: async () => {
      const payload = await publicRequest(path, { fetchImpl });
      const board = payload?.board;
      if (board?.source !== 'postgresql') throw Object.assign(new Error('Invalid notice board payload.'), { code: 'notice_board_payload_invalid' });
      publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'notice', operation: home ? 'home-read' : 'list-read', totalCount: board.totalRegularCount, itemCount: (board.pinnedPosts?.length || 0) + (board.regularPosts?.length || 0), syncAt: board.syncedAt || null, error: null });
      return board;
    },
  });
};

export const requestNoticePost = async (postId, { useCache = true, fetchImpl = fetch } = {}) => {
  const normalizedId = trim(postId);
  return withBoardReadCache({
    key: `notice|detail|${normalizedId}`,
    useCache: useCache && fetchImpl === fetch,
    loader: async () => {
      const payload = await publicRequest(`/api/boards/notice/${encodeURIComponent(normalizedId)}`, { fetchImpl });
      if (!payload?.boardPost?.id) throw Object.assign(new Error('Invalid notice post payload.'), { code: 'notice_post_payload_invalid' });
      publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'notice', operation: 'detail-read', error: null });
      return payload.boardPost;
    },
  });
};

export const incrementNoticePostView = async (postId, { fetchImpl = fetch, storage = globalThis.localStorage, cryptoApi = globalThis.crypto } = {}) => {
  const viewerId = getOrCreateNoticeViewerId({ storage, cryptoApi });
  const payload = await publicRequest(`/api/boards/notice/${encodeURIComponent(trim(postId))}/view`, {
    method: 'POST',
    body: { viewerId },
    fetchImpl,
  });
  publishBoardContentObservation({ readRequested: true, writeRequested: false, writeSource: 'postgresql', boardType: 'notice', operation: 'view-count', error: null });
  return Number(payload?.noticeView?.viewCount || 0);
};

const createFaqBoardPath = ({ search = '', page = 1, pageSize = null, categoryId = 'all', searchWithinCategory = false, summaryOnly = false } = {}) => {
  const params = new URLSearchParams();
  if (summaryOnly) params.set('summary', '1');
  if (trim(search)) params.set('search', trim(search));
  params.set('page', String(page));
  if (Number(pageSize) > 0) params.set('pageSize', String(pageSize));
  if (trim(categoryId)) params.set('categoryId', trim(categoryId));
  if (searchWithinCategory) params.set('searchWithinCategory', '1');
  return `/api/boards/faq?${params.toString()}`;
};

export const getCachedFaqBoard = (options = {}) => {
  const path = createFaqBoardPath(options);
  return getFreshBoardReadValue(`faq|${path}`);
};

export const requestFaqBoard = async ({ search = '', page = 1, pageSize = null, categoryId = 'all', searchWithinCategory = false, summaryOnly = false, useCache = true, fetchImpl = fetch } = {}) => {
  const path = createFaqBoardPath({ search, page, pageSize, categoryId, searchWithinCategory, summaryOnly });
  return withBoardReadCache({
    key: `faq|${path}`,
    useCache: useCache && fetchImpl === fetch,
    loader: async () => {
      const payload = await publicRequest(path, { fetchImpl });
      const board = payload?.board;
      if (board?.source !== 'postgresql') throw Object.assign(new Error('Invalid FAQ board payload.'), { code: 'faq_board_payload_invalid' });
      publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'faq', operation: 'list-read', totalCount: board.totalRegularCount, itemCount: (board.pinnedPosts?.length || 0) + (board.regularPosts?.length || 0), categoryCount: board.categories?.length || 0, syncAt: board.syncedAt || null, error: null });
      return board;
    },
  });
};


export const requestFaqPost = async (postId, { useCache = true, fetchImpl = fetch } = {}) => {
  const normalizedId = trim(postId);
  return withBoardReadCache({
    key: `faq|detail|${normalizedId}`,
    useCache: useCache && fetchImpl === fetch,
    loader: async () => {
      const payload = await publicRequest(`/api/boards/faq/${encodeURIComponent(normalizedId)}`, { fetchImpl });
      if (!payload?.boardPost?.id) throw Object.assign(new Error('Invalid FAQ post payload.'), { code: 'faq_post_payload_invalid' });
      publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'faq', operation: 'detail-read', error: null });
      return payload.boardPost;
    },
  });
};

const getAdminTokens = async () => {
  const clerk = await getActiveClerkRuntimeClient().initialize();
  const clerkToken = await clerk?.session?.getToken?.();
  if (!clerkToken) throw Object.assign(new Error('Clerk administrator session is required.'), { code: 'board_clerk_session_missing' });
  return { clerkToken };
};

const adminReadRequest = async (path, { fetchImpl = fetch } = {}) => {
  const config = readBoardContentCutoverConfig();
  if (!config.writeRequested) return null;
  requireApi(config);
  const { clerkToken } = await getAdminTokens();
  const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${clerkToken}`,
    },
    cache: 'no-store',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(`PostgreSQL board administrator read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'admin_board_read_failed';
    throw error;
  }
  return payload;
};

const adminRequest = async (path, body = {}, { fetchImpl = fetch } = {}) => {
  const config = readBoardContentCutoverConfig();
  if (!config.writeRequested) return null;
  requireApi(config);
  const { clerkToken } = await getAdminTokens();
  const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clerkToken}`,
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(`PostgreSQL board administrator request failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'admin_board_request_failed';
    error.postCount = Number(payload?.postCount || 0);
    publishBoardContentObservation({ writeRequested: true, writeSource: 'postgresql', firestoreMirror: 'failed', error: error.code });
    throw error;
  }
  return payload;
};

const observeMutation = (payload, fallback = {}) => {
  const mutation = payload?.adminBoardMutation || null;
  publishBoardContentObservation({
    writeRequested: true,
    writeSource: mutation?.authority || 'postgresql',
    firestoreMirror: mutation?.firestoreMirror || fallback.firestoreMirror || 'synced',
    boardType: mutation?.boardType || fallback.boardType || null,
    operation: mutation?.operation || fallback.operation || null,
    error: null,
  });
  publishBoardContentRefresh({ boardType: mutation?.boardType || fallback.boardType || 'all', operation: mutation?.operation || fallback.operation || 'mutation' });
  return mutation;
};

export const bootstrapBoardContent = async ({ fetchImpl = fetch } = {}) => {
  const payload = await adminRequest('/api/admin/boards/bootstrap', {}, { fetchImpl });
  if (!payload) return null;
  const result = payload.adminBoardBootstrap;
  publishBoardContentObservation({ writeRequested: true, writeSource: 'firestore-server-bootstrap', firestoreMirror: 'source', boardType: 'all', operation: 'bootstrap', noticeCount: result?.noticeCount ?? null, faqCount: result?.faqCount ?? null, itemCount: Number(result?.noticeCount || 0) + Number(result?.faqCount || 0), categoryCount: result?.faqCategoryCount ?? null, syncAt: result?.status?.syncedAt || null, error: null });
  publishBoardContentRefresh({ boardType: 'all', operation: 'bootstrap' });
  return result;
};

export const requestAdminNoticePost = async (postId, options = {}) => {
  const payload = await adminReadRequest(`/api/admin/boards/notice/posts/${encodeURIComponent(trim(postId))}`, options);
  const post = payload?.adminBoardPost?.post || null;
  if (!post?.id) throw Object.assign(new Error('Invalid administrator notice post payload.'), { code: 'admin_notice_post_payload_invalid' });
  return post;
};
export const requestAdminFaqPost = async (postId, options = {}) => {
  const payload = await adminReadRequest(`/api/admin/boards/faq/posts/${encodeURIComponent(trim(postId))}`, options);
  const post = payload?.adminBoardPost?.post || null;
  if (!post?.id) throw Object.assign(new Error('Invalid administrator FAQ post payload.'), { code: 'admin_faq_post_payload_invalid' });
  return post;
};

export const saveNoticeBoardPost = async (post, options = {}) => observeMutation(await adminRequest('/api/admin/boards/notice/posts', { post }, options), { boardType: 'notice' });
export const deleteNoticeBoardPost = async (postId, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/notice/posts/${encodeURIComponent(trim(postId))}/delete`, {}, options), { boardType: 'notice', operation: 'delete' });
export const saveFaqBoardPost = async (post, options = {}) => observeMutation(await adminRequest('/api/admin/boards/faq/posts', { post }, options), { boardType: 'faq' });
export const deleteFaqBoardPost = async (postId, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/faq/posts/${encodeURIComponent(trim(postId))}/delete`, {}, options), { boardType: 'faq', operation: 'delete' });
export const saveBoardConfig = async (boardType, postsPerPage, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/${encodeURIComponent(trim(boardType))}/config`, { postsPerPage }, options), { boardType, operation: 'config' });
export const saveFaqBoardCategory = async (category, options = {}) => observeMutation(await adminRequest('/api/admin/boards/faq/categories', { category }, options), { boardType: 'faq' });
export const deleteFaqBoardCategory = async (categoryId, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/faq/categories/${encodeURIComponent(trim(categoryId))}/delete`, {}, options), { boardType: 'faq', operation: 'category-delete' });
