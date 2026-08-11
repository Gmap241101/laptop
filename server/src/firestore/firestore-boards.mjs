import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const trim = (value) => String(value ?? '').trim();

const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreBoardError';
  error.code = code;
  error.status = status;
  return error;
};

const encodeFirestoreValue = (value) => {
  if (value == null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeFirestoreValue(nested)])) } };
  }
  return { stringValue: String(value) };
};
const encodeFields = (payload = {}) => Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, encodeFirestoreValue(value)]));

export const createFirestoreBoardClient = ({ projectId, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch }) => {
  const normalizedProjectId = trim(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents`;
  const documentName = (path) => `projects/${normalizedProjectId}/databases/(default)/documents/${path}`;

  const requestJson = async ({ url, firebaseIdToken, method = 'GET', body = null, codePrefix }) => {
    const token = trim(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.', 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the board operation.', 403);
      if (response.status === 404) return null;
      if (!response.ok) {
        let detail = '';
        try { const payload = await response.clone().json(); detail = trim(payload?.error?.status || payload?.error?.message); } catch { /* ignore */ }
        const conflict = [409, 412].includes(response.status) || /ABORTED|FAILED_PRECONDITION/i.test(detail);
        if (conflict) throw createError(`${codePrefix}_conflict`, 'Firestore board document changed before commit.', 409);
        throw createError(`${codePrefix}_unavailable`, `Firestore board operation failed with HTTP ${response.status}.`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore board operation timed out.', 503);
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore board operation failed.', 503);
    } finally { clearTimeout(timeout); }
  };

  const getDocument = async (path, firebaseIdToken, codePrefix) => {
    const payload = await requestJson({ url: `${baseUrl}/${path}`, firebaseIdToken, codePrefix });
    return payload ? decodeFirestoreDocument(payload) : null;
  };

  const listCollection = async (collectionId, firebaseIdToken, codePrefix) => {
    const payload = await requestJson({
      url: `${baseUrl}:runQuery`,
      method: 'POST',
      firebaseIdToken,
      codePrefix,
      body: { structuredQuery: { from: [{ collectionId }] } },
    });
    if (!Array.isArray(payload)) throw createError(`${codePrefix}_invalid`, 'Firestore board list response is invalid.', 503);
    return payload.map((entry) => entry?.document).filter(Boolean).map(decodeFirestoreDocument);
  };

  const commit = ({ firebaseIdToken, codePrefix, writes }) => requestJson({
    url: `${baseUrl}:commit`, method: 'POST', firebaseIdToken, codePrefix, body: { writes },
  });

  const postFields = (post) => ({
    id: post.id,
    ...(post.boardType === 'faq' ? { categoryId: post.categoryId } : {}),
    title: post.title,
    content: post.contentText || '',
    contentText: post.contentText || '',
    contentHtml: post.contentHtml || '',
    contentFormat: post.contentFormat || 'rich-html-v1',
    isPinned: Boolean(post.isPinned),
    authorUid: post.authorUid || '',
    authorName: post.authorName || '',
    ...(post.boardType === 'notice' ? { viewCount: Number(post.viewCount || 0) } : {}),
  });

  return Object.freeze({
    async verifyAdmin({ firebaseUid, firebaseIdToken }) {
      const uid = trim(firebaseUid);
      const document = await getDocument(`adminAccounts/${encodeURIComponent(uid)}`, firebaseIdToken, 'firestore_board_admin');
      if (!document) throw createError('admin_account_not_found', 'Firebase admin account was not found.', 403);
      const fields = document.fields || {};
      if (trim(fields.id) !== uid || trim(fields.authUid) !== uid) throw createError('admin_account_identity_mismatch', 'Firebase admin account identity is invalid.', 403);
      return Object.freeze({ uid, name: trim(fields.userName || fields.adminLoginId || fields.authEmail || '관리자'), role: trim(fields.adminRole || 'admin') });
    },

    async readBootstrap({ firebaseIdToken }) {
      const [noticeConfig, noticePosts, faqConfig, faqCategories, faqPosts] = await Promise.all([
        getDocument('noticeBoard/config', firebaseIdToken, 'firestore_board_notice_config'),
        listCollection('noticePosts', firebaseIdToken, 'firestore_board_notice_posts'),
        getDocument('faqBoard/config', firebaseIdToken, 'firestore_board_faq_config'),
        listCollection('faqCategories', firebaseIdToken, 'firestore_board_faq_categories'),
        listCollection('faqPosts', firebaseIdToken, 'firestore_board_faq_posts'),
      ]);
      return Object.freeze({ noticeConfig, noticePosts, faqConfig, faqCategories, faqPosts });
    },

    getNoticePost: ({ postId, firebaseIdToken }) => getDocument(`noticePosts/${encodeURIComponent(trim(postId))}`, firebaseIdToken, 'firestore_board_notice_post'),
    getFaqPost: ({ postId, firebaseIdToken }) => getDocument(`faqPosts/${encodeURIComponent(trim(postId))}`, firebaseIdToken, 'firestore_board_faq_post'),
    getFaqCategory: ({ categoryId, firebaseIdToken }) => getDocument(`faqCategories/${encodeURIComponent(trim(categoryId))}`, firebaseIdToken, 'firestore_board_faq_category'),

    async mirrorNoticeSave({ post, sourceUpdateTime = '', firebaseIdToken }) {
      const fields = postFields(post);
      const write = {
        update: { name: documentName(`noticePosts/${encodeURIComponent(post.id)}`), fields: encodeFields(fields) },
        updateMask: { fieldPaths: Object.keys(fields) },
        ...(sourceUpdateTime ? { currentDocument: { updateTime: sourceUpdateTime } } : { currentDocument: { exists: false } }),
        updateTransforms: [
          ...(!sourceUpdateTime ? [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] : []),
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
      };
      return commit({ firebaseIdToken, codePrefix: 'firestore_board_notice_save', writes: [write] });
    },

    mirrorNoticeDelete: ({ postId, sourceUpdateTime = '', firebaseIdToken }) => commit({
      firebaseIdToken,
      codePrefix: 'firestore_board_notice_delete',
      writes: [{ delete: documentName(`noticePosts/${encodeURIComponent(trim(postId))}`), ...(sourceUpdateTime ? { currentDocument: { updateTime: sourceUpdateTime } } : {}) }],
    }),

    async mirrorFaqSave({ post, sourceUpdateTime = '', firebaseIdToken }) {
      const fields = postFields(post);
      const write = {
        update: { name: documentName(`faqPosts/${encodeURIComponent(post.id)}`), fields: encodeFields(fields) },
        updateMask: { fieldPaths: Object.keys(fields) },
        ...(sourceUpdateTime ? { currentDocument: { updateTime: sourceUpdateTime } } : { currentDocument: { exists: false } }),
        updateTransforms: [
          ...(!sourceUpdateTime ? [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] : []),
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
      };
      return commit({ firebaseIdToken, codePrefix: 'firestore_board_faq_save', writes: [write] });
    },

    mirrorFaqDelete: ({ postId, sourceUpdateTime = '', firebaseIdToken }) => commit({
      firebaseIdToken,
      codePrefix: 'firestore_board_faq_delete',
      writes: [{ delete: documentName(`faqPosts/${encodeURIComponent(trim(postId))}`), ...(sourceUpdateTime ? { currentDocument: { updateTime: sourceUpdateTime } } : {}) }],
    }),

    mirrorBoardConfig: ({ boardType, postsPerPage, firebaseIdToken }) => commit({
      firebaseIdToken,
      codePrefix: `firestore_board_${boardType}_config`,
      writes: [{
        update: { name: documentName(`${boardType === 'notice' ? 'noticeBoard' : 'faqBoard'}/config`), fields: encodeFields({ postsPerPage }) },
        updateMask: { fieldPaths: ['postsPerPage'] },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      }],
    }),

    async mirrorFaqCategorySave({ category, sourceUpdateTime = '', firebaseIdToken }) {
      const fields = { id: category.id, name: category.name, order: Number(category.order || 0) };
      const write = {
        update: { name: documentName(`faqCategories/${encodeURIComponent(category.id)}`), fields: encodeFields(fields) },
        updateMask: { fieldPaths: Object.keys(fields) },
        ...(sourceUpdateTime ? { currentDocument: { updateTime: sourceUpdateTime } } : { currentDocument: { exists: false } }),
        updateTransforms: [
          ...(!sourceUpdateTime ? [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] : []),
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
      };
      return commit({ firebaseIdToken, codePrefix: 'firestore_board_faq_category_save', writes: [write] });
    },

    mirrorFaqCategoryDelete: ({ categoryId, sourceUpdateTime = '', firebaseIdToken }) => commit({
      firebaseIdToken,
      codePrefix: 'firestore_board_faq_category_delete',
      writes: [{ delete: documentName(`faqCategories/${encodeURIComponent(trim(categoryId))}`), ...(sourceUpdateTime ? { currentDocument: { updateTime: sourceUpdateTime } } : {}) }],
    }),
  });
};
