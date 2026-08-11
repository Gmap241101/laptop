import { useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  FAQ_POSTS_COLLECTION_REF,
  NOTICE_POSTS_COLLECTION_REF,
} from '../../firebase.js';
import {
  isRichTextEmpty,
  legacyTextToRichHtml,
  richTextHtmlToText,
  sanitizeRichTextHtml,
} from '../../utils/richTextCore.js';
import {
  deleteFaqBoardPost,
  deleteNoticeBoardPost,
  readBoardContentCutoverConfig,
  saveFaqBoardPost,
  saveNoticeBoardPost,
} from './boardContentCutover.js';

const createDefaultNoticePostForm = () => ({
  title: '',
  contentHtml: '',
  isPinned: false,
});

const createDefaultFaqPostForm = () => ({
  categoryId: '',
  title: '',
  contentHtml: '',
  isPinned: false,
});

export const useNoticePostAdminState = () => {
  const [noticePostDialog, setNoticePostDialog] = useState(null);
  const [noticePostForm, setNoticePostForm] = useState(
    createDefaultNoticePostForm
  );
  const [noticePostSaving, setNoticePostSaving] = useState(false);
  const [noticePostDeletingId, setNoticePostDeletingId] = useState('');

  return {
    noticePostDeletingId,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    setNoticePostDeletingId,
    setNoticePostDialog,
    setNoticePostForm,
    setNoticePostSaving,
  };
};

export const useFaqPostAdminState = () => {
  const [faqPostDialog, setFaqPostDialog] = useState(null);
  const [faqPostForm, setFaqPostForm] = useState(
    createDefaultFaqPostForm
  );
  const [faqPostSaving, setFaqPostSaving] = useState(false);
  const [faqPostDeletingId, setFaqPostDeletingId] = useState('');

  return {
    faqPostDeletingId,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    setFaqPostDeletingId,
    setFaqPostDialog,
    setFaqPostForm,
    setFaqPostSaving,
  };
};

export default function useAdminBoardPostController({
  adminExpandedFaqPostId,
  expandedFaqPostId,
  faqCategories,
  faqCategoryNameById,
  faqPostDialog,
  faqPostForm,
  faqPostSaving,
  faqPosts,
  getCurrentAdminAuditActor,
  isAdminAuthenticated,
  noticePostDialog,
  noticePostForm,
  noticePostSaving,
  noticePosts,
  selectedNoticePostId,
  setAdminExpandedFaqPostId,
  setExpandedFaqPostId,
  setFaqPostDeletingId,
  setFaqPostDialog,
  setFaqPostForm,
  setFaqPostSaving,
  setNoticePostDeletingId,
  setNoticePostDialog,
  setNoticePostForm,
  setNoticePostSaving,
  setSelectedNoticePostId,
  triggerConfirm,
  triggerToast,
}) {
  const boardWriteRequested = readBoardContentCutoverConfig().writeRequested;
  const openNoticePostDialog = (post = null) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 공지사항을 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    setNoticePostDialog({
      mode: post ? 'edit' : 'create',
      postId: post?.id || '',
    });

    setNoticePostForm({
      title: post?.title || '',
      contentHtml: sanitizeRichTextHtml(
        post?.contentHtml ||
          legacyTextToRichHtml(
            post?.contentText || post?.content || ''
          )
      ),
      isPinned: Boolean(post?.isPinned),
    });
  };

  const closeNoticePostDialog = () => {
    if (noticePostSaving) return;

    setNoticePostDialog(null);
    setNoticePostForm(createDefaultNoticePostForm());
  };

  const saveNoticePost = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 공지사항을 저장할 수 있습니다.',
        'error'
      );
      return;
    }

    const auditActor = getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 공지사항 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const title = String(noticePostForm.title || '').trim();
    const contentHtml = sanitizeRichTextHtml(
      noticePostForm.contentHtml || ''
    );
    const contentText = richTextHtmlToText(contentHtml);

    if (!title) {
      triggerToast('공지사항 제목을 입력해 주세요.', 'error');
      return;
    }

    if (isRichTextEmpty(contentHtml)) {
      triggerToast('공지사항 내용을 입력해 주세요.', 'error');
      return;
    }

    const isEditing = noticePostDialog?.mode === 'edit';
    const editingPost = isEditing
      ? noticePosts.find(
          (post) => post.id === noticePostDialog?.postId
        ) || null
      : null;

    if (isEditing && !editingPost) {
      triggerToast('수정할 공지사항을 찾을 수 없습니다.', 'error');
      return;
    }

    if (isEditing && !editingPost.createdAt) {
      triggerToast(
        '공지사항 등록 시각을 확인할 수 없어 수정을 중단했습니다.',
        'error'
      );
      return;
    }

    const postDocRef = isEditing
      ? doc(NOTICE_POSTS_COLLECTION_REF, editingPost.id)
      : doc(NOTICE_POSTS_COLLECTION_REF);

    setNoticePostSaving(true);

    try {
      if (boardWriteRequested) {
        await saveNoticeBoardPost({
          ...(isEditing ? { id: editingPost.id } : {}),
          title,
          content: contentText,
          contentText,
          contentHtml,
          contentFormat: 'rich-html-v1',
          isPinned: Boolean(noticePostForm.isPinned),
          authorUid: editingPost?.authorUid || auditActor.uid,
          authorName: editingPost?.authorName || auditActor.name,
        });
      } else {
        await setDoc(postDocRef, {
          id: postDocRef.id,
          title,
          content: contentText,
          contentText,
          contentHtml,
          contentFormat: 'rich-html-v1',
          isPinned: Boolean(noticePostForm.isPinned),
          authorUid: editingPost?.authorUid || auditActor.uid,
          authorName: editingPost?.authorName || auditActor.name,
          viewCount: Number(editingPost?.viewCount) || 0,
          createdAt: editingPost?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      triggerToast(
        `공지사항을 ${
          isEditing
            ? '수정'
            : '등록'
        }했습니다.`,
        'success'
      );

      setNoticePostDialog(null);
      setNoticePostForm(createDefaultNoticePostForm());
    } catch (error) {
      console.error('Notice post save error:', error);

      triggerToast(
        `공지사항 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setNoticePostSaving(false);
    }
  };

  const confirmDeleteNoticePost = (post) => {
    if (!isAdminAuthenticated || !post?.id) {
      triggerToast(
        '관리자 인증과 공지사항 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      '공지사항 삭제',
      `[${post.title || '제목 없음'}] 공지사항을 삭제하시겠습니까? 삭제한 게시글은 복구할 수 없습니다.`,
      async () => {
        setNoticePostDeletingId(post.id);

        try {
          if (boardWriteRequested) {
            await deleteNoticeBoardPost(post.id);
          } else {
            await deleteDoc(
              doc(NOTICE_POSTS_COLLECTION_REF, post.id)
            );
          }

          if (selectedNoticePostId === post.id) {
            setSelectedNoticePostId('');
          }

          if (noticePostDialog?.postId === post.id) {
            setNoticePostDialog(null);
            setNoticePostForm(createDefaultNoticePostForm());
          }

          triggerToast('공지사항을 삭제했습니다.', 'success');
        } catch (error) {
          console.error('Notice post delete error:', error);

          triggerToast(
            `공지사항 삭제에 실패했습니다. 오류 코드: ${
              error?.code ||
              error?.message ||
              'unknown-error'
            }`,
            'error'
          );
        } finally {
          setNoticePostDeletingId('');
        }
      }
    );
  };

  const openFaqPostDialog = (post = null) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 FAQ를 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    if (!post && faqCategories.length === 0) {
      triggerToast(
        'FAQ를 등록하기 전에 카테고리를 먼저 등록해 주세요.',
        'error'
      );
      return;
    }

    setFaqPostDialog({
      mode: post ? 'edit' : 'create',
      postId: post?.id || '',
    });

    setFaqPostForm({
      categoryId: post?.categoryId || faqCategories[0]?.id || '',
      title: post?.title || '',
      contentHtml: sanitizeRichTextHtml(
        post?.contentHtml ||
          legacyTextToRichHtml(
            post?.contentText || post?.content || ''
          )
      ),
      isPinned: Boolean(post?.isPinned),
    });
  };

  const closeFaqPostDialog = () => {
    if (faqPostSaving) return;

    setFaqPostDialog(null);
    setFaqPostForm(createDefaultFaqPostForm());
  };

  const saveFaqPost = async () => {
    if (!isAdminAuthenticated) {
      triggerToast('관리자 인증 후 FAQ를 저장할 수 있습니다.', 'error');
      return;
    }

    const auditActor = getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 FAQ 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const categoryId = String(faqPostForm.categoryId || '').trim();
    const title = String(faqPostForm.title || '').trim();
    const contentHtml = sanitizeRichTextHtml(
      faqPostForm.contentHtml || ''
    );
    const contentText = richTextHtmlToText(contentHtml);

    if (!categoryId || !faqCategoryNameById.has(categoryId)) {
      triggerToast('FAQ 카테고리를 선택해 주세요.', 'error');
      return;
    }

    if (!title) {
      triggerToast('FAQ 제목을 입력해 주세요.', 'error');
      return;
    }

    if (isRichTextEmpty(contentHtml)) {
      triggerToast('FAQ 본문을 입력해 주세요.', 'error');
      return;
    }

    const isEditing = faqPostDialog?.mode === 'edit';
    const editingPost = isEditing
      ? faqPosts.find(
          (post) => post.id === faqPostDialog?.postId
        ) || null
      : null;

    if (isEditing && !editingPost) {
      triggerToast('수정할 FAQ를 찾을 수 없습니다.', 'error');
      return;
    }

    if (isEditing && !editingPost.createdAt) {
      triggerToast(
        'FAQ 등록 시각을 확인할 수 없어 수정을 중단했습니다.',
        'error'
      );
      return;
    }

    const postDocRef = isEditing
      ? doc(FAQ_POSTS_COLLECTION_REF, editingPost.id)
      : doc(FAQ_POSTS_COLLECTION_REF);

    setFaqPostSaving(true);

    try {
      if (boardWriteRequested) {
        await saveFaqBoardPost({
          ...(isEditing ? { id: editingPost.id } : {}),
          categoryId,
          title,
          content: contentText,
          contentText,
          contentHtml,
          contentFormat: 'rich-html-v1',
          isPinned: Boolean(faqPostForm.isPinned),
          authorUid: editingPost?.authorUid || auditActor.uid,
          authorName: editingPost?.authorName || auditActor.name,
        });
      } else {
        await setDoc(postDocRef, {
          id: postDocRef.id,
          categoryId,
          title,
          content: contentText,
          contentText,
          contentHtml,
          contentFormat: 'rich-html-v1',
          isPinned: Boolean(faqPostForm.isPinned),
          authorUid: editingPost?.authorUid || auditActor.uid,
          authorName: editingPost?.authorName || auditActor.name,
          createdAt: editingPost?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      triggerToast(
        `FAQ를 ${
          isEditing
            ? '수정'
            : '등록'
        }했습니다.`,
        'success'
      );

      setFaqPostDialog(null);
      setFaqPostForm(createDefaultFaqPostForm());
    } catch (error) {
      console.error('FAQ post save error:', error);

      triggerToast(
        `FAQ 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    } finally {
      setFaqPostSaving(false);
    }
  };

  const confirmDeleteFaqPost = (post) => {
    if (!isAdminAuthenticated || !post?.id) {
      triggerToast(
        '관리자 인증과 FAQ 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      'FAQ 삭제',
      `[${post.title || '제목 없음'}] FAQ를 삭제하시겠습니까? 삭제한 FAQ는 복구할 수 없습니다.`,
      async () => {
        setFaqPostDeletingId(post.id);

        try {
          if (boardWriteRequested) {
            await deleteFaqBoardPost(post.id);
          } else {
            await deleteDoc(
              doc(FAQ_POSTS_COLLECTION_REF, post.id)
            );
          }

          if (expandedFaqPostId === post.id) {
            setExpandedFaqPostId('');
          }

          if (adminExpandedFaqPostId === post.id) {
            setAdminExpandedFaqPostId('');
          }

          if (faqPostDialog?.postId === post.id) {
            setFaqPostDialog(null);
            setFaqPostForm(createDefaultFaqPostForm());
          }

          triggerToast('FAQ를 삭제했습니다.', 'success');
        } catch (error) {
          console.error('FAQ post delete error:', error);

          triggerToast(
            `FAQ 삭제에 실패했습니다. 오류 코드: ${
              error?.code ||
              error?.message ||
              'unknown-error'
            }`,
            'error'
          );
        } finally {
          setFaqPostDeletingId('');
        }
      }
    );
  };

  return {
    closeFaqPostDialog,
    closeNoticePostDialog,
    confirmDeleteFaqPost,
    confirmDeleteNoticePost,
    openFaqPostDialog,
    openNoticePostDialog,
    saveFaqPost,
    saveNoticePost,
  };
}
