import { randomUUID } from 'node:crypto';

const trim = (value) => String(value ?? '').trim();
const normalizePageSize = (value, fallback = 10) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 5 && parsed <= 50 ? parsed : fallback;
};

const serviceError = (code, message, status = 400, details = {}) => {
  const error = new Error(message);
  error.name = 'BoardServiceError';
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
};

const docId = (document) => decodeURIComponent(trim(document?.name).split('/').at(-1) || '');
const normalizeFirestoreConfig = (document, fallback) => ({
  postsPerPage: normalizePageSize(document?.fields?.postsPerPage, fallback),
  updatedAt: document?.fields?.updatedAt || document?.updateTime || null,
});
const normalizeFirestoreCategory = (document) => {
  const fields = document?.fields || {};
  const id = trim(fields.id) || docId(document);
  const name = trim(fields.name);
  if (!id || !name) return null;
  return Object.freeze({
    id,
    name,
    order: Math.trunc(Number(fields.order) || 0),
    createdAt: fields.createdAt || document?.createTime || null,
    updatedAt: fields.updatedAt || document?.updateTime || null,
  });
};
const normalizeFirestorePost = (boardType, document) => {
  const fields = document?.fields || {};
  const id = trim(fields.id) || docId(document);
  const title = trim(fields.title);
  const categoryId = boardType === 'faq' ? trim(fields.categoryId) : '';
  if (!id || !title || (boardType === 'faq' && !categoryId)) return null;
  return Object.freeze({
    id,
    boardType,
    categoryId,
    title,
    content: trim(fields.contentText || fields.content),
    contentText: trim(fields.contentText || fields.content),
    contentHtml: trim(fields.contentHtml),
    contentFormat: trim(fields.contentFormat) || 'rich-html-v1',
    isPinned: Boolean(fields.isPinned),
    authorUid: trim(fields.authorUid),
    authorName: trim(fields.authorName),
    viewCount: boardType === 'notice' ? Math.max(0, Math.trunc(Number(fields.viewCount) || 0)) : 0,
    createdAt: fields.createdAt || document?.createTime || null,
    updatedAt: fields.updatedAt || document?.updateTime || null,
  });
};

const normalizePostInput = (boardType, input, { id, isEditing, actorClerkUserId }) => {
  const title = trim(input?.title);
  const contentText = trim(input?.contentText || input?.content);
  const contentHtml = trim(input?.contentHtml);
  const contentFormat = trim(input?.contentFormat) || 'rich-html-v1';
  const categoryId = boardType === 'faq' ? trim(input?.categoryId) : '';
  if (!title) throw serviceError(`${boardType}_post_title_required`, 'Board post title is required.');
  if (!contentText && !contentHtml) throw serviceError(`${boardType}_post_content_required`, 'Board post content is required.');
  if (boardType === 'faq' && !categoryId) throw serviceError('faq_category_required', 'FAQ category is required.');
  return Object.freeze({
    id: trim(id),
    boardType,
    categoryId,
    title,
    contentText,
    contentHtml,
    contentFormat,
    isPinned: Boolean(input?.isPinned),
    authorUid: trim(input?.authorUid),
    authorName: trim(input?.authorName),
    isEditing: Boolean(isEditing),
    actorClerkUserId: trim(actorClerkUserId),
  });
};

const mapRepositoryError = (error) => {
  const map = {
    board_not_bootstrapped: ['board_not_bootstrapped', 'Board data is not bootstrapped.', 404],
    notice_post_not_found: ['notice_post_not_found', 'Notice post was not found.', 404],
    notice_post_already_exists: ['notice_post_already_exists', 'Notice post already exists.', 409],
    faq_post_not_found: ['faq_post_not_found', 'FAQ post was not found.', 404],
    faq_post_already_exists: ['faq_post_already_exists', 'FAQ post already exists.', 409],
    faq_category_not_found: ['faq_category_not_found', 'FAQ category was not found.', 404],
    faq_category_already_exists: ['faq_category_already_exists', 'FAQ category already exists.', 409],
    faq_category_duplicate_name: ['faq_category_duplicate_name', 'FAQ category name already exists.', 409],
    faq_category_in_use: ['faq_category_in_use', 'FAQ category is still used by posts.', 409],
  };
  const mapped = map[error?.code];
  if (!mapped) throw error;
  throw serviceError(mapped[0], mapped[1], mapped[2], { postCount: Number(error?.postCount || 0) });
};

export const createBoardService = ({ repository, firestoreClient }) => {
  if (!repository || !firestoreClient) throw new TypeError('Board repository and Firestore client are required.');

  const verifyAdmin = (firebaseIdentity) => firestoreClient.verifyAdmin({
    firebaseUid: firebaseIdentity.uid,
    firebaseIdToken: firebaseIdentity.idToken,
  });

  const bootstrap = async (firebaseIdentity, actorClerkUserId = '') => {
    const admin = await verifyAdmin(firebaseIdentity);
    const source = await firestoreClient.readBootstrap({ firebaseIdToken: firebaseIdentity.idToken });
    const faqCategories = (source.faqCategories || []).map(normalizeFirestoreCategory).filter(Boolean);
    const categoryIds = new Set(faqCategories.map((item) => item.id));
    const noticePosts = (source.noticePosts || []).map((item) => normalizeFirestorePost('notice', item)).filter(Boolean);
    const faqPosts = (source.faqPosts || []).map((item) => normalizeFirestorePost('faq', item)).filter((item) => item && categoryIds.has(item.categoryId));
    const result = await repository.bootstrap({
      noticeConfig: normalizeFirestoreConfig(source.noticeConfig, 10),
      noticePosts,
      faqConfig: normalizeFirestoreConfig(source.faqConfig, 10),
      faqCategories,
      faqPosts,
      actorClerkUserId,
    });
    return Object.freeze({ admin, target: 'postgresql', ...result, status: await repository.getStatus() });
  };

  return Object.freeze({
    async getStatus() { return repository.getStatus(); },
    async listNotice(query) {
      try { return await repository.listNotice(query); }
      catch (error) { return mapRepositoryError(error); }
    },
    async getNotice(postId) {
      const post = await repository.getNoticePost(postId);
      if (!post) throw serviceError('notice_post_not_found', 'Notice post was not found.', 404);
      return post;
    },
    async incrementNoticeView(postId) {
      try { return await repository.incrementNoticeView(postId); }
      catch (error) { return mapRepositoryError(error); }
    },
    async listFaq(query) {
      try { return await repository.listFaq(query); }
      catch (error) { return mapRepositoryError(error); }
    },
    bootstrap,

    async saveNotice(firebaseIdentity, actorClerkUserId, input) {
      const admin = await verifyAdmin(firebaseIdentity);
      const id = trim(input?.id) || `notice-${randomUUID().replaceAll('-', '')}`;
      const isEditing = Boolean(trim(input?.id));
      const post = normalizePostInput('notice', input, { id, isEditing, actorClerkUserId });
      const source = isEditing ? await firestoreClient.getNoticePost({ postId: id, firebaseIdToken: firebaseIdentity.idToken }) : null;
      if (isEditing && !source) throw serviceError('notice_post_not_found', 'Notice post was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.saveNoticePostAuthoritative({
          post,
          beforeCommit: ({ post: next }) => firestoreClient.mirrorNoticeSave({
            post: next,
            sourceUpdateTime: source?.updateTime || '',
            firebaseIdToken: firebaseIdentity.idToken,
          }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', post: result.post });
      } catch (error) { return mapRepositoryError(error); }
    },

    async deleteNotice(firebaseIdentity, postId) {
      const admin = await verifyAdmin(firebaseIdentity);
      const source = await firestoreClient.getNoticePost({ postId, firebaseIdToken: firebaseIdentity.idToken });
      if (!source) throw serviceError('notice_post_not_found', 'Notice post was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.deleteNoticePostAuthoritative({
          postId,
          beforeCommit: () => firestoreClient.mirrorNoticeDelete({ postId, sourceUpdateTime: source.updateTime || '', firebaseIdToken: firebaseIdentity.idToken }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', deletedPost: result.deletedPost });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveFaq(firebaseIdentity, actorClerkUserId, input) {
      const admin = await verifyAdmin(firebaseIdentity);
      const id = trim(input?.id) || `faq-${randomUUID().replaceAll('-', '')}`;
      const isEditing = Boolean(trim(input?.id));
      const post = normalizePostInput('faq', input, { id, isEditing, actorClerkUserId });
      const source = isEditing ? await firestoreClient.getFaqPost({ postId: id, firebaseIdToken: firebaseIdentity.idToken }) : null;
      if (isEditing && !source) throw serviceError('faq_post_not_found', 'FAQ post was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.saveFaqPostAuthoritative({
          post,
          beforeCommit: ({ post: next }) => firestoreClient.mirrorFaqSave({
            post: next,
            sourceUpdateTime: source?.updateTime || '',
            firebaseIdToken: firebaseIdentity.idToken,
          }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', post: result.post });
      } catch (error) { return mapRepositoryError(error); }
    },

    async deleteFaq(firebaseIdentity, postId) {
      const admin = await verifyAdmin(firebaseIdentity);
      const source = await firestoreClient.getFaqPost({ postId, firebaseIdToken: firebaseIdentity.idToken });
      if (!source) throw serviceError('faq_post_not_found', 'FAQ post was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.deleteFaqPostAuthoritative({
          postId,
          beforeCommit: () => firestoreClient.mirrorFaqDelete({ postId, sourceUpdateTime: source.updateTime || '', firebaseIdToken: firebaseIdentity.idToken }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', deletedPost: result.deletedPost });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveConfig(firebaseIdentity, boardType, postsPerPage) {
      const admin = await verifyAdmin(firebaseIdentity);
      const normalizedType = trim(boardType).toLowerCase();
      if (!['notice', 'faq'].includes(normalizedType)) throw serviceError('board_type_invalid', 'Unsupported board type.', 400);
      const safePageSize = normalizePageSize(postsPerPage, 10);
      try {
        const result = await repository.saveConfigAuthoritative({
          boardType: normalizedType,
          postsPerPage: safePageSize,
          beforeCommit: ({ config }) => firestoreClient.mirrorBoardConfig({ boardType: normalizedType, postsPerPage: config.postsPerPage, firebaseIdToken: firebaseIdentity.idToken }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', config: result.config });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveFaqCategory(firebaseIdentity, actorClerkUserId, input) {
      const admin = await verifyAdmin(firebaseIdentity);
      const name = trim(input?.name);
      if (!name) throw serviceError('faq_category_name_required', 'FAQ category name is required.', 400);
      const id = trim(input?.id) || `faqcat-${randomUUID().replaceAll('-', '')}`;
      const isEditing = Boolean(trim(input?.id));
      const source = isEditing ? await firestoreClient.getFaqCategory({ categoryId: id, firebaseIdToken: firebaseIdentity.idToken }) : null;
      if (isEditing && !source) throw serviceError('faq_category_not_found', 'FAQ category was not found in Firestore compatibility storage.', 404);
      const category = Object.freeze({ id, name, isEditing, actorClerkUserId: trim(actorClerkUserId) });
      try {
        const result = await repository.saveFaqCategoryAuthoritative({
          category,
          beforeCommit: ({ category: next }) => firestoreClient.mirrorFaqCategorySave({ category: next, sourceUpdateTime: source?.updateTime || '', firebaseIdToken: firebaseIdentity.idToken }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', category: result.category });
      } catch (error) { return mapRepositoryError(error); }
    },

    async deleteFaqCategory(firebaseIdentity, categoryId) {
      const admin = await verifyAdmin(firebaseIdentity);
      const source = await firestoreClient.getFaqCategory({ categoryId, firebaseIdToken: firebaseIdentity.idToken });
      if (!source) throw serviceError('faq_category_not_found', 'FAQ category was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.deleteFaqCategoryAuthoritative({
          categoryId,
          beforeCommit: () => firestoreClient.mirrorFaqCategoryDelete({ categoryId, sourceUpdateTime: source.updateTime || '', firebaseIdToken: firebaseIdentity.idToken }),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'synced', deletedCategory: result.deletedCategory });
      } catch (error) { return mapRepositoryError(error); }
    },
  });
};
