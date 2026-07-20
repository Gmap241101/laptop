import { RichTextContent } from '../components/RichTextEditor.jsx';

export default function UserFooter({ ctx }) {
  const {
    footerConfig,
    footerPages,
    openFooterPage,
    selectedFooterPageId,
    userTab,
  } = ctx;

  const visiblePages = (footerPages || []).filter((page) => page.enabled !== false);
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
              const selected = userTab === 'footerPage' && selectedFooterPageId === page.id;
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => openFooterPage(page.id)}
                  className={`break-keep transition hover:text-orange-600 ${
                    selected || page.isTitleBold
                      ? 'font-bold text-slate-950'
                      : 'font-medium text-slate-700'
                  }`}
                >
                  {page.title}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {hasCommonContent && (
        <div className="bg-slate-100">
          <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8">
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
