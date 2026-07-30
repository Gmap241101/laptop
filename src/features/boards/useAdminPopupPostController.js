import { useState } from 'react';
import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import {
  POPUP_POSTS_COLLECTION_REF,
  db,
} from '../../firebase.js';
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
  const openPopupPostDialog = (post = null) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 팝업을 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    setPopupPostDialog({
      mode: post ? 'edit' : 'create',
      postId: post?.id || '',
    });

    setPopupPostForm({
      enabled: post ? Boolean(post.enabled) : true,
      title: post?.title || '',
      subtitle: post?.subtitle || '',
      contentHtml: sanitizeRichTextHtml(
        post?.contentHtml ||
          legacyTextToRichHtml(post?.contentText || post?.content || '')
      ),
      startAt:
        toDateTimeLocalValue(post?.startAt) ||
        toDateTimeLocalValue(new Date()),
      endAt: toDateTimeLocalValue(post?.endAt),
      isIndefinite: Boolean(post?.isIndefinite),
      targetPages:
        Array.isArray(post?.targetPages) && post.targetPages.length
          ? post.targetPages.filter((page) =>
              ['home', 'rental'].includes(page)
            )
          : ['home'],
    });
  };

  const closePopupPostDialog = () => {
    if (popupPostSaving) return;
    setPopupPostDialog(null);
    setPopupPostForm(createDefaultPopupPostForm());
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

    const popupDocRef = isEditing
      ? doc(POPUP_POSTS_COLLECTION_REF, editingPost.id)
      : doc(POPUP_POSTS_COLLECTION_REF);

    setPopupPostSaving(true);

    try {
      const orderedPosts = isEditing
        ? [...popupPosts]
        : [...popupPosts, { id: popupDocRef.id }];
      const batch = writeBatch(db);

      orderedPosts.forEach((post, index) => {
        const sortOrder = index + 1;
        if (post.id === popupDocRef.id) {
          batch.set(popupDocRef, {
            id: popupDocRef.id,
            enabled: Boolean(popupPostForm.enabled),
            sortOrder,
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
            createdAt: editingPost?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return;
        }

        if (Number(post.sortOrder) !== sortOrder) {
          batch.update(doc(POPUP_POSTS_COLLECTION_REF, post.id), {
            sortOrder,
            updatedAt: serverTimestamp(),
          });
        }
      });

      await batch.commit();

      triggerToast(
        `팝업을 ${isEditing ? '수정' : '등록'}했습니다.`,
        'success'
      );
      setPopupPostDialog(null);
      setPopupPostForm(createDefaultPopupPostForm());
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
      await updateDoc(doc(POPUP_POSTS_COLLECTION_REF, post.id), {
        enabled: !Boolean(post.enabled),
        updatedAt: serverTimestamp(),
      });
      triggerToast(
        `팝업을 ${post.enabled ? '사용안함' : '사용함'}으로 변경했습니다.`,
        'success'
      );
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

    const reordered = [...popupPosts];
    [reordered[currentIndex], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[currentIndex],
    ];

    try {
      const batch = writeBatch(db);
      reordered.forEach((post, index) => {
        const sortOrder = index + 1;
        if (Number(post.sortOrder) === sortOrder) return;
        batch.update(doc(POPUP_POSTS_COLLECTION_REF, post.id), {
          sortOrder,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.error('Popup order update error:', error);
      triggerToast('팝업 순서 변경에 실패했습니다.', 'error');
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
          const remainingPosts = popupPosts.filter(
            (item) => item.id !== post.id
          );
          const batch = writeBatch(db);
          batch.delete(doc(POPUP_POSTS_COLLECTION_REF, post.id));
          remainingPosts.forEach((item, index) => {
            const sortOrder = index + 1;
            if (Number(item.sortOrder) === sortOrder) return;
            batch.update(doc(POPUP_POSTS_COLLECTION_REF, item.id), {
              sortOrder,
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
          if (popupPostDialog?.postId === post.id) {
            setPopupPostDialog(null);
            setPopupPostForm(createDefaultPopupPostForm());
          }
          triggerToast('팝업을 삭제했습니다.', 'success');
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
