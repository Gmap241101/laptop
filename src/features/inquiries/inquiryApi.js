import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';

const trim = (value) => String(value ?? '').trim();

const INQUIRY_READ_CACHE_TTL_MS = 60_000;
const inquiryReadCache = new Map();

const withInquiryReadCache = async ({ key, loader }) => {
  const now = Date.now();
  const cached = inquiryReadCache.get(key);
  if (cached?.promise && (cached.pending || cached.expiresAt > now)) return cached.promise;
  const entry = { pending: true, expiresAt: 0, promise: null };
  entry.promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      entry.pending = false;
      entry.expiresAt = Date.now() + INQUIRY_READ_CACHE_TTL_MS;
      return value;
    })
    .catch((error) => {
      inquiryReadCache.delete(key);
      throw error;
    });
  inquiryReadCache.set(key, entry);
  return entry.promise;
};

const invalidateInquiryReadCache = (prefix = '') => {
  for (const key of inquiryReadCache.keys()) {
    if (!prefix || key.startsWith(prefix)) inquiryReadCache.delete(key);
  }
};

const getCurrentClerkSessionCacheKey = async () => {
  const clerk = await clerkStagingClient.initialize();
  return trim(clerk?.session?.id || clerk?.session?.user?.id || clerk?.user?.id || '');
};

const getApiBaseUrl = () => {
  const configured = trim(clerkStagingClient?.config?.apiBaseUrl || import.meta.env?.VITE_API_URL);
  if (!configured) {
    const error = new Error('Inquiry API base URL is not configured.');
    error.code = 'inquiry_api_not_configured';
    throw error;
  }
  return configured.replace(/\/+$/, '');
};

const parsePayload = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const makeError = (response, payload, fallback) => {
  const error = new Error(fallback || `Inquiry API request failed with HTTP ${response.status}.`);
  error.status = response.status;
  error.code = payload?.error || 'inquiry_api_request_failed';
  error.payload = payload;
  return error;
};

const requestJson = async ({ path, method = 'GET', body, auth = 'public', guestToken = '' }) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth === 'clerk') {
    const clerk = await clerkStagingClient.initialize();
    const token = await clerk?.session?.getToken?.();
    if (!token) {
      const error = new Error('로그인이 필요합니다.');
      error.code = 'inquiry_clerk_session_required';
      error.status = 401;
      throw error;
    }
    headers.Authorization = `Bearer ${token}`;
  } else if (auth === 'guest') {
    const normalizedGuestToken = trim(guestToken);
    if (!normalizedGuestToken) {
      const error = new Error('비회원 문의 확인 인증이 필요합니다.');
      error.code = 'guest_inquiry_session_required';
      error.status = 401;
      throw error;
    }
    headers.Authorization = `Guest ${normalizedGuestToken}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await parsePayload(response);
  if (!response.ok) throw makeError(response, payload);
  return payload || {};
};

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const normalized = trim(value);
    if (normalized) search.set(key, normalized);
  });
  const rendered = search.toString();
  return rendered ? `?${rendered}` : '';
};

export const inquiryApi = Object.freeze({
  async getPublicConfig({ includeGuestTerms = false, includeCategories = true, useCache = true } = {}) {
    const path = `/api/inquiries/config${queryString({
      includeGuestTerms: includeGuestTerms ? '1' : '',
      includeCategories: includeCategories ? '' : '0',
    })}`;
    const loader = async () => {
      const payload = await requestJson({ path });
      return payload.inquiryConfig || {};
    };
    return useCache ? withInquiryReadCache({ key: `public:${path}`, loader }) : loader();
  },

  async listMember({ search = '', page = 1, pageSize, useCache = true } = {}) {
    const path = `/api/inquiries/member${queryString({ search, page, pageSize })}`;
    const sessionKey = await getCurrentClerkSessionCacheKey();
    const loader = async () => {
      const payload = await requestJson({ path, auth: 'clerk' });
      return payload.inquiryList || { items: [], totalCount: 0, page: 1, pageSize: Number(pageSize || 10) };
    };
    if (!useCache || !sessionKey) return loader();
    return withInquiryReadCache({ key: `member:${sessionKey}:${path}`, loader });
  },

  async prefetchMemberHome() {
    return Promise.allSettled([
      this.getPublicConfig({ includeGuestTerms: false, includeCategories: true, useCache: true }),
      this.listMember({ search: '', page: 1, useCache: true }),
    ]);
  },

  async getMember(publicId) {
    const payload = await requestJson({ path: `/api/inquiries/member/${encodeURIComponent(publicId)}`, auth: 'clerk' });
    return payload.inquiry || null;
  },

  async createMember(input) {
    const payload = await requestJson({ path: '/api/inquiries/member', method: 'POST', body: input, auth: 'clerk' });
    invalidateInquiryReadCache('member:');
    return payload.inquiry || null;
  },

  async updateMember(publicId, input) {
    const payload = await requestJson({ path: `/api/inquiries/member/${encodeURIComponent(publicId)}`, method: 'PATCH', body: input, auth: 'clerk' });
    invalidateInquiryReadCache('member:');
    return payload.inquiry || null;
  },

  async deleteMember(publicId) {
    const payload = await requestJson({ path: `/api/inquiries/member/${encodeURIComponent(publicId)}`, method: 'DELETE', auth: 'clerk' });
    invalidateInquiryReadCache('member:');
    return payload.inquiryDelete || {};
  },

  async createGuest(input) {
    const payload = await requestJson({ path: '/api/inquiries/guest', method: 'POST', body: input });
    return payload.inquiry || null;
  },

  async verifyGuest(input) {
    const payload = await requestJson({ path: '/api/inquiries/guest/verify', method: 'POST', body: input });
    return payload.guestInquiryAccess || null;
  },

  async listGuest({ token, page = 1, pageSize } = {}) {
    const payload = await requestJson({
      path: `/api/inquiries/guest${queryString({ page, pageSize })}`,
      auth: 'guest',
      guestToken: token,
    });
    return payload.inquiryList || { items: [], totalCount: 0, page: 1, pageSize: Number(pageSize || 10) };
  },

  async getGuest(publicId, token) {
    const payload = await requestJson({ path: `/api/inquiries/guest/${encodeURIComponent(publicId)}`, auth: 'guest', guestToken: token });
    return payload.inquiry || null;
  },

  async updateGuest(publicId, input, token) {
    const payload = await requestJson({ path: `/api/inquiries/guest/${encodeURIComponent(publicId)}`, method: 'PATCH', body: input, auth: 'guest', guestToken: token });
    return payload.inquiry || null;
  },

  async deleteGuest(publicId, token) {
    const payload = await requestJson({ path: `/api/inquiries/guest/${encodeURIComponent(publicId)}`, method: 'DELETE', auth: 'guest', guestToken: token });
    return payload.inquiryDelete || {};
  },

  async listAdmin({ search = '', status = 'all', categoryId = 'all', page = 1, pageSize = 10 } = {}) {
    const payload = await requestJson({
      path: `/api/admin/inquiries${queryString({ search, status, categoryId, page, pageSize })}`,
      auth: 'clerk',
    });
    return payload.inquiryList || { items: [], totalCount: 0, page: 1, pageSize };
  },

  async getAdmin(publicId) {
    const payload = await requestJson({ path: `/api/admin/inquiries/${encodeURIComponent(publicId)}`, auth: 'clerk' });
    return payload.inquiry || null;
  },

  async deleteAdmin(publicId) {
    const payload = await requestJson({ path: `/api/admin/inquiries/${encodeURIComponent(publicId)}`, method: 'DELETE', auth: 'clerk' });
    return payload.inquiryDelete || {};
  },

  async getAdminSettings() {
    const payload = await requestJson({ path: '/api/admin/inquiries/settings', auth: 'clerk' });
    return payload.inquiryAdminSettings || {};
  },

  async saveAdminSettings(input) {
    const payload = await requestJson({ path: '/api/admin/inquiries/settings', method: 'PUT', body: input, auth: 'clerk' });
    return payload.inquirySettings || {};
  },

  async saveCategory(input) {
    const payload = await requestJson({ path: '/api/admin/inquiries/categories', method: 'POST', body: input, auth: 'clerk' });
    return payload.inquiryCategory || null;
  },

  async deleteCategory(id) {
    const payload = await requestJson({ path: `/api/admin/inquiries/categories/${encodeURIComponent(id)}`, method: 'DELETE', auth: 'clerk' });
    return payload.inquiryCategoryDelete || {};
  },

  async saveInquiryTerm(input) {
    const payload = await requestJson({ path: '/api/admin/inquiries/terms', method: 'POST', body: input, auth: 'clerk' });
    return payload.inquiryTerm || null;
  },

  async deleteInquiryTerm(id) {
    const payload = await requestJson({ path: `/api/admin/inquiries/terms/${encodeURIComponent(id)}`, method: 'DELETE', auth: 'clerk' });
    return payload.inquiryTermDelete || {};
  },

  async addAnswer(publicId, input) {
    const payload = await requestJson({ path: `/api/admin/inquiries/${encodeURIComponent(publicId)}/answers`, method: 'POST', body: input, auth: 'clerk' });
    return payload.inquiry || null;
  },

  async updateAnswer(publicId, answerId, input) {
    const payload = await requestJson({ path: `/api/admin/inquiries/${encodeURIComponent(publicId)}/answers/${encodeURIComponent(answerId)}`, method: 'PATCH', body: input, auth: 'clerk' });
    return payload.inquiry || null;
  },

  async deleteAnswer(publicId, answerId) {
    const payload = await requestJson({ path: `/api/admin/inquiries/${encodeURIComponent(publicId)}/answers/${encodeURIComponent(answerId)}`, method: 'DELETE', auth: 'clerk' });
    return payload.inquiry || null;
  },
});
