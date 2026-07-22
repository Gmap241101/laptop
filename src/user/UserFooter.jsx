import { useEffect, useState } from 'react';
import { RichTextContent } from '../components/RichTextEditor.jsx';

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

const isDisplayOnlyFooterLink = (value = '') => String(value || '').trim() === '#';

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
    if (page.pageType === 'link') {
      return isDisplayOnlyFooterLink(page.linkUrl) || Boolean(getSafeExternalFooterUrl(page.linkUrl));
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
              const isLinkPage = page.pageType === 'link';
              const isDisplayOnly = isLinkPage && isDisplayOnlyFooterLink(page.linkUrl);
              const safeLinkUrl = isLinkPage && !isDisplayOnly
                ? getSafeExternalFooterUrl(page.linkUrl)
                : '';
              const isImageTitle = page.titleDisplayType === 'image';
              const selected =
                !isLinkPage &&
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
                return (
                  <a
                    key={page.id}
                    href={safeLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    title="새 탭에서 열기"
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
