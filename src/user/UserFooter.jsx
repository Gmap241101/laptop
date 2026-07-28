import { useEffect, useState } from 'react';
import RichTextContent from '../components/RichTextContent.jsx';

const getSafeExternalFooterUrl = (value = '') => {
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

const getFooterPageType = (page = {}) => {
  if (page.pageType === 'none') return 'none';
  if (page.pageType === 'link' && String(page.linkUrl || '').trim() === '#') return 'none';
  return page.pageType === 'link' ? 'link' : 'content';
};

function FooterMenuLabel({ page }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getSafeExternalFooterUrl(page?.titleImageUrl);
  const useImage = page?.titleDisplayType === 'image' && Boolean(imageUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (useImage) {
    return (
      <img
        src={imageUrl}
        alt={page.title || '푸터 메뉴'}
        onError={() => setImageFailed(true)}
        className="h-[1.4em] w-auto max-w-[180px] object-contain"
      />
    );
  }

  return <span>{page?.title || ''}</span>;
}

export default function UserFooter({ ctx }) {
  const {
    footerConfig,
    footerPages,
    openFooterPage,
    selectedFooterPageId,
    userTab,
  } = ctx;

  const visiblePages = (footerPages || []).filter((page) => {
    if (page.enabled === false) return false;
    if (getFooterPageType(page) === 'link') {
      return Boolean(getSafeExternalFooterUrl(page.linkUrl));
    }
    return true;
  });
  const hasCommonContent =
    footerConfig?.enabled !== false &&
    Boolean(String(footerConfig?.contentHtml || footerConfig?.contentText || '').trim());

  if (visiblePages.length === 0 && !hasCommonContent) return null;

  return (
    <footer className="mt-auto border-t border-slate-300 bg-white text-slate-700">
      {visiblePages.length > 0 && (
        <div className="border-b border-slate-400 bg-white">
          <nav
            aria-label="하단 메뉴"
            className="mx-auto flex max-w-7xl flex-wrap items-center justify-start gap-x-7 gap-y-2 px-5 py-4 text-xs sm:gap-x-9 sm:text-sm"
          >
            {visiblePages.map((page) => {
              const pageType = getFooterPageType(page);
              const isLinkPage = pageType === 'link';
              const isDisplayOnly = pageType === 'none';
              const safeLinkUrl = isLinkPage ? getSafeExternalFooterUrl(page.linkUrl) : '';
              const isImageTitle = page.titleDisplayType === 'image';
              const selected =
                pageType === 'content' &&
                userTab === 'footerPage' &&
                selectedFooterPageId === page.id;
              const className = `inline-flex min-h-6 items-center break-keep transition ${
                isDisplayOnly ? 'cursor-default' : 'hover:text-orange-600'
              } ${
                !isImageTitle && (selected || page.isTitleBold)
                  ? 'font-bold text-slate-950'
                  : 'font-medium text-slate-700'
              }`;

              if (isDisplayOnly) {
                return (
                  <span key={page.id} className={className} aria-label={page.title || undefined}>
                    <FooterMenuLabel page={page} />
                  </span>
                );
              }

              if (isLinkPage && safeLinkUrl) {
                const openInNewTab = page.openInNewTab !== false;
                return (
                  <a
                    key={page.id}
                    href={safeLinkUrl}
                    target={openInNewTab ? '_blank' : undefined}
                    rel={openInNewTab ? 'noopener noreferrer' : undefined}
                    className={className}
                    title={openInNewTab ? '새 탭에서 열기' : '현재 탭에서 열기'}
                  >
                    <FooterMenuLabel page={page} />
                  </a>
                );
              }

              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => openFooterPage(page.id)}
                  className={className}
                >
                  <FooterMenuLabel page={page} />
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {hasCommonContent && (
        <div className="bg-slate-100">
          <div className="mx-auto max-w-7xl px-5 py-8">
            <RichTextContent
              html={footerConfig.contentHtml}
              text={footerConfig.contentText || footerConfig.content}
              className="footer-rich-content text-xs leading-6 text-slate-600 sm:text-sm"
            />
          </div>
        </div>
      )}
    </footer>
  );
}
