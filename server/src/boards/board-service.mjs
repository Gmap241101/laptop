import { randomUUID } from 'node:crypto';
import { normalizeSecureAttachmentInputs } from '../attachments/attachment-service.mjs';

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
    attachments: Object.prototype.hasOwnProperty.call(input || {}, 'attachments')
      ? normalizeSecureAttachmentInputs(input?.attachments)
      : null,
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
    notice_content_storage_roundtrip_mismatch: ['notice_content_storage_roundtrip_mismatch', 'Stored notice rich-text HTML did not match the submitted HTML.', 500],
    faq_content_storage_roundtrip_mismatch: ['faq_content_storage_roundtrip_mismatch', 'Stored FAQ rich-text HTML did not match the submitted HTML.', 500],
  };
  const mapped = map[error?.code];
  if (!mapped) throw error;
  throw serviceError(mapped[0], mapped[1], mapped[2], { postCount: Number(error?.postCount || 0) });
};

export const createBoardService = ({ repository }) => {
  if (!repository) throw new TypeError('Board repository is required.');
  const verifyAdmin = async (identity) => {
    if (identity?.source !== 'clerk-postgresql') throw serviceError('admin_postgresql_identity_required', 'Clerk/PostgreSQL administrator identity is required.', 401);
    return Object.freeze({ uid: identity.uid, role: 'admin', source: 'postgresql-admin-registry' });
  };

  const bootstrap = async (identity) => {
    const admin = await verifyAdmin(identity);
    const status = await repository.getStatus();
    return Object.freeze({
      admin,
      target: 'postgresql',
      source: 'postgresql-existing',
      skipped: true,
      status,
      noticeCount: Number(status?.noticeCount || 0),
      faqCount: Number(status?.faqCount || 0),
      faqCategoryCount: Number(status?.faqCategoryCount || 0),
    });
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
    async getFaq(postId) {
      const post = await repository.getFaqPost(postId);
      if (!post) throw serviceError('faq_post_not_found', 'FAQ post was not found.', 404);
      return post;
    },
    bootstrap,

    async saveNotice(identity, actorClerkUserId, input) {
      const admin = await verifyAdmin(identity);
      const id = trim(input?.id) || `notice-${randomUUID().replaceAll('-', '')}`;
      const post = normalizePostInput('notice', input, { id, isEditing: Boolean(trim(input?.id)), actorClerkUserId });
      try {
        const result = await repository.saveNoticePostAuthoritative({ post });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', post: result.post });
      } catch (error) { return mapRepositoryError(error); }
    },

    async deleteNotice(identity, postId) {
      const admin = await verifyAdmin(identity);
      try {
        const result = await repository.deleteNoticePostAuthoritative({ postId });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', deletedPost: result.deletedPost });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveFaq(identity, actorClerkUserId, input) {
      const admin = await verifyAdmin(identity);
      const id = trim(input?.id) || `faq-${randomUUID().replaceAll('-', '')}`;
      const post = normalizePostInput('faq', input, { id, isEditing: Boolean(trim(input?.id)), actorClerkUserId });
      try {
        const result = await repository.saveFaqPostAuthoritative({ post });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', post: result.post });
      } catch (error) { return mapRepositoryError(error); }
    },

    async deleteFaq(identity, postId) {
      const admin = await verifyAdmin(identity);
      try {
        const result = await repository.deleteFaqPostAuthoritative({ postId });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', deletedPost: result.deletedPost });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveConfig(identity, boardType, postsPerPage) {
      const admin = await verifyAdmin(identity);
      const normalizedType = trim(boardType).toLowerCase();
      if (!['notice', 'faq'].includes(normalizedType)) throw serviceError('board_type_invalid', 'Unsupported board type.', 400);
      try {
        const result = await repository.saveConfigAuthoritative({
          boardType: normalizedType,
          postsPerPage: normalizePageSize(postsPerPage, 10),
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', config: result.config });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveFaqCategory(identity, actorClerkUserId, input) {
      const admin = await verifyAdmin(identity);
      const name = trim(input?.name);
      if (!name) throw serviceError('faq_category_name_required', 'FAQ category name is required.', 400);
      const category = Object.freeze({
        id: trim(input?.id) || `faqcat-${randomUUID().replaceAll('-', '')}`,
        name,
        isEditing: Boolean(trim(input?.id)),
        actorClerkUserId: trim(actorClerkUserId),
      });
      try {
        const result = await repository.saveFaqCategoryAuthoritative({ category });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', category: result.category });
      } catch (error) { return mapRepositoryError(error); }
    },

    async deleteFaqCategory(identity, categoryId) {
      const admin = await verifyAdmin(identity);
      try {
        const result = await repository.deleteFaqCategoryAuthoritative({ categoryId });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', deletedCategory: result.deletedCategory });
      } catch (error) { return mapRepositoryError(error); }
    },
  });
};
