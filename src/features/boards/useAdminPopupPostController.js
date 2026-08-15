import { useState } from 'react';
import {
  createSiteContentDocumentId,
  patchSiteContentDomainInPostgresql,
  SITE_CONTENT_DOMAINS,
} from '../content/siteContentCutover.js';
import {
  invalidateAdminPopupCatalog,
  preloadAdminPopupPostContent,
} from './adminSiteContentCatalogService.js';
import {
  isRichTextEmpty,
  legacyTextToRichHtml,
  richTextHtmlToText,
  sanitizeRichTextHtml,
} from '../../utils/richTextCore.js';
import { toDateTimeLocalValue } from '../../utils/popupUtils.js';

export const createDefaultPopupPostForm = () => ({
  enabled: true,
  title: '',
  subtitle: '',
  contentHtml: '',
  startAt: '',
  endAt: '',
  isIndefinite: false,
  targetPages: ['home'],
});

export const useAdminPopupPostState = () => {
  const [popupPostDialog, setPopupPostDialog] = useState(null);
  const [popupPostForm, setPopupPostForm] = useState(
    createDefaultPopupPostForm
  );
  const [popupPostSaving, setPopupPostSaving] = useState(false);
  const [popupPostDeletingId, setPopupPostDeletingId] = useState('');
  const [popupPostToggleSavingId, setPopupPostToggleSavingId] = useState('');

  return {
    popupPostDeletingId,
    popupPostDialog,
    popupPostForm,
    popupPostSaving,
    popupPostToggleSavingId,
    setPopupPostDeletingId,
    setPopupPostDialog,
    setPopupPostForm,
    setPopupPostSaving,
    setPopupPostToggleSavingId,
  };
};

export default function useAdminPopupPostController({
  getCurrentAdminAuditActor,
  isAdminAuthenticated,
  popupPostDialog,
  popupPostForm,
  popupPostSaving,
  popupPosts,
  setPopupPostDeletingId,
  setPopupPostDialog,
  setPopupPostForm,
  setPopupPostSaving,
  setPopupPostToggleSavingId,
  triggerConfirm,
  triggerToast,
}) {
  const patchPopupDomain = async ({ upserts = [], deletes = [] } = {}) =>
    patchSiteContentDomainInPostgresql({
      domain: SITE_CONTENT_DOMAINS.POPUP,
      upserts,
      deletes,
    });

  const createPopupDocument = (post) => ({
    key: `popupPosts/${post.id}`,
    payload: { ...post, id: post.id },
    enabled: post.enabled !== false,
    sortOrder: post.sortOrder,
  });

  const openPopupPostDialog = async (post = null) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 팝업을 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    let sourcePost = post;
    if (post?.id) {
      try {
        sourcePost = await preloadAdminPopupPostContent(post);
      } catch (error) {
        console.error('Popup content read error:', error);
        triggerToast(
          `팝업 내용을 불러오지 못했습니다. 오류 코드: ${
            error?.code || error?.message || 'popup_content_read_failed'
          }`,
          'error'
        );
        return;
      }
    }

    const nextForm = {
      enabled: sourcePost ? Boolean(sourcePost.enabled) : true,
      title: sourcePost?.title || '',
      subtitle: sourcePost?.subtitle || '',
      contentHtml: sanitizeRichTextHtml(
        sourcePost?.contentHtml ||
          legacyTextToRichHtml(sourcePost?.contentText || sourcePost?.content || '')
      ),
      startAt:
        toDateTimeLocalValue(sourcePost?.startAt) ||
        toDateTimeLocalValue(new Date()),
      endAt: toDateTimeLocalValue(sourcePost?.endAt),
      isIndefinite: Boolean(sourcePost?.isIndefinite),
      targetPages:
        Array.isArray(sourcePost?.targetPages) && sourcePost.targetPages.length
          ? sourcePost.targetPages.filter((page) =>
              ['home', 'rental'].includes(page)
            )
          : ['home'],
    };

    setPopupPostDialog({
      mode: sourcePost ? 'edit' : 'create',
      postId: sourcePost?.id || '',
      initialForm: JSON.stringify(nextForm),
    });
    setPopupPostForm(nextForm);
  };

  const closePopupPostDialog = () => {
    if (popupPostSaving || !popupPostDialog) return;

    const resetDialog = () => {
      setPopupPostDialog(null);
      setPopupPostForm(createDefaultPopupPostForm());
    };

    if (JSON.stringify(popupPostForm) === popupPostDialog.initialForm) {
      resetDialog();
      return;
    }

    triggerConfirm(
      '저장되지 않은 팝업',
      '저장되지 않은 팝업 변경사항이 있습니다. 저장하지 않고 닫으시겠습니까?',
      async () => {
        resetDialog();
      }
    );
  };

  const savePopupPost = async () => {
    if (!isAdminAuthenticated) {
      triggerToast('관리자 인증 후 팝업을 저장할 수 있습니다.', 'error');
      return;
    }

    const auditActor = getCurrentAdminAuditActor();
    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 팝업 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const title = String(popupPostForm.title || '').trim();
    const subtitle = String(popupPostForm.subtitle || '').trim();
    const contentHtml = sanitizeRichTextHtml(
      popupPostForm.contentHtml || ''
    );
    const contentText = richTextHtmlToText(contentHtml);
    const targetPages = [
      ...new Set(
        (
          Array.isArray(popupPostForm.targetPages)
            ? popupPostForm.targetPages
            : []
        ).filter((page) => ['home', 'rental'].includes(page))
      ),
    ];
    const startAt = popupPostForm.startAt
      ? new Date(popupPostForm.startAt)
      : null;
    const isIndefinite = Boolean(popupPostForm.isIndefinite);
    const endAt = !isIndefinite && popupPostForm.endAt
      ? new Date(popupPostForm.endAt)
      : null;

    if (!title && !subtitle && isRichTextEmpty(contentHtml)) {
      triggerToast('표시할 제목, 부제목 또는 내용을 입력해 주세요.', 'error');
      return;
    }

    if (!startAt || Number.isNaN(startAt.getTime())) {
      triggerToast('노출 시작일시를 입력해 주세요.', 'error');
      return;
    }

    if (!isIndefinite && (!endAt || Number.isNaN(endAt.getTime()))) {
      triggerToast(
        '무기한이 아닌 팝업은 노출 종료일시를 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!isIndefinite && endAt.getTime() < startAt.getTime()) {
      triggerToast(
        '노출 종료일시는 노출 시작일시보다 빠를 수 없습니다.',
        'error'
      );
      return;
    }

    if (targetPages.length === 0) {
      triggerToast('팝업을 노출할 페이지를 하나 이상 선택해 주세요.', 'error');
      return;
    }

    const isEditing = popupPostDialog?.mode === 'edit';
    const editingPost = isEditing
      ? popupPosts.find(
          (post) => post.id === popupPostDialog?.postId
        ) || null
      : null;

    if (isEditing && !editingPost) {
      triggerToast('수정할 팝업을 찾을 수 없습니다.', 'error');
      return;
    }

    setPopupPostSaving(true);

    try {
      const popupId = editingPost?.id || createSiteContentDocumentId();
      const updatedAt = new Date();
      const nextSortOrder = isEditing
        ? Number(editingPost?.sortOrder) || 1
        : popupPosts.reduce(
            (maxOrder, post) => Math.max(maxOrder, Number(post?.sortOrder) || 0),
            0
          ) + 1;
      const nextPost = {
        id: popupId,
        enabled: Boolean(popupPostForm.enabled),
        sortOrder: nextSortOrder,
        title,
        subtitle,
        content: contentText,
        contentText,
        contentHtml,
        contentFormat: 'rich-html-v1',
        targetPages,
        startAt,
        endAt: isIndefinite ? null : endAt,
        isIndefinite,
        authorUid: editingPost?.authorUid || auditActor.uid,
        authorName: editingPost?.authorName || auditActor.name,
        createdAt: editingPost?.createdAt || updatedAt,
        updatedAt,
      };
      await patchPopupDomain({ upserts: [createPopupDocument(nextPost)] });
      invalidateAdminPopupCatalog();
      triggerToast('팝업이 성공적으로 저장 및 반영되었습니다.', 'success');
      setPopupPostDialog(null);
      setPopupPostForm(createDefaultPopupPostForm());
      return;
    } catch (error) {
      console.error('Popup post save error:', error);
      triggerToast(
        `팝업 저장에 실패했습니다. 오류 코드: ${
          error?.code || error?.message || 'unknown-error'
        }`,
        'error'
      );
    } finally {
      setPopupPostSaving(false);
    }
  };

  const togglePopupPostEnabled = async (post) => {
    if (!isAdminAuthenticated || !post?.id) {
      triggerToast('관리자 인증과 팝업 정보를 확인해 주세요.', 'error');
      return;
    }

    setPopupPostToggleSavingId(post.id);
    try {
      const fullPost = await preloadAdminPopupPostContent(post);
      await patchPopupDomain({
        upserts: [
          createPopupDocument({
            ...fullPost,
            enabled: !Boolean(post.enabled),
            updatedAt: new Date(),
          }),
        ],
      });
      invalidateAdminPopupCatalog();
      triggerToast('팝업 사용 상태가 성공적으로 저장 및 반영되었습니다.', 'success');
      return;
    } catch (error) {
      console.error('Popup enabled toggle error:', error);
      triggerToast(
        `팝업 사용 여부 변경에 실패했습니다. 오류 코드: ${
          error?.code || error?.message || 'unknown-error'
        }`,
        'error'
      );
    } finally {
      setPopupPostToggleSavingId('');
    }
  };

  const movePopupPost = async (postId, direction) => {
    if (!isAdminAuthenticated) {
      triggerToast('관리자 인증 후 팝업 순서를 변경할 수 있습니다.', 'error');
      return;
    }

    const currentIndex = popupPosts.findIndex(
      (post) => post.id === postId
    );
    const nextIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= popupPosts.length
    ) {
      return;
    }

    try {
      const currentPost = popupPosts[currentIndex];
      const adjacentPost = popupPosts[nextIndex];
      const [fullCurrentPost, fullAdjacentPost] = await Promise.all([
        preloadAdminPopupPostContent(currentPost),
        preloadAdminPopupPostContent(adjacentPost),
      ]);
      const updatedAt = new Date();
      await patchPopupDomain({
        upserts: [
          createPopupDocument({
            ...fullCurrentPost,
            sortOrder: nextIndex + 1,
            updatedAt,
          }),
          createPopupDocument({
            ...fullAdjacentPost,
            sortOrder: currentIndex + 1,
            updatedAt,
          }),
        ],
      });
      invalidateAdminPopupCatalog();
      return;
    } catch (error) {
      console.error('Popup order update error:', error);
      triggerToast(`팝업 순서 변경에 실패했습니다. 오류 코드: ${error?.code || error?.name || 'popup_order_update_failed'}`, 'error');
    }
  };

  const confirmDeletePopupPost = (post) => {
    if (!isAdminAuthenticated || !post?.id) {
      triggerToast('관리자 인증과 팝업 정보를 확인해 주세요.', 'error');
      return;
    }

    triggerConfirm(
      '팝업 삭제',
      `[${
        post.title || post.subtitle || '제목 없음'
      }] 팝업을 삭제하시겠습니까? 삭제한 팝업은 복구할 수 없습니다.`,
      async () => {
        setPopupPostDeletingId(post.id);
        try {
          await patchPopupDomain({ deletes: [`popupPosts/${post.id}`] });
          invalidateAdminPopupCatalog();
          if (popupPostDialog?.postId === post.id) {
            setPopupPostDialog(null);
            setPopupPostForm(createDefaultPopupPostForm());
          }
          triggerToast('팝업 삭제가 성공적으로 반영되었습니다.', 'success');
          return;
        } catch (error) {
          console.error('Popup post delete error:', error);
          triggerToast(
            `팝업 삭제에 실패했습니다. 오류 코드: ${
              error?.code || error?.message || 'unknown-error'
            }`,
            'error'
          );
        } finally {
          setPopupPostDeletingId('');
        }
      }
    );
  };

  return {
    closePopupPostDialog,
    confirmDeletePopupPost,
    movePopupPost,
    openPopupPostDialog,
    savePopupPost,
    togglePopupPostEnabled,
  };
}
