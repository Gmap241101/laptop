import { useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import {
  FOOTER_PAGES_COLLECTION_REF,
  SITE_FOOTER_CONFIG_DOC_REF,
  db,
} from '../../firebase.js';
import { syncSiteContentDomainFromFirestore, SITE_CONTENT_DOMAINS } from '../content/siteContentCutover.js';
import {
  isRichTextEmpty,
  legacyTextToRichHtml,
  richTextHtmlToText,
  sanitizeRichTextHtml,
} from '../../utils/richTextCore.js';

export const FOOTER_PAGE_TYPE_CONTENT = 'content';
export const FOOTER_PAGE_TYPE_LINK = 'link';
export const FOOTER_PAGE_TYPE_NONE = 'none';
export const FOOTER_TITLE_DISPLAY_TEXT = 'text';
export const FOOTER_TITLE_DISPLAY_IMAGE = 'image';

export const getNormalizedFooterPageType = (value) => {
  if (value === FOOTER_PAGE_TYPE_LINK) return FOOTER_PAGE_TYPE_LINK;
  if (value === FOOTER_PAGE_TYPE_NONE) return FOOTER_PAGE_TYPE_NONE;
  return FOOTER_PAGE_TYPE_CONTENT;
};

export const getNormalizedFooterTitleDisplayType = (value) =>
  value === FOOTER_TITLE_DISPLAY_IMAGE
    ? FOOTER_TITLE_DISPLAY_IMAGE
    : FOOTER_TITLE_DISPLAY_TEXT;

export const getSafeFooterLinkUrl = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';

  try {
    const parsedUrl = new URL(normalizedValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';
    return parsedUrl.toString();
  } catch {
    return '';
  }
};

export const createDefaultFooterConfigDraft = () => ({
  enabled: true,
  contentHtml: '',
});

export const createDefaultFooterPageForm = () => ({
  enabled: true,
  title: '',
  titleDisplayType: FOOTER_TITLE_DISPLAY_TEXT,
  titleImageUrl: '',
  pageType: FOOTER_PAGE_TYPE_CONTENT,
  linkUrl: '',
  openInNewTab: true,
  isTitleBold: false,
  contentHtml: '',
});

export const sanitizeFooterCommonHtml = (html = '') => {
  const sanitized = sanitizeRichTextHtml(html);
  if (typeof document === 'undefined') return sanitized;

  const container = document.createElement('div');
  container.innerHTML = sanitized;
  container
    .querySelectorAll('iframe, video, [data-video-provider]')
    .forEach((node) => {
      const wrapper = node.closest?.('[data-video-provider]');
      (wrapper || node).remove();
    });
  return sanitizeRichTextHtml(container.innerHTML);
};

export const useAdminFooterContentState = () => {
  const [footerConfigDraft, setFooterConfigDraft] = useState(
    createDefaultFooterConfigDraft
  );
  const [footerConfigSaving, setFooterConfigSaving] = useState(false);
  const [footerPageDialog, setFooterPageDialog] = useState(null);
  const [footerPageForm, setFooterPageForm] = useState(
    createDefaultFooterPageForm
  );
  const [footerPageSaving, setFooterPageSaving] = useState(false);
  const [footerPageDeletingId, setFooterPageDeletingId] = useState('');
  const [footerPageToggleSavingId, setFooterPageToggleSavingId] =
    useState('');

  return {
    footerConfigDraft,
    footerConfigSaving,
    footerPageDeletingId,
    footerPageDialog,
    footerPageForm,
    footerPageSaving,
    footerPageToggleSavingId,
    setFooterConfigDraft,
    setFooterConfigSaving,
    setFooterPageDeletingId,
    setFooterPageDialog,
    setFooterPageForm,
    setFooterPageSaving,
    setFooterPageToggleSavingId,
  };
};

export default function useAdminFooterContentController({
  footerConfigDraft,
  footerPageDialog,
  footerPageForm,
  footerPageSaving,
  footerPages,
  getCurrentAdminAuditActor,
  isAdminAuthenticated,
  selectedFooterPageId,
  setFooterConfigSaving,
  setFooterPageDeletingId,
  setFooterPageDialog,
  setFooterPageForm,
  setFooterPageSaving,
  setFooterPageToggleSavingId,
  setSelectedFooterPageId,
  triggerConfirm,
  triggerToast,
}) {
  const saveFooterConfig = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 푸터 공통 정보를 저장할 수 있습니다.',
        'error'
      );
      return false;
    }

    const auditActor = getCurrentAdminAuditActor();
    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 푸터 저장을 중단했습니다.',
        'error'
      );
      return false;
    }

    const contentHtml = sanitizeFooterCommonHtml(
      footerConfigDraft.contentHtml || ''
    );
    const contentText = richTextHtmlToText(contentHtml);

    setFooterConfigSaving(true);
    try {
      await setDoc(
        SITE_FOOTER_CONFIG_DOC_REF,
        {
          enabled: Boolean(footerConfigDraft.enabled),
          content: contentText,
          contentText,
          contentHtml,
          contentFormat: 'rich-html-v1',
          updatedByUid: auditActor.uid,
          updatedByName: auditActor.name,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await syncSiteContentDomainFromFirestore({ domain: SITE_CONTENT_DOMAINS.FOOTER });

      triggerToast('푸터 공통 정보를 저장했습니다.', 'success');
      return true;
    } catch (error) {
      console.error('Footer config save error:', error);
      triggerToast(
        `푸터 공통 정보 저장에 실패했습니다. 오류 코드: ${
          error?.code || error?.message || 'unknown-error'
        }`,
        'error'
      );
      return false;
    } finally {
      setFooterConfigSaving(false);
    }
  };

  const openFooterPageDialog = (page = null) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 푸터 메뉴 페이지를 작성하거나 수정할 수 있습니다.',
        'error'
      );
      return;
    }

    const isLegacyDisplayOnlyLink =
      page?.pageType === FOOTER_PAGE_TYPE_LINK &&
      String(page?.linkUrl || '').trim() === '#';
    const nextForm = {
      enabled: page ? page.enabled !== false : true,
      title: page?.title || '',
      titleDisplayType: getNormalizedFooterTitleDisplayType(
        page?.titleDisplayType
      ),
      titleImageUrl: String(page?.titleImageUrl || ''),
      pageType: isLegacyDisplayOnlyLink
        ? FOOTER_PAGE_TYPE_NONE
        : getNormalizedFooterPageType(page?.pageType),
      linkUrl: isLegacyDisplayOnlyLink
        ? ''
        : String(page?.linkUrl || ''),
      openInNewTab: page ? page.openInNewTab !== false : true,
      isTitleBold: Boolean(page?.isTitleBold),
      contentHtml: sanitizeRichTextHtml(
        page?.contentHtml ||
          legacyTextToRichHtml(page?.contentText || page?.content || '')
      ),
    };

    setFooterPageDialog({
      mode: page ? 'edit' : 'create',
      pageId: page?.id || '',
      initialForm: JSON.stringify(nextForm),
    });
    setFooterPageForm(nextForm);
  };

  const resetFooterPageDialog = () => {
    setFooterPageDialog(null);
    setFooterPageForm(createDefaultFooterPageForm());
  };

  const closeFooterPageDialog = () => {
    if (footerPageSaving || !footerPageDialog) return;

    const hasUnsavedChanges =
      JSON.stringify(footerPageForm) !== footerPageDialog.initialForm;

    if (!hasUnsavedChanges) {
      resetFooterPageDialog();
      return;
    }

    triggerConfirm(
      '저장되지 않은 푸터 페이지',
      '저장되지 않은 푸터 페이지 변경사항이 있습니다. 저장하지 않고 닫으시겠습니까?',
      async () => {
        resetFooterPageDialog();
      }
    );
  };

  const saveFooterPage = async () => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 푸터 메뉴 페이지를 저장할 수 있습니다.',
        'error'
      );
      return;
    }

    const auditActor = getCurrentAdminAuditActor();
    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 푸터 페이지 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const title = String(footerPageForm.title || '').trim();
    const titleDisplayType = getNormalizedFooterTitleDisplayType(
      footerPageForm.titleDisplayType
    );
    const rawTitleImageUrl = String(
      footerPageForm.titleImageUrl || ''
    ).trim();
    const safeTitleImageUrl = getSafeFooterLinkUrl(rawTitleImageUrl);
    const pageType = getNormalizedFooterPageType(
      footerPageForm.pageType
    );
    const rawLinkUrl = String(footerPageForm.linkUrl || '').trim();
    const safeLinkUrl =
      pageType === FOOTER_PAGE_TYPE_LINK
        ? getSafeFooterLinkUrl(rawLinkUrl)
        : '';
    const contentHtml = sanitizeRichTextHtml(
      footerPageForm.contentHtml || ''
    );
    const contentText = richTextHtmlToText(contentHtml);

    if (!title) {
      triggerToast(
        titleDisplayType === FOOTER_TITLE_DISPLAY_IMAGE
          ? '이미지의 대체 텍스트와 상세 페이지 제목을 입력해 주세요.'
          : '푸터 메뉴 제목을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (
      titleDisplayType === FOOTER_TITLE_DISPLAY_IMAGE &&
      !rawTitleImageUrl
    ) {
      triggerToast('푸터 메뉴에 표시할 이미지 주소를 입력해 주세요.', 'error');
      return;
    }

    if (
      titleDisplayType === FOOTER_TITLE_DISPLAY_IMAGE &&
      !safeTitleImageUrl
    ) {
      triggerToast(
        '이미지 주소는 http:// 또는 https://로 시작하는 전체 주소여야 합니다.',
        'error'
      );
      return;
    }

    if (
      pageType === FOOTER_PAGE_TYPE_CONTENT &&
      isRichTextEmpty(contentHtml)
    ) {
      triggerToast('푸터 메뉴 상세 본문을 입력해 주세요.', 'error');
      return;
    }

    if (pageType === FOOTER_PAGE_TYPE_LINK && !rawLinkUrl) {
      triggerToast('이동할 링크 주소를 입력해 주세요.', 'error');
      return;
    }

    if (pageType === FOOTER_PAGE_TYPE_LINK && !safeLinkUrl) {
      triggerToast(
        'http:// 또는 https://로 시작하는 올바른 링크 주소를 입력해 주세요.',
        'error'
      );
      return;
    }

    const isEditing = footerPageDialog?.mode === 'edit';
    const editingPage = isEditing
      ? footerPages.find(
          (page) => page.id === footerPageDialog?.pageId
        ) || null
      : null;

    if (isEditing && !editingPage) {
      triggerToast('수정할 푸터 메뉴 페이지를 찾을 수 없습니다.', 'error');
      return;
    }

    const pageDocRef = isEditing
      ? doc(FOOTER_PAGES_COLLECTION_REF, editingPage.id)
      : doc(FOOTER_PAGES_COLLECTION_REF);
    const nextSortOrder = isEditing
      ? Number(editingPage.sortOrder) || footerPages.length
      : footerPages.reduce(
          (maxOrder, page) =>
            Math.max(maxOrder, Number(page.sortOrder) || 0),
          0
        ) + 1;

    setFooterPageSaving(true);
    try {
      await setDoc(pageDocRef, {
        id: pageDocRef.id,
        enabled: Boolean(footerPageForm.enabled),
        title,
        titleDisplayType,
        titleImageUrl: safeTitleImageUrl,
        pageType,
        linkUrl:
          pageType === FOOTER_PAGE_TYPE_LINK ? safeLinkUrl : '',
        openInNewTab:
          pageType === FOOTER_PAGE_TYPE_LINK
            ? Boolean(footerPageForm.openInNewTab)
            : false,
        isTitleBold: Boolean(footerPageForm.isTitleBold),
        sortOrder: nextSortOrder,
        content: contentText,
        contentText,
        contentHtml,
        contentFormat: 'rich-html-v1',
        authorUid: editingPage?.authorUid || auditActor.uid,
        authorName: editingPage?.authorName || auditActor.name,
        createdAt: editingPage?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await syncSiteContentDomainFromFirestore({ domain: SITE_CONTENT_DOMAINS.FOOTER });

      triggerToast(
        `푸터 메뉴 페이지를 ${isEditing ? '수정' : '등록'}했습니다.`,
        'success'
      );
      resetFooterPageDialog();
    } catch (error) {
      console.error('Footer page save error:', error);
      triggerToast(
        `푸터 메뉴 페이지 저장에 실패했습니다. 오류 코드: ${
          error?.code || error?.message || 'unknown-error'
        }`,
        'error'
      );
    } finally {
      setFooterPageSaving(false);
    }
  };

  const toggleFooterPageEnabled = async (page) => {
    if (!isAdminAuthenticated || !page?.id) {
      triggerToast(
        '관리자 인증과 푸터 페이지 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    setFooterPageToggleSavingId(page.id);
    try {
      await updateDoc(doc(FOOTER_PAGES_COLLECTION_REF, page.id), {
        enabled: !Boolean(page.enabled),
        updatedAt: serverTimestamp(),
      });
      await syncSiteContentDomainFromFirestore({ domain: SITE_CONTENT_DOMAINS.FOOTER });
      triggerToast(
        `푸터 메뉴 페이지를 ${
          page.enabled ? '사용안함' : '사용함'
        }으로 변경했습니다.`,
        'success'
      );
    } catch (error) {
      console.error('Footer page enabled toggle error:', error);
      triggerToast(
        '푸터 메뉴 페이지 사용 여부 변경에 실패했습니다.',
        'error'
      );
    } finally {
      setFooterPageToggleSavingId('');
    }
  };

  const moveFooterPage = async (pageId, direction) => {
    if (!isAdminAuthenticated) {
      triggerToast(
        '관리자 인증 후 푸터 메뉴 순서를 변경할 수 있습니다.',
        'error'
      );
      return;
    }

    const currentIndex = footerPages.findIndex(
      (page) => page.id === pageId
    );
    const nextIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= footerPages.length
    ) {
      return;
    }

    const currentPage = footerPages[currentIndex];
    const adjacentPage = footerPages[nextIndex];
    const batch = writeBatch(db);
    batch.update(doc(FOOTER_PAGES_COLLECTION_REF, currentPage.id), {
      sortOrder: nextIndex + 1,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(FOOTER_PAGES_COLLECTION_REF, adjacentPage.id), {
      sortOrder: currentIndex + 1,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      await syncSiteContentDomainFromFirestore({ domain: SITE_CONTENT_DOMAINS.FOOTER });
    } catch (error) {
      console.error('Footer page move error:', error);
      triggerToast('푸터 메뉴 순서 변경에 실패했습니다.', 'error');
    }
  };

  const confirmDeleteFooterPage = (page) => {
    if (!isAdminAuthenticated || !page?.id) {
      triggerToast(
        '관리자 인증과 푸터 페이지 정보를 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      '푸터 메뉴 페이지 삭제',
      `[${
        page.title || '제목 없음'
      }] 페이지를 삭제하시겠습니까? 삭제한 페이지는 복구할 수 없습니다.`,
      async () => {
        setFooterPageDeletingId(page.id);
        try {
          await deleteDoc(doc(FOOTER_PAGES_COLLECTION_REF, page.id));
          await syncSiteContentDomainFromFirestore({ domain: SITE_CONTENT_DOMAINS.FOOTER });
          if (selectedFooterPageId === page.id) {
            setSelectedFooterPageId('');
          }
          if (footerPageDialog?.pageId === page.id) {
            resetFooterPageDialog();
          }
          triggerToast('푸터 메뉴 페이지를 삭제했습니다.', 'success');
        } catch (error) {
          console.error('Footer page delete error:', error);
          triggerToast('푸터 메뉴 페이지 삭제에 실패했습니다.', 'error');
        } finally {
          setFooterPageDeletingId('');
        }
      }
    );
  };

  return {
    closeFooterPageDialog,
    confirmDeleteFooterPage,
    moveFooterPage,
    openFooterPageDialog,
    resetFooterPageDialog,
    saveFooterConfig,
    saveFooterPage,
    toggleFooterPageEnabled,
  };
}
