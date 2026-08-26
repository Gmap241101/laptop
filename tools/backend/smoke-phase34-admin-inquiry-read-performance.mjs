import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const repository = read('server/src/inquiries/inquiry-repository.mjs');
const service = read('server/src/inquiries/inquiry-service.mjs');
const panel = read('src/admin/AdminInquiryPanel.jsx');
const api = read('src/features/inquiries/inquiryApi.js');

const fail = (message) => {
  console.error(`[phase34-admin-inquiry-read-performance] ${message}`);
  process.exit(1);
};
const requireText = (source, token, message) => {
  if (!source.includes(token)) fail(message || `missing: ${token}`);
};
const rejectText = (source, token, message) => {
  if (source.includes(token)) fail(message || `forbidden: ${token}`);
};
const block = (source, start, end) => {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) fail(`missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) fail(`missing block end after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
};

const adminList = block(repository, '    async listAdminInquiries(', '\n    async getAdminInquiry(');
const adminDetail = block(repository, '    async getAdminInquiry(', '\n    async addAnswer(');
if ((adminList.match(/pool\.query\(/g) || []).length !== 1) fail('admin list must use one PostgreSQL query');
if ((adminDetail.match(/pool\.query\(/g) || []).length !== 1) fail('admin detail must use one PostgreSQL query');
rejectText(adminList, 'SELECT i.*', 'admin list must not fetch full inquiry rows');
rejectText(adminList, 'i.body_html', 'admin list must not return rich-text bodies');
rejectText(adminList, 'i.guest_password_hash', 'admin list must not return guest password hashes');
requireText(adminList, 'AS categories', 'admin list must return category metadata in the same query');
requireText(adminList, 'AS items', 'admin list must aggregate paged summaries in the same query');
requireText(adminList, 'AS total_count', 'admin list must return total count in the same query');
rejectText(adminDetail, 'Promise.all', 'admin detail must not start a second DB latency phase');
rejectText(adminDetail, 'listActiveAnswers', 'admin detail must aggregate answers in the same query');
rejectText(adminDetail, 'listConsents', 'admin detail must aggregate consents in the same query');
rejectText(adminDetail, 'attachmentRepository.listForOwner', 'admin detail must aggregate attachments in the same query');
requireText(adminDetail, 'app_inquiry_answers', 'admin detail must include answers');
requireText(adminDetail, 'app_inquiry_guest_consents', 'admin detail must include guest consents');
requireText(adminDetail, 'app_secure_attachments', 'admin detail must include attachments');

const settingsBlock = block(service, '    async getAdminSettings(', '\n    async saveAdminSettings(');
rejectText(settingsBlock, 'listCategories', 'full settings modal must not re-query categories already returned with the list');

rejectText(panel, '문의하기 관리 설정을 불러오는 중입니다.', 'admin page must not block on settings before the list');
requireText(panel, 'void loadList({ targetPage: 1 });', 'admin page must load the list immediately');
requireText(panel, 'const openSettingsDialog = async () =>', 'admin settings must load lazily on explicit open');
requireText(panel, 'inquiryApi.peekAdminDetail(publicId)', 'admin detail must use completed cache');
requireText(panel, 'inquiryApi.prefetchAdminDetail(publicId)', 'admin detail must support hover/focus prefetch');
requireText(panel, 'detailLoading && !detail', 'admin detail must use a dedicated loading state');
rejectText(panel, 'listLoading || detailLoading', 'admin detail loading must not masquerade as list loading');
const refreshBlock = block(panel, '  const refreshAfterMutation = async', '\n\n  const openAnswerEditor');
rejectText(refreshBlock, 'loadSettings', 'answer mutations must not reload full inquiry settings');

requireText(api, 'INQUIRY_ADMIN_LIST_CACHE_TTL_MS', 'admin list needs a bounded completed cache');
requireText(api, 'INQUIRY_ADMIN_SETTINGS_CACHE_TTL_MS', 'admin settings needs a bounded completed cache');
requireText(api, 'admin-list|', 'admin list cache namespace missing');
requireText(api, 'admin-detail|', 'admin detail cache namespace missing');
requireText(api, 'admin-settings|', 'admin settings cache namespace missing');
requireText(api, 'async prefetchAdminDetail(publicId)', 'admin detail prefetch API missing');
requireText(api, 'const runtimeClient = getActiveClerkRuntimeClient();', 'authenticated inquiry requests must use the active user/admin Clerk runtime client');
requireText(api, "typeof runtimeClient.getSessionToken === 'function'", 'authenticated inquiry requests must obtain the token from the active runtime client');
rejectText(api, 'typeof clerkStagingClient.getSessionToken', 'inquiry API must not reference the retired undefined clerkStagingClient binding after user/admin client isolation');

const { setActiveClerkRuntimeClient } = await import('../../src/clerk/clerkRuntimeClient.js');
setActiveClerkRuntimeClient({
  config: { apiBaseUrl: 'https://inquiry-smoke.invalid' },
  async initialize() {
    return { session: { id: 'admin-inquiry-smoke-session', getToken: async () => 'fallback-token' }, user: { id: 'admin-inquiry-smoke-user' } };
  },
  async getSessionToken() { return 'admin-inquiry-smoke-token'; },
}, 'admin');
let adminInquiryRequestSeen = null;
globalThis.fetch = async (url, options = {}) => {
  adminInquiryRequestSeen = { url: String(url), authorization: options?.headers?.Authorization || '' };
  return new Response(JSON.stringify({ inquiryList: { items: [], categories: [], totalCount: 0, page: 1, pageSize: 10 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
const { inquiryApi: inquiryApiRuntime } = await import('../../src/features/inquiries/inquiryApi.js');
const adminInquiryListResult = await inquiryApiRuntime.listAdmin({ page: 1, pageSize: 10 });
if (adminInquiryRequestSeen?.authorization !== 'Bearer admin-inquiry-smoke-token') fail('admin inquiry list must authenticate with the active admin Clerk runtime token');
if (!adminInquiryRequestSeen?.url.includes('/api/admin/inquiries?')) fail('admin inquiry list must call the authenticated admin inquiry endpoint');
if (!Array.isArray(adminInquiryListResult?.items)) fail('admin inquiry list runtime smoke must receive the list payload');

console.log('[phase34-admin-inquiry-read-performance] PASS');
