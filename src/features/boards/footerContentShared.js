import { sanitizeRichTextHtml } from '../../utils/richTextCore.js';

export const createDefaultFooterConfigDraft = () => ({
  enabled: true,
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
