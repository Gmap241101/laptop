import { firebaseAuth } from '../../firebase.js';
import { readFirebaseRuntimeRetirementConfig } from '../auth/firebaseRuntimeRetirement.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';

const READ_SESSION_KEY = 'mk_board_content_postgres_read';
const WRITE_SESSION_KEY = 'mk_board_content_postgres_write';
const OBSERVATION_EVENT = 'rental:board-content-cutover';
const REFRESH_EVENT = 'rental:board-content-refresh';
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

const publicRequest = async (path, { method = 'GET', fetchImpl = fetch } = {}) => {
  const config = readBoardContentCutoverConfig();
  requireApi(config);
  const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
    method,
    headers: { Accept: 'application/json' },
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

export const requestNoticeBoard = async ({ search = '', page = 1, pageSize = 10, home = false, fetchImpl = fetch } = {}) => {
  const params = new URLSearchParams();
  if (home) params.set('home', '1');
  else {
    if (trim(search)) params.set('search', trim(search));
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
  }
  const payload = await publicRequest(`/api/boards/notice?${params.toString()}`, { fetchImpl });
  const board = payload?.board;
  if (board?.source !== 'postgresql') throw Object.assign(new Error('Invalid notice board payload.'), { code: 'notice_board_payload_invalid' });
  publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'notice', operation: home ? 'home-read' : 'list-read', totalCount: board.totalRegularCount, itemCount: (board.pinnedPosts?.length || 0) + (board.regularPosts?.length || 0), syncAt: board.syncedAt || null, error: null });
  return board;
};

export const requestNoticePost = async (postId, { fetchImpl = fetch } = {}) => {
  const payload = await publicRequest(`/api/boards/notice/${encodeURIComponent(trim(postId))}`, { fetchImpl });
  if (!payload?.boardPost?.id) throw Object.assign(new Error('Invalid notice post payload.'), { code: 'notice_post_payload_invalid' });
  publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'notice', operation: 'detail-read', error: null });
  return payload.boardPost;
};

export const incrementNoticePostView = async (postId, { fetchImpl = fetch } = {}) => {
  const payload = await publicRequest(`/api/boards/notice/${encodeURIComponent(trim(postId))}/view`, { method: 'POST', fetchImpl });
  publishBoardContentObservation({ readRequested: true, writeRequested: false, writeSource: 'postgresql', boardType: 'notice', operation: 'view-count', error: null });
  return Number(payload?.noticeView?.viewCount || 0);
};

export const requestFaqBoard = async ({ search = '', page = 1, pageSize = 10, categoryId = 'all', searchWithinCategory = false, fetchImpl = fetch } = {}) => {
  const params = new URLSearchParams();
  if (trim(search)) params.set('search', trim(search));
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (trim(categoryId)) params.set('categoryId', trim(categoryId));
  if (searchWithinCategory) params.set('searchWithinCategory', '1');
  const payload = await publicRequest(`/api/boards/faq?${params.toString()}`, { fetchImpl });
  const board = payload?.board;
  if (board?.source !== 'postgresql') throw Object.assign(new Error('Invalid FAQ board payload.'), { code: 'faq_board_payload_invalid' });
  publishBoardContentObservation({ readRequested: true, readSource: 'postgresql', boardType: 'faq', operation: 'list-read', totalCount: board.totalRegularCount, itemCount: (board.pinnedPosts?.length || 0) + (board.regularPosts?.length || 0), categoryCount: board.categories?.length || 0, syncAt: board.syncedAt || null, error: null });
  return board;
};

const getAdminTokens = async () => {
  const clerk = await clerkStagingClient.initialize();
  const clerkToken = await clerk?.session?.getToken?.();
  if (!clerkToken) throw Object.assign(new Error('Clerk administrator session is required.'), { code: 'board_clerk_session_missing' });
  if (readFirebaseRuntimeRetirementConfig().requested) return { clerkToken, firebaseIdToken: '' };
  const firebaseUser = firebaseAuth.currentUser;
  if (!firebaseUser) throw Object.assign(new Error('Firebase administrator compatibility session is required.'), { code: 'board_firebase_session_missing' });
  return { clerkToken, firebaseIdToken: await firebaseUser.getIdToken() };
};

const adminRequest = async (path, body = {}, { fetchImpl = fetch } = {}) => {
  const config = readBoardContentCutoverConfig();
  if (!config.writeRequested) return null;
  requireApi(config);
  const { clerkToken, firebaseIdToken } = await getAdminTokens();
  const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clerkToken}`,
      ...(firebaseIdToken ? { 'X-Firebase-Authorization': `Bearer ${firebaseIdToken}` } : {}),
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

export const saveNoticeBoardPost = async (post, options = {}) => observeMutation(await adminRequest('/api/admin/boards/notice/posts', { post }, options), { boardType: 'notice' });
export const deleteNoticeBoardPost = async (postId, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/notice/posts/${encodeURIComponent(trim(postId))}/delete`, {}, options), { boardType: 'notice', operation: 'delete' });
export const saveFaqBoardPost = async (post, options = {}) => observeMutation(await adminRequest('/api/admin/boards/faq/posts', { post }, options), { boardType: 'faq' });
export const deleteFaqBoardPost = async (postId, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/faq/posts/${encodeURIComponent(trim(postId))}/delete`, {}, options), { boardType: 'faq', operation: 'delete' });
export const saveBoardConfig = async (boardType, postsPerPage, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/${encodeURIComponent(trim(boardType))}/config`, { postsPerPage }, options), { boardType, operation: 'config' });
export const saveFaqBoardCategory = async (category, options = {}) => observeMutation(await adminRequest('/api/admin/boards/faq/categories', { category }, options), { boardType: 'faq' });
export const deleteFaqBoardCategory = async (categoryId, options = {}) => observeMutation(await adminRequest(`/api/admin/boards/faq/categories/${encodeURIComponent(trim(categoryId))}/delete`, {}, options), { boardType: 'faq', operation: 'category-delete' });
