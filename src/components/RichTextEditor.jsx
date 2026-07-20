import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eye,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  Video,
  Youtube,
  X,
} from 'lucide-react';

const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'STRIKE',
  'H1',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'A',
  'IMG',
  'FIGURE',
  'FIGCAPTION',
  'HR',
  'DIV',
  'SPAN',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'IFRAME',
  'VIDEO',
]);

const DROP_CONTENT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'OBJECT',
  'EMBED',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'META',
  'LINK',
]);

const SAFE_STYLE_PROPERTIES = new Set([
  'text-align',
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'width',
  'max-width',
  'height',
  'margin-left',
  'margin-right',
  'display',
  'border-collapse',
  'aspect-ratio',
  'border',
  'font-size',
  'line-height',
]);


const FONT_SIZE_PRESETS = [11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const LINE_HEIGHT_PRESETS = [1, 1.2, 1.4, 1.5, 1.6, 1.8, 2];
const MIN_FONT_SIZE_PX = 8;
const MAX_FONT_SIZE_PX = 72;
const MIN_LINE_HEIGHT = 0.8;
const MAX_LINE_HEIGHT = 3;
const RICH_TEXT_BLOCK_SELECTOR = 'p,h1,h2,h3,li,blockquote,td,th,div';

const normalizeFontSizeCssValue = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'inherit') return 'inherit';

  const matched = normalized.match(/^(\d+(?:\.\d+)?)(px|pt)$/);
  if (!matched) return '';

  const numericValue = Number(matched[1]);
  if (!Number.isFinite(numericValue)) return '';

  const pxValue = matched[2] === 'pt' ? numericValue * (4 / 3) : numericValue;
  if (pxValue < MIN_FONT_SIZE_PX || pxValue > MAX_FONT_SIZE_PX) return '';

  return `${Number(pxValue.toFixed(2))}px`;
};

const normalizeLineHeightCssValue = (value = '') => {
  const normalized = String(value || '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return '';

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue) || numericValue < MIN_LINE_HEIGHT || numericValue > MAX_LINE_HEIGHT) {
    return '';
  }

  return String(Number(numericValue.toFixed(2)));
};

const formatLineHeightForToolbar = (computedStyle) => {
  if (!computedStyle) return '기본';
  const rawValue = String(computedStyle.lineHeight || '').trim();
  if (!rawValue || rawValue === 'normal') return '기본';

  if (rawValue.endsWith('px')) {
    const lineHeightPx = Number.parseFloat(rawValue);
    const fontSizePx = Number.parseFloat(computedStyle.fontSize || '');
    if (Number.isFinite(lineHeightPx) && Number.isFinite(fontSizePx) && fontSizePx > 0) {
      return String(Number((lineHeightPx / fontSizePx).toFixed(2)));
    }
  }

  const normalized = normalizeLineHeightCssValue(rawValue);
  return normalized || '기본';
};

const ensureTableScrollWrappers = (root) => {
  if (!root?.querySelectorAll) return;

  [...root.querySelectorAll('table')].forEach((table) => {
    if (table.parentElement?.getAttribute('data-table-scroll') === 'true') return;
    const wrapper = root.ownerDocument.createElement('div');
    wrapper.setAttribute('data-table-scroll', 'true');
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
};

const isSafeHttpUrl = (value = '') => {
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isSafeLinkUrl = (value = '') => {
  const normalized = String(value || '').trim();

  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalized)) {
    return true;
  }

  return isSafeHttpUrl(normalized);
};


const parseYouTubeTimeValue = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 0;

  if (/^\d+$/.test(normalized)) return Number(normalized);

  if (/^\d{1,2}:\d{1,2}(?::\d{1,2})?$/.test(normalized)) {
    const parts = normalized.split(':').map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0)) return 0;
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      if (seconds > 59) return 0;
      return minutes * 60 + seconds;
    }
    const [hours, minutes, seconds] = parts;
    if (minutes > 59 || seconds > 59) return 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const matched = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!matched || !matched[0] || !matched.slice(1).some(Boolean)) return 0;
  return Number(matched[1] || 0) * 3600 + Number(matched[2] || 0) * 60 + Number(matched[3] || 0);
};

const formatYouTubeStartTime = (value = 0) => {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
};

const parseYouTubeStartInput = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return 0;
  const parsed = parseYouTubeTimeValue(normalized);
  if (parsed > 0) return parsed;
  return /^(?:0+|0+:0+(?::0+)?)$/.test(normalized) ? 0 : null;
};

const getYouTubeVideoId = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = pathParts[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
      } else if (['embed', 'shorts', 'live'].includes(pathParts[0])) {
        videoId = pathParts[1] || '';
      }
    } else if (host === 'youtube-nocookie.com' && pathParts[0] === 'embed') {
      videoId = pathParts[1] || '';
    }

    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : '';
  } catch {
    return '';
  }
};

const getBooleanQueryParam = (params, name, fallback = false) => {
  const value = params.get(name);
  if (value === null) return fallback;
  return value === '1';
};

const parseYouTubeConfig = (value = '') => {
  const normalized = String(value || '').trim();
  const videoId = getYouTubeVideoId(normalized);
  if (!videoId) return null;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    parsed = null;
  }

  const params = parsed?.searchParams || new URLSearchParams();
  const startFromQuery = parseYouTubeTimeValue(params.get('start') || params.get('t') || '');

  return {
    videoId,
    start: startFromQuery,
    autoplay: getBooleanQueryParam(params, 'autoplay', false),
    mute: getBooleanQueryParam(params, 'mute', false),
    hideControls: params.get('controls') === '0',
    hideFullscreen: params.get('fs') === '0',
    disableKeyboard: params.get('disablekb') === '1',
    playsInline: params.get('playsinline') !== '0',
    enableJsApi: params.get('enablejsapi') === '1',
  };
};

const buildYouTubeEmbedUrl = (config = {}) => {
  const videoId = String(config.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return '';

  const params = new URLSearchParams();
  const start = Math.max(0, Number(config.start) || 0);
  if (start > 0) params.set('start', String(Math.floor(start)));
  if (config.autoplay) params.set('autoplay', '1');
  if (config.mute) params.set('mute', '1');
  if (config.hideControls) params.set('controls', '0');
  if (config.hideFullscreen) params.set('fs', '0');
  if (config.disableKeyboard) params.set('disablekb', '1');
  params.set('playsinline', config.playsInline === false ? '0' : '1');
  if (config.enableJsApi || config.autoplay) params.set('enablejsapi', '1');

  const query = params.toString();
  return `https://www.youtube-nocookie.com/embed/${videoId}${query ? `?${query}` : ''}`;
};

const normalizeYouTubeEmbedUrl = (value = '') => {
  const config = parseYouTubeConfig(value);
  return config ? buildYouTubeEmbedUrl(config) : '';
};

const buildYouTubeEmbedHtml = (value = '', title = 'YouTube 동영상', options = {}) => {
  const parsed = parseYouTubeConfig(value);
  if (!parsed) return '';

  const src = buildYouTubeEmbedUrl({
    ...parsed,
    ...options,
    videoId: parsed.videoId,
  });
  if (!src) return '';

  const safeTitle = String(title || 'YouTube 동영상')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<div data-video-provider="youtube"><iframe src="${src}" title="${safeTitle}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen frameborder="0" style="display: block; width: 100%; max-width: 100%; aspect-ratio: 16 / 9; border: 0;"></iframe></div><p><br></p>`;
};

const buildHtml5VideoHtml = (value = '', title = '일반 동영상', options = {}) => {
  const src = String(value || '').trim();
  if (!isSafeHttpUrl(src)) return '';

  const escapeAttribute = (text) =>
    String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const attributes = [
    `src="${escapeAttribute(src)}"`,
    `title="${escapeAttribute(String(title || '').trim() || '일반 동영상')}"`,
    'controls',
    'playsinline',
    'preload="metadata"',
  ];

  if (options.autoplay) attributes.push('autoplay');
  if (options.loop) attributes.push('loop');
  if (options.muted) attributes.push('muted');

  return `<div data-video-provider="html5"><video ${attributes.join(' ')} style="display: block; width: 100%; max-width: 100%; height: auto; border: 0;"></video></div><p><br></p>`;
};

const sanitizeStyle = (styleText = '') =>
  String(styleText || '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex < 1) return '';

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (!SAFE_STYLE_PROPERTIES.has(property)) return '';
      if (!value || /url\s*\(|expression\s*\(|javascript:/i.test(value)) return '';

      if (property === 'font-size') {
        const safeFontSize = normalizeFontSizeCssValue(value);
        return safeFontSize ? `font-size: ${safeFontSize}` : '';
      }

      if (property === 'line-height') {
        const safeLineHeight = normalizeLineHeightCssValue(value);
        return safeLineHeight ? `line-height: ${safeLineHeight}` : '';
      }

      if (
        (property === 'width' || property === 'max-width' || property === 'height') &&
        !/^(auto|\d+(?:\.\d+)?(?:px|%|rem|em))$/i.test(value)
      ) {
        return '';
      }

      if (
        (property === 'margin-left' || property === 'margin-right') &&
        !/^(auto|0|\d+(?:\.\d+)?(?:px|rem|em|%))$/i.test(value)
      ) {
        return '';
      }

      if (property === 'display' && !/^(block|inline|inline-block|table)$/i.test(value)) {
        return '';
      }

      if (property === 'aspect-ratio' && !/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/i.test(value)) {
        return '';
      }

      if (property === 'border' && !/^(0|none)$/i.test(value)) {
        return '';
      }

      if (property === 'text-align' && !/^(left|center|right|justify)$/i.test(value)) {
        return '';
      }

      return `${property}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');

const sanitizeElementAttributes = (element) => {
  if (element.tagName === 'IMG') {
    const imageSrc = element.getAttribute('src') || '';
    if (!isSafeHttpUrl(imageSrc)) return false;
  }

  if (element.tagName === 'IFRAME') {
    const normalizedSrc = normalizeYouTubeEmbedUrl(element.getAttribute('src') || '');
    if (!normalizedSrc) return false;
  }

  if (element.tagName === 'VIDEO') {
    const videoSrc = element.getAttribute('src') || '';
    if (!isSafeHttpUrl(videoSrc)) return false;
  }

  [...element.attributes].forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    let keep = false;

    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      return;
    }

    if (name === 'style') {
      const safeStyle = sanitizeStyle(value);
      if (safeStyle) element.setAttribute('style', safeStyle);
      else element.removeAttribute('style');
      return;
    }

    if (element.tagName === 'A') {
      keep = ['href', 'target', 'rel', 'title'].includes(name);
      if (name === 'href' && !isSafeLinkUrl(value)) keep = false;
    } else if (element.tagName === 'IMG') {
      keep = ['src', 'alt', 'title', 'width', 'height', 'loading'].includes(name);
      if (name === 'src' && !isSafeHttpUrl(value)) keep = false;
    } else if (element.tagName === 'IFRAME') {
      keep = ['src', 'title', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'frameborder', 'width', 'height'].includes(name);
    } else if (element.tagName === 'VIDEO') {
      keep = ['src', 'title', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'preload', 'width', 'height'].includes(name);
      if (name === 'src' && !isSafeHttpUrl(value)) keep = false;
      if (name === 'preload' && !['none', 'metadata', 'auto'].includes(String(value || '').toLowerCase())) keep = false;
    } else if (element.tagName === 'TD' || element.tagName === 'TH') {
      keep = ['colspan', 'rowspan'].includes(name);
    } else if (element.tagName === 'FIGURE') {
      keep = ['data-align', 'data-width'].includes(name);
    } else if (element.tagName === 'DIV') {
      keep = ['data-video-provider', 'data-table-scroll'].includes(name);
      if (name === 'data-table-scroll' && value !== 'true') keep = false;
    }

    if (!keep) element.removeAttribute(attribute.name);
  });

  if (element.tagName === 'A') {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  }

  if (element.tagName === 'IMG') {
    element.setAttribute('loading', 'lazy');
    element.setAttribute('style', `${sanitizeStyle(element.getAttribute('style'))}; max-width: 100%; height: auto;`.replace(/^;\s*/, ''));
  }

  if (element.tagName === 'VIDEO') {
    element.setAttribute('title', element.getAttribute('title') || '일반 동영상');
    element.setAttribute('controls', '');
    element.setAttribute('playsinline', '');
    element.setAttribute('preload', element.getAttribute('preload') || 'metadata');
    element.setAttribute('style', 'display: block; width: 100%; max-width: 100%; height: auto; border: 0;');
  }

  if (element.tagName === 'DIV') {
    const provider = element.getAttribute('data-video-provider');
    if (provider && !['youtube', 'html5'].includes(provider)) {
      element.removeAttribute('data-video-provider');
    }
    if (element.hasAttribute('data-table-scroll')) {
      element.setAttribute('data-table-scroll', 'true');
    }
  }

  if (element.tagName === 'IFRAME') {
    const normalizedSrc = normalizeYouTubeEmbedUrl(element.getAttribute('src') || '');
    const youtubeConfig = parseYouTubeConfig(normalizedSrc);
    element.setAttribute('src', normalizedSrc);
    element.setAttribute('title', element.getAttribute('title') || 'YouTube 동영상');
    element.setAttribute('loading', youtubeConfig?.autoplay ? 'eager' : 'lazy');
    element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    element.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    element.setAttribute('allowfullscreen', '');
    element.setAttribute('frameborder', '0');
    element.setAttribute('style', 'display: block; width: 100%; max-width: 100%; aspect-ratio: 16 / 9; border: 0;');
  }

  return true;
};

export const sanitizeRichTextHtml = (html = '') => {
  if (typeof document === 'undefined') {
    return String(html || '');
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;

  if (!root) return '';

  const cleanNode = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) return;

      if (DROP_CONTENT_TAGS.has(child.tagName)) {
        child.remove();
        return;
      }

      if (!ALLOWED_TAGS.has(child.tagName)) {
        cleanNode(child);
        child.replaceWith(...child.childNodes);
        return;
      }

      if (!sanitizeElementAttributes(child)) {
        child.remove();
        return;
      }

      cleanNode(child);
    });
  };

  cleanNode(root);
  ensureTableScrollWrappers(root);
  return root.innerHTML.trim();
};

export const legacyTextToRichHtml = (text = '') => {
  const normalized = String(text || '').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return '';

  const escapeText = (value) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

export const richTextHtmlToText = (html = '') => {
  if (typeof document === 'undefined') {
    return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const container = document.createElement('div');
  container.innerHTML = sanitizeRichTextHtml(html);

  container.querySelectorAll('img').forEach((image) => {
    const alt = image.getAttribute('alt')?.trim();
    if (alt) image.insertAdjacentText('afterend', ` ${alt} `);
  });

  container.querySelectorAll('iframe, video').forEach((media) => {
    const title = media.getAttribute('title')?.trim();
    if (title) media.insertAdjacentText('afterend', ` ${title} `);
  });

  container.querySelectorAll('br').forEach((lineBreak) => {
    lineBreak.replaceWith(document.createTextNode('\n'));
  });

  container
    .querySelectorAll('p, h1, h2, h3, li, blockquote, figcaption, tr, hr')
    .forEach((block) => {
      block.insertAdjacentText('afterend', '\n');
    });

  return String(container.textContent || '')
    .replace(/\u200B/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const isRichTextEmpty = (html = '') => {
  if (typeof document === 'undefined') {
    return !richTextHtmlToText(html);
  }

  const container = document.createElement('div');
  container.innerHTML = sanitizeRichTextHtml(html);
  const hasMedia = Boolean(container.querySelector('img, iframe, video, table, hr'));
  return !richTextHtmlToText(container.innerHTML) && !hasMedia;
};

const ToolbarButton = ({ active = false, children, title, ...props }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-slate-600 transition ${
      active
        ? 'border-orange-300 bg-orange-50 text-orange-700'
        : 'border-slate-200 bg-white hover:border-orange-300 hover:text-orange-600'
    }`}
    {...props}
  >
    {children}
  </button>
);

const createEmptyYouTubeForm = () => ({
  url: '',
  title: '',
  start: '00:00',
  autoplay: false,
  mute: true,
  hideControls: false,
  hideFullscreen: false,
  disableKeyboard: false,
});

const getYouTubeFormFromIframe = (iframe) => {
  const sourceUrl =
    iframe?.getAttribute('data-stored-youtube-src') ||
    iframe?.getAttribute('src') ||
    '';

  const config = parseYouTubeConfig(sourceUrl);
  if (!config) return createEmptyYouTubeForm();

  return {
    url: `https://www.youtube.com/watch?v=${config.videoId}`,
    title: iframe?.getAttribute('title') || 'YouTube 동영상',
    start: formatYouTubeStartTime(config.start),
    autoplay: config.autoplay,
    mute: config.mute,
    hideControls: config.hideControls,
    hideFullscreen: config.hideFullscreen,
    disableKeyboard: config.disableKeyboard,
  };
};

const createEmptyHtml5VideoForm = () => ({
  url: '',
  title: '',
  autoplay: false,
  loop: false,
  muted: false,
});

const getHtml5VideoFormFromElement = (video) => ({
  url: video?.getAttribute('src') || '',
  title: video?.getAttribute('title') || '일반 동영상',
  autoplay: video?.hasAttribute('data-stored-html5-autoplay') || video?.hasAttribute('autoplay') || false,
  loop: video?.hasAttribute('loop') || false,
  muted: video?.hasAttribute('muted') || false,
});

const addYouTubeEditorControls = (container) => {
  const wrappers = [];
  if (container.matches?.('[data-video-provider="youtube"]')) wrappers.push(container);
  wrappers.push(...container.querySelectorAll('[data-video-provider="youtube"]'));

  wrappers.forEach((wrapper) => {
    if (wrapper.querySelector('[data-youtube-editor-control]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-youtube-editor-control', 'true');
    button.setAttribute('contenteditable', 'false');
    button.setAttribute('aria-label', 'YouTube 동영상 설정 수정');
    button.textContent = '영상 설정';
    wrapper.appendChild(button);
  });
};

const addHtml5VideoEditorControls = (container) => {
  const wrappers = [];
  if (container.matches?.('[data-video-provider="html5"]')) wrappers.push(container);
  wrappers.push(...container.querySelectorAll('[data-video-provider="html5"]'));

  wrappers.forEach((wrapper) => {
    if (wrapper.querySelector('[data-html5-video-editor-control]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-html5-video-editor-control', 'true');
    button.setAttribute('contenteditable', 'false');
    button.setAttribute('aria-label', '일반 동영상 설정 수정');
    button.textContent = '영상 설정';
    wrapper.appendChild(button);
  });
};

const prepareEditorPreviewHtml = (html = '') => {
  if (typeof document === 'undefined') return sanitizeRichTextHtml(html);

  const container = document.createElement('div');
  container.innerHTML = sanitizeRichTextHtml(html);
  container.querySelectorAll('iframe').forEach((iframe) => {
    const src = iframe.getAttribute('src') || '';
    const config = parseYouTubeConfig(src);
    if (!config || !config.autoplay) return;

    iframe.setAttribute('data-stored-youtube-src', src);
    iframe.setAttribute(
      'src',
      buildYouTubeEmbedUrl({
        ...config,
        autoplay: false,
      })
    );
  });

  container.querySelectorAll('video[autoplay]').forEach((video) => {
    video.setAttribute('data-stored-html5-autoplay', 'true');
    video.removeAttribute('autoplay');
  });

  addYouTubeEditorControls(container);
  addHtml5VideoEditorControls(container);
  return container.innerHTML;
};

const getStoredHtmlFromEditor = (editor) => {
  if (!editor || typeof document === 'undefined') return '';
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('iframe[data-stored-youtube-src]').forEach((iframe) => {
    iframe.setAttribute('src', iframe.getAttribute('data-stored-youtube-src') || '');
    iframe.removeAttribute('data-stored-youtube-src');
  });
  clone.querySelectorAll('video[data-stored-html5-autoplay]').forEach((video) => {
    video.setAttribute('autoplay', '');
    video.removeAttribute('data-stored-html5-autoplay');
  });
  clone.querySelectorAll('[data-youtube-selected]').forEach((node) => {
    node.removeAttribute('data-youtube-selected');
  });
  clone.querySelectorAll('[data-html5-video-selected]').forEach((node) => {
    node.removeAttribute('data-html5-video-selected');
  });
  clone.querySelectorAll('[data-table-cell-selected]').forEach((node) => {
    node.removeAttribute('data-table-cell-selected');
  });
  clone.querySelectorAll('[data-youtube-editor-control]').forEach((node) => node.remove());
  clone.querySelectorAll('[data-html5-video-editor-control]').forEach((node) => node.remove());
  const textWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    textNode.textContent = String(textNode.textContent || '').replace(/\u200B/g, '');
    textNode = textWalker.nextNode();
  }
  clone.querySelectorAll('span').forEach((span) => {
    if (!span.textContent && span.children.length === 0) span.remove();
  });
  return sanitizeRichTextHtml(clone.innerHTML);
};

export function RichTextEditor({
  value = '',
  onChange,
  label = '본문',
  placeholder = '내용을 입력해 주세요.',
  minHeight = 300,
  disabled = false,
  allowVideos = true,
}) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const lastEmittedHtmlRef = useRef('');
  const selectedYouTubeRef = useRef(null);
  const selectedHtml5VideoRef = useRef(null);
  const [imagePanelOpen, setImagePanelOpen] = useState(false);
  const [imageForm, setImageForm] = useState({
    url: '',
    alt: '',
    caption: '',
    align: 'center',
    width: '100',
  });
  const [imageError, setImageError] = useState('');
  const [youtubePanelOpen, setYouTubePanelOpen] = useState(false);
  const [youtubeForm, setYouTubeForm] = useState(createEmptyYouTubeForm);
  const [youtubeError, setYouTubeError] = useState('');
  const [editingYouTube, setEditingYouTube] = useState(false);
  const [html5VideoPanelOpen, setHtml5VideoPanelOpen] = useState(false);
  const [html5VideoForm, setHtml5VideoForm] = useState(createEmptyHtml5VideoForm);
  const [html5VideoError, setHtml5VideoError] = useState('');
  const [editingHtml5Video, setEditingHtml5Video] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(String(value || ''));
  const selectedTableCellRef = useRef(null);
  const [currentFontSize, setCurrentFontSize] = useState('기본');
  const [currentLineHeight, setCurrentLineHeight] = useState('기본');
  const [fontSizePanelOpen, setFontSizePanelOpen] = useState(false);
  const [customFontSize, setCustomFontSize] = useState('14');
  const [fontSizeError, setFontSizeError] = useState('');
  const [lineHeightPanelOpen, setLineHeightPanelOpen] = useState(false);
  const [customLineHeight, setCustomLineHeight] = useState('1.5');
  const [lineHeightError, setLineHeightError] = useState('');
  const [tablePanelOpen, setTablePanelOpen] = useState(false);
  const [tableRows, setTableRows] = useState('3');
  const [tableColumns, setTableColumns] = useState('2');
  const [tableHasHeader, setTableHasHeader] = useState(true);
  const [tableError, setTableError] = useState('');
  const [editingTable, setEditingTable] = useState(false);

  useEffect(() => {
    const nextHtml = String(value || '');

    if (sourceMode) {
      if (lastEmittedHtmlRef.current !== nextHtml) setSourceValue(nextHtml);
      return;
    }

    const editor = editorRef.current;
    if (!editor) return;

    if (getStoredHtmlFromEditor(editor) !== sanitizeRichTextHtml(nextHtml) && lastEmittedHtmlRef.current !== nextHtml) {
      editor.innerHTML = prepareEditorPreviewHtml(nextHtml);
    }
  }, [sourceMode, value]);

  const emitChange = () => {
    const html = getStoredHtmlFromEditor(editorRef.current);
    lastEmittedHtmlRef.current = html;
    onChange?.(html);
  };

  const focusEditor = () => editorRef.current?.focus();

  const runCommand = (command, commandValue = null) => {
    if (disabled) return;
    focusEditor();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const getElementFromNode = (node) => {
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  };

  const updateFormattingState = (range = savedRangeRef.current) => {
    const editor = editorRef.current;
    if (!editor || !range || typeof window === 'undefined') return;

    const startElement = getElementFromNode(range.startContainer);
    const endElement = getElementFromNode(range.endContainer);
    if (!startElement || !editor.contains(startElement)) return;

    const startStyle = window.getComputedStyle(startElement);
    const endStyle = endElement && editor.contains(endElement)
      ? window.getComputedStyle(endElement)
      : startStyle;

    const startFontSize = normalizeFontSizeCssValue(startStyle.fontSize) || '기본';
    const endFontSize = normalizeFontSizeCssValue(endStyle.fontSize) || startFontSize;
    setCurrentFontSize(startFontSize === endFontSize ? startFontSize : '혼합');

    const startLineHeight = formatLineHeightForToolbar(startStyle);
    const endLineHeight = formatLineHeightForToolbar(endStyle);
    setCurrentLineHeight(startLineHeight === endLineHeight ? startLineHeight : '혼합');
  };

  const saveSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
      updateFormattingState(range);
    }
  };

  const clearFormattingPanels = () => {
    setFontSizePanelOpen(false);
    setLineHeightPanelOpen(false);
    setTablePanelOpen(false);
    setFontSizeError('');
    setLineHeightError('');
    setTableError('');
  };

  const clearSelectedTableCell = () => {
    const selectedCell = selectedTableCellRef.current;
    if (selectedCell) selectedCell.removeAttribute('data-table-cell-selected');
    selectedTableCellRef.current = null;
  };

  const restoreSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || !savedRangeRef.current) return;

    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
  };

  const getSelectedBlockElements = () => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor || !range) return [];

    const closestBlock = (node) => {
      const element = getElementFromNode(node);
      const block = element?.closest?.(RICH_TEXT_BLOCK_SELECTOR);
      if (!block || block === editor || !editor.contains(block) || block.matches('[data-video-provider], [data-table-scroll]')) {
        return null;
      }
      return block;
    };

    if (range.collapsed) {
      const block = closestBlock(range.startContainer);
      return block ? [block] : [];
    }

    const blocks = new Set();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      try {
        if (range.intersectsNode(textNode) && String(textNode.textContent || '').length > 0) {
          const block = closestBlock(textNode);
          if (block) blocks.add(block);
        }
      } catch {
        // 분리된 노드는 무시합니다.
      }
      textNode = walker.nextNode();
    }

    if (blocks.size === 0) {
      const block = closestBlock(range.commonAncestorContainer);
      if (block) blocks.add(block);
    }

    return [...blocks];
  };

  const convertTemporaryFontTags = (fontSizeValue = 'inherit') => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.querySelectorAll('font[size="7"]').forEach((font) => {
      const span = document.createElement('span');
      span.style.fontSize = fontSizeValue;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
  };

  const applyFontSize = (fontSizeValue) => {
    if (disabled || sourceMode) return;
    const safeFontSize = fontSizeValue === 'inherit'
      ? 'inherit'
      : normalizeFontSizeCssValue(`${fontSizeValue}px`);
    if (!safeFontSize) return;

    focusEditor();
    restoreSelection();
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

    if (range?.collapsed) {
      const span = document.createElement('span');
      span.style.fontSize = safeFontSize;
      const placeholder = document.createTextNode('\u200B');
      span.appendChild(placeholder);
      range.insertNode(span);
      range.setStart(placeholder, placeholder.textContent.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      savedRangeRef.current = range.cloneRange();
    } else {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
      convertTemporaryFontTags(safeFontSize);
    }

    emitChange();
    saveSelection();
    setCurrentFontSize(safeFontSize === 'inherit' ? '기본' : safeFontSize);
  };

  const openFontSizePanel = () => {
    saveSelection();
    setImagePanelOpen(false);
    setYouTubePanelOpen(false);
    setHtml5VideoPanelOpen(false);
    clearSelectedYouTube();
    clearSelectedHtml5Video();
    clearSelectedTableCell();
    setLineHeightPanelOpen(false);
    setTablePanelOpen(false);
    setFontSizeError('');
    const currentNumeric = Number.parseFloat(currentFontSize);
    setCustomFontSize(
      Number.isInteger(currentNumeric) && currentNumeric >= MIN_FONT_SIZE_PX && currentNumeric <= MAX_FONT_SIZE_PX
        ? String(currentNumeric)
        : '14'
    );
    setFontSizePanelOpen(true);
  };

  const applyCustomFontSize = () => {
    const normalized = String(customFontSize || '').trim();
    if (!/^\d+$/.test(normalized)) {
      setFontSizeError('글자 크기는 정수로 입력해 주세요.');
      return;
    }

    const numericValue = Number(normalized);
    if (numericValue < MIN_FONT_SIZE_PX || numericValue > MAX_FONT_SIZE_PX) {
      setFontSizeError(`글자 크기는 ${MIN_FONT_SIZE_PX}px부터 ${MAX_FONT_SIZE_PX}px까지 입력할 수 있습니다.`);
      return;
    }

    applyFontSize(numericValue);
    setFontSizePanelOpen(false);
    setFontSizeError('');
  };

  const applyLineHeight = (lineHeightValue) => {
    if (disabled || sourceMode) return;
    const safeLineHeight = lineHeightValue === ''
      ? ''
      : normalizeLineHeightCssValue(lineHeightValue);
    if (lineHeightValue !== '' && !safeLineHeight) return;

    focusEditor();
    restoreSelection();
    let blocks = getSelectedBlockElements();
    if (blocks.length === 0) {
      document.execCommand('formatBlock', false, 'p');
      saveSelection();
      blocks = getSelectedBlockElements();
    }
    if (blocks.length === 0) {
      window.alert('줄간격을 적용할 문단 안에 커서를 두거나 문단을 선택해 주세요.');
      return;
    }

    blocks.forEach((block) => {
      if (safeLineHeight) block.style.lineHeight = safeLineHeight;
      else block.style.removeProperty('line-height');
      if (!block.getAttribute('style')?.trim()) block.removeAttribute('style');
    });

    emitChange();
    saveSelection();
    setCurrentLineHeight(safeLineHeight || '기본');
  };

  const openLineHeightPanel = () => {
    saveSelection();
    setImagePanelOpen(false);
    setYouTubePanelOpen(false);
    setHtml5VideoPanelOpen(false);
    clearSelectedYouTube();
    clearSelectedHtml5Video();
    clearSelectedTableCell();
    setFontSizePanelOpen(false);
    setTablePanelOpen(false);
    setLineHeightError('');
    const currentNumeric = Number.parseFloat(currentLineHeight);
    setCustomLineHeight(
      Number.isFinite(currentNumeric) && currentNumeric >= MIN_LINE_HEIGHT && currentNumeric <= MAX_LINE_HEIGHT
        ? String(currentNumeric)
        : '1.5'
    );
    setLineHeightPanelOpen(true);
  };

  const applyCustomLineHeight = () => {
    const normalized = String(customLineHeight || '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      setLineHeightError('줄간격은 소수점 둘째 자리까지의 숫자로 입력해 주세요.');
      return;
    }

    const numericValue = Number(normalized);
    if (numericValue < MIN_LINE_HEIGHT || numericValue > MAX_LINE_HEIGHT) {
      setLineHeightError(`줄간격은 ${MIN_LINE_HEIGHT}부터 ${MAX_LINE_HEIGHT}까지 입력할 수 있습니다.`);
      return;
    }

    applyLineHeight(String(numericValue));
    setLineHeightPanelOpen(false);
    setLineHeightError('');
  };

  const resolveTableCellFromSavedRange = () => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor || !range) return null;
    const element = getElementFromNode(range.commonAncestorContainer);
    const cell = element?.closest?.('td,th');
    return cell && editor.contains(cell) ? cell : null;
  };

  const selectTableCell = (cell) => {
    clearSelectedTableCell();
    if (!cell || !editorRef.current?.contains(cell)) return;
    cell.setAttribute('data-table-cell-selected', 'true');
    selectedTableCellRef.current = cell;
  };

  const openTablePanel = () => {
    saveSelection();
    setImagePanelOpen(false);
    setYouTubePanelOpen(false);
    setHtml5VideoPanelOpen(false);
    clearSelectedYouTube();
    clearSelectedHtml5Video();
    setFontSizePanelOpen(false);
    setLineHeightPanelOpen(false);
    setTableError('');
    const cell = resolveTableCellFromSavedRange();
    if (cell) {
      selectTableCell(cell);
      setEditingTable(true);
    } else {
      clearSelectedTableCell();
      setEditingTable(false);
      setTableRows('3');
      setTableColumns('2');
      setTableHasHeader(true);
    }
    setTablePanelOpen(true);
  };

  const closeTablePanel = () => {
    setTablePanelOpen(false);
    setTableError('');
    setEditingTable(false);
    clearSelectedTableCell();
  };

  const buildTableHtml = (rowCount, columnCount, hasHeader) => {
    const rows = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const cellTag = hasHeader && rowIndex === 0 ? 'th' : 'td';
      const cells = [];
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const label = hasHeader && rowIndex === 0
          ? `제목 ${columnIndex + 1}`
          : '내용';
        cells.push(`<${cellTag}>${label}</${cellTag}>`);
      }
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
    return `<div data-table-scroll="true"><table><tbody>${rows.join('')}</tbody></table></div><p><br></p>`;
  };

  const insertConfiguredTable = () => {
    const rowCount = Number(tableRows);
    const columnCount = Number(tableColumns);
    if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 20) {
      setTableError('행 개수는 1개부터 20개까지 입력할 수 있습니다.');
      return;
    }
    if (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > 10) {
      setTableError('열 개수는 1개부터 10개까지 입력할 수 있습니다.');
      return;
    }

    focusEditor();
    restoreSelection();
    document.execCommand('insertHTML', false, sanitizeRichTextHtml(buildTableHtml(rowCount, columnCount, tableHasHeader)));
    emitChange();
    closeTablePanel();
  };

  const focusCellAfterTableEdit = (cell) => {
    if (!cell) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const selection = window.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    selectTableCell(cell);
  };

  const getEditingTableContext = () => {
    const cell = selectedTableCellRef.current || resolveTableCellFromSavedRange();
    const row = cell?.closest?.('tr');
    const table = cell?.closest?.('table');
    if (!cell || !row || !table || !editorRef.current?.contains(table)) return null;
    return {
      cell,
      row,
      table,
      cellIndex: [...row.cells].indexOf(cell),
      rowIndex: [...table.rows].indexOf(row),
    };
  };

  const createCellForRow = (row, referenceCell = null, forcedTagName = '') => {
    const tagName = forcedTagName || (referenceCell?.tagName === 'TH' || row.parentElement?.tagName === 'THEAD' ? 'th' : 'td');
    const cell = document.createElement(tagName);
    cell.innerHTML = '<br>';
    return cell;
  };

  const addTableRow = (position) => {
    const context = getEditingTableContext();
    if (!context) return;
    const { row, table, cellIndex } = context;
    const newRow = document.createElement('tr');
    const columnCount = Math.max(1, row.cells.length);
    for (let index = 0; index < columnCount; index += 1) {
      newRow.appendChild(createCellForRow(row, row.cells[index], 'td'));
    }
    row.parentElement.insertBefore(newRow, position === 'above' ? row : row.nextSibling);
    emitChange();
    focusCellAfterTableEdit(newRow.cells[Math.min(cellIndex, newRow.cells.length - 1)] || newRow.cells[0]);
    setEditingTable(Boolean(table));
  };

  const deleteTableRow = () => {
    const context = getEditingTableContext();
    if (!context) return;
    const { row, table, rowIndex, cellIndex } = context;
    if (table.rows.length <= 1) {
      if (!window.confirm('마지막 행입니다. 표 전체를 삭제할까요?')) return;
      deleteCurrentTable();
      return;
    }
    row.remove();
    const nextRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
    emitChange();
    focusCellAfterTableEdit(nextRow?.cells[Math.min(cellIndex, nextRow.cells.length - 1)] || nextRow?.cells[0]);
  };

  const addTableColumn = (position) => {
    const context = getEditingTableContext();
    if (!context) return;
    const { table, cellIndex, rowIndex } = context;
    const insertIndex = position === 'left' ? cellIndex : cellIndex + 1;
    [...table.rows].forEach((row) => {
      const referenceCell = row.cells[Math.min(cellIndex, row.cells.length - 1)] || null;
      const newCell = createCellForRow(row, referenceCell);
      row.insertBefore(newCell, row.cells[insertIndex] || null);
    });
    emitChange();
    const targetRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
    focusCellAfterTableEdit(targetRow?.cells[insertIndex] || targetRow?.cells[targetRow.cells.length - 1]);
  };

  const deleteTableColumn = () => {
    const context = getEditingTableContext();
    if (!context) return;
    const { table, cellIndex, rowIndex } = context;
    const maxColumns = Math.max(...[...table.rows].map((row) => row.cells.length));
    if (maxColumns <= 1) {
      if (!window.confirm('마지막 열입니다. 표 전체를 삭제할까요?')) return;
      deleteCurrentTable();
      return;
    }
    [...table.rows].forEach((row) => row.cells[cellIndex]?.remove());
    emitChange();
    const targetRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
    focusCellAfterTableEdit(targetRow?.cells[Math.min(cellIndex, targetRow.cells.length - 1)] || targetRow?.cells[0]);
  };

  const deleteCurrentTable = () => {
    const context = getEditingTableContext();
    if (!context) return;
    const { table } = context;
    const wrapper = table.parentElement?.getAttribute('data-table-scroll') === 'true'
      ? table.parentElement
      : table;
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<br>';
    wrapper.replaceWith(paragraph);
    emitChange();
    clearSelectedTableCell();
    setTablePanelOpen(false);
    setEditingTable(false);
    focusEditor();
  };

  const clearAllFormatting = () => {
    if (disabled || sourceMode) return;
    focusEditor();
    restoreSelection();
    document.execCommand('removeFormat', false, null);
    saveSelection();
    getSelectedBlockElements().forEach((block) => {
      block.style.removeProperty('line-height');
      if (!block.getAttribute('style')?.trim()) block.removeAttribute('style');
    });
    emitChange();
    saveSelection();
  };

  const insertLink = () => {
    saveSelection();
    const currentUrl = window.prompt('연결할 주소를 입력해 주세요.\n예: https://example.com');
    if (currentUrl === null) return;

    const url = currentUrl.trim();
    if (!isSafeLinkUrl(url)) {
      window.alert('http://, https:// 또는 올바른 mailto: 주소만 사용할 수 있습니다.');
      return;
    }

    focusEditor();
    restoreSelection();

    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) {
      document.execCommand('createLink', false, url);
      editorRef.current
        ?.querySelectorAll('a')
        .forEach((anchor) => {
          if (anchor.getAttribute('href') === url || anchor.href === url) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
          }
        });
    } else {
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${url}</a>`
      );
    }

    emitChange();
  };

  const openImagePanel = () => {
    saveSelection();
    clearFormattingPanels();
    clearSelectedTableCell();
    setYouTubePanelOpen(false);
    setYouTubeError('');
    setEditingYouTube(false);
    clearSelectedYouTube();
    setHtml5VideoPanelOpen(false);
    setHtml5VideoError('');
    setEditingHtml5Video(false);
    clearSelectedHtml5Video();
    setImageError('');
    setImagePanelOpen(true);
  };

  const closeImagePanel = () => {
    setImagePanelOpen(false);
    setImageError('');
    setImageForm({ url: '', alt: '', caption: '', align: 'center', width: '100' });
  };

  const clearSelectedYouTube = () => {
    const selected = selectedYouTubeRef.current;
    if (selected) selected.removeAttribute('data-youtube-selected');
    selectedYouTubeRef.current = null;
  };

  const clearSelectedHtml5Video = () => {
    const selected = selectedHtml5VideoRef.current;
    if (selected) selected.removeAttribute('data-html5-video-selected');
    selectedHtml5VideoRef.current = null;
  };

  const openYouTubePanel = (wrapper = null) => {
    saveSelection();
    clearFormattingPanels();
    clearSelectedTableCell();
    closeImagePanel();
    setHtml5VideoPanelOpen(false);
    setHtml5VideoError('');
    setEditingHtml5Video(false);
    clearSelectedHtml5Video();
    setYouTubeError('');

    const selectedWrapper =
      wrapper ||
      (selectedYouTubeRef.current && editorRef.current?.contains(selectedYouTubeRef.current)
        ? selectedYouTubeRef.current
        : null);

    if (selectedWrapper) {
      clearSelectedYouTube();
      selectedWrapper.setAttribute('data-youtube-selected', 'true');
      selectedYouTubeRef.current = selectedWrapper;
      setYouTubeForm(getYouTubeFormFromIframe(selectedWrapper.querySelector('iframe')));
      setEditingYouTube(true);
    } else {
      clearSelectedYouTube();
      setYouTubeForm(createEmptyYouTubeForm());
      setEditingYouTube(false);
    }

    setYouTubePanelOpen(true);
  };

  const closeYouTubePanel = () => {
    setYouTubePanelOpen(false);
    setYouTubeError('');
    setYouTubeForm(createEmptyYouTubeForm());
    setEditingYouTube(false);
    clearSelectedYouTube();
  };

  const insertOrUpdateYouTube = () => {
    const parsed = parseYouTubeConfig(youtubeForm.url);
    if (!parsed) {
      setYouTubeError('올바른 YouTube 영상 주소를 입력해 주세요.');
      return;
    }

    const start = parseYouTubeStartInput(youtubeForm.start);
    if (start === null) {
      setYouTubeError('시작 위치는 초, 분:초 또는 시:분:초 형식으로 입력해 주세요.');
      return;
    }

    const title = String(youtubeForm.title || '').trim() || 'YouTube 동영상';
    const html = buildYouTubeEmbedHtml(youtubeForm.url, title, {
      start,
      autoplay: youtubeForm.autoplay,
      mute: youtubeForm.autoplay ? youtubeForm.mute : false,
      hideControls: youtubeForm.hideControls,
      hideFullscreen: youtubeForm.hideFullscreen,
      disableKeyboard: youtubeForm.disableKeyboard,
      playsInline: true,
      enableJsApi: youtubeForm.autoplay,
    });

    if (!html) {
      setYouTubeError('YouTube 영상을 삽입할 수 없습니다. 주소를 다시 확인해 주세요.');
      return;
    }

    const sanitizedHtml = sanitizeRichTextHtml(html);
    const selectedWrapper = selectedYouTubeRef.current;

    if (editingYouTube && selectedWrapper && editorRef.current?.contains(selectedWrapper)) {
      const holder = document.createElement('div');
      holder.innerHTML = sanitizedHtml;
      const replacement = holder.querySelector('[data-video-provider="youtube"]');
      if (!replacement) {
        setYouTubeError('YouTube 영상을 수정할 수 없습니다.');
        return;
      }
      selectedWrapper.replaceWith(replacement);
      const replacementIframe = replacement.querySelector('iframe');
      if (replacementIframe) {
        const storedSrc = replacementIframe.getAttribute('src') || '';
        const config = parseYouTubeConfig(storedSrc);
        if (config?.autoplay) {
          replacementIframe.setAttribute('data-stored-youtube-src', storedSrc);
          replacementIframe.setAttribute('src', buildYouTubeEmbedUrl({ ...config, autoplay: false }));
        }
      }
      addYouTubeEditorControls(replacement);
    } else {
      focusEditor();
      restoreSelection();
      document.execCommand('insertHTML', false, prepareEditorPreviewHtml(sanitizedHtml));
    }

    emitChange();
    closeYouTubePanel();
  };

  const openHtml5VideoPanel = (wrapper = null) => {
    saveSelection();
    clearFormattingPanels();
    clearSelectedTableCell();
    closeImagePanel();
    setYouTubePanelOpen(false);
    setYouTubeError('');
    setEditingYouTube(false);
    clearSelectedYouTube();
    setHtml5VideoError('');

    const selectedWrapper =
      wrapper ||
      (selectedHtml5VideoRef.current && editorRef.current?.contains(selectedHtml5VideoRef.current)
        ? selectedHtml5VideoRef.current
        : null);

    if (selectedWrapper) {
      clearSelectedHtml5Video();
      selectedWrapper.setAttribute('data-html5-video-selected', 'true');
      selectedHtml5VideoRef.current = selectedWrapper;
      setHtml5VideoForm(getHtml5VideoFormFromElement(selectedWrapper.querySelector('video')));
      setEditingHtml5Video(true);
    } else {
      clearSelectedHtml5Video();
      setHtml5VideoForm(createEmptyHtml5VideoForm());
      setEditingHtml5Video(false);
    }

    setHtml5VideoPanelOpen(true);
  };

  const closeHtml5VideoPanel = () => {
    setHtml5VideoPanelOpen(false);
    setHtml5VideoError('');
    setHtml5VideoForm(createEmptyHtml5VideoForm());
    setEditingHtml5Video(false);
    clearSelectedHtml5Video();
  };

  const insertOrUpdateHtml5Video = () => {
    const url = String(html5VideoForm.url || '').trim();
    if (!isSafeHttpUrl(url)) {
      setHtml5VideoError('동영상 주소는 http:// 또는 https://로 시작해야 합니다.');
      return;
    }

    const title = String(html5VideoForm.title || '').trim() || '일반 동영상';
    const html = buildHtml5VideoHtml(url, title, {
      autoplay: html5VideoForm.autoplay,
      loop: html5VideoForm.loop,
      muted: html5VideoForm.muted,
    });

    const sanitizedHtml = sanitizeRichTextHtml(html);
    const selectedWrapper = selectedHtml5VideoRef.current;

    if (editingHtml5Video && selectedWrapper && editorRef.current?.contains(selectedWrapper)) {
      const holder = document.createElement('div');
      holder.innerHTML = sanitizedHtml;
      const replacement = holder.querySelector('[data-video-provider="html5"]');
      if (!replacement) {
        setHtml5VideoError('일반 동영상을 수정할 수 없습니다.');
        return;
      }

      selectedWrapper.replaceWith(replacement);
      const replacementVideo = replacement.querySelector('video');
      if (replacementVideo?.hasAttribute('autoplay')) {
        replacementVideo.setAttribute('data-stored-html5-autoplay', 'true');
        replacementVideo.removeAttribute('autoplay');
      }
      addHtml5VideoEditorControls(replacement);
    } else {
      focusEditor();
      restoreSelection();
      document.execCommand('insertHTML', false, prepareEditorPreviewHtml(sanitizedHtml));
    }

    emitChange();
    closeHtml5VideoPanel();
  };

  const insertImage = () => {
    const url = imageForm.url.trim();
    if (!isSafeHttpUrl(url)) {
      setImageError('이미지 주소는 http:// 또는 https://로 시작해야 합니다.');
      return;
    }

    const escapeAttribute = (text) =>
      String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const escapeText = (text) =>
      String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const alignStyle =
      imageForm.align === 'left'
        ? 'margin-left: 0; margin-right: auto;'
        : imageForm.align === 'right'
          ? 'margin-left: auto; margin-right: 0;'
          : 'margin-left: auto; margin-right: auto;';

    const width = ['25', '50', '75', '100'].includes(imageForm.width)
      ? imageForm.width
      : '100';

    const figureHtml = `
      <figure data-align="${imageForm.align}" data-width="${width}" style="display: block; width: ${width}%; ${alignStyle}">
        <img src="${escapeAttribute(url)}" alt="${escapeAttribute(imageForm.alt)}" title="${escapeAttribute(imageForm.alt)}" loading="lazy" style="display: block; width: 100%; max-width: 100%; height: auto; ${alignStyle}">
        ${imageForm.caption.trim() ? `<figcaption>${escapeText(imageForm.caption.trim())}</figcaption>` : ''}
      </figure>
      <p><br></p>
    `;

    focusEditor();
    restoreSelection();
    document.execCommand('insertHTML', false, sanitizeRichTextHtml(figureHtml));
    emitChange();
    closeImagePanel();
  };

  const toggleSourceMode = () => {
    if (disabled) return;

    if (sourceMode) {
      const sanitizedHtml = sanitizeRichTextHtml(sourceValue);
      setSourceValue(sanitizedHtml);
      lastEmittedHtmlRef.current = sanitizedHtml;
      onChange?.(sanitizedHtml);
      setSourceMode(false);

      window.requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = prepareEditorPreviewHtml(sanitizedHtml);
          editorRef.current.focus();
        }
      });
      return;
    }

    setSourceValue(getStoredHtmlFromEditor(editorRef.current) || String(value || ''));
    setImagePanelOpen(false);
    setYouTubePanelOpen(false);
    setHtml5VideoPanelOpen(false);
    clearFormattingPanels();
    clearSelectedYouTube();
    clearSelectedHtml5Video();
    clearSelectedTableCell();
    setSourceMode(true);
  };

  const handlePaste = (event) => {
    if (disabled || sourceMode) return;

    const clipboardItems = [...(event.clipboardData?.items || [])];
    const hasImageFile = clipboardItems.some(
      (item) => item.kind === 'file' && String(item.type || '').startsWith('image/')
    );

    if (hasImageFile) {
      event.preventDefault();
      window.alert('클립보드 이미지 파일은 직접 저장할 수 없습니다. 외부 이미지 URL 또는 이미지 HTML 태그를 사용해 주세요.');
      return;
    }

    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    event.preventDefault();

    if (html) {
      document.execCommand('insertHTML', false, prepareEditorPreviewHtml(html));
      emitChange();
      return;
    }

    const trimmedText = text.trim();
    const youtubeHtml = buildYouTubeEmbedHtml(trimmedText);

    if (youtubeHtml) {
      document.execCommand('insertHTML', false, prepareEditorPreviewHtml(youtubeHtml));
      emitChange();
      return;
    }

    if (/<\/?[a-z][\s\S]*>/i.test(trimmedText)) {
      const sanitizedHtml = sanitizeRichTextHtml(trimmedText);
      if (sanitizedHtml) {
        document.execCommand('insertHTML', false, prepareEditorPreviewHtml(sanitizedHtml));
        emitChange();
        return;
      }
    }

    document.execCommand('insertText', false, text);
    emitChange();
  };

  const handleEditorClick = (event) => {
    const tableCell = event.target?.closest?.('td,th');
    const youtubeWrapper = event.target?.closest?.('[data-video-provider="youtube"]');
    const html5Wrapper = event.target?.closest?.('[data-video-provider="html5"]');

    if (tableCell && editorRef.current?.contains(tableCell)) {
      clearSelectedYouTube();
      clearSelectedHtml5Video();
      selectTableCell(tableCell);
      return;
    }

    clearSelectedTableCell();
    if (editingTable) {
      setTablePanelOpen(false);
      setEditingTable(false);
    }

    if (youtubeWrapper && editorRef.current?.contains(youtubeWrapper)) {
      clearSelectedHtml5Video();
      if (selectedYouTubeRef.current !== youtubeWrapper) {
        clearSelectedYouTube();
        youtubeWrapper.setAttribute('data-youtube-selected', 'true');
        selectedYouTubeRef.current = youtubeWrapper;
      }

      if (event.target?.closest?.('[data-youtube-editor-control]')) {
        event.preventDefault();
        openYouTubePanel(youtubeWrapper);
      }
      return;
    }

    if (html5Wrapper && editorRef.current?.contains(html5Wrapper)) {
      clearSelectedYouTube();
      if (selectedHtml5VideoRef.current !== html5Wrapper) {
        clearSelectedHtml5Video();
        html5Wrapper.setAttribute('data-html5-video-selected', 'true');
        selectedHtml5VideoRef.current = html5Wrapper;
      }

      if (event.target?.closest?.('[data-html5-video-editor-control]')) {
        event.preventDefault();
        openHtml5VideoPanel(html5Wrapper);
      }
      return;
    }

    clearSelectedYouTube();
    clearSelectedHtml5Video();
  };

  const handleEditorDoubleClick = (event) => {
    const youtubeWrapper = event.target?.closest?.('[data-video-provider="youtube"]');
    if (youtubeWrapper && editorRef.current?.contains(youtubeWrapper)) {
      event.preventDefault();
      openYouTubePanel(youtubeWrapper);
      return;
    }

    const html5Wrapper = event.target?.closest?.('[data-video-provider="html5"]');
    if (html5Wrapper && editorRef.current?.contains(html5Wrapper)) {
      event.preventDefault();
      openHtml5VideoPanel(html5Wrapper);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-slate-600">{label}</div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white mk-form-ring-focus-within">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
          <select
            title="문단 형식"
            aria-label="문단 형식"
            disabled={disabled || sourceMode}
            defaultValue="p"
            onChange={(event) => {
              runCommand('formatBlock', event.target.value);
              event.target.value = 'p';
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none"
          >
            <option value="p">본문</option>
            <option value="h1">제목 1</option>
            <option value="h2">제목 2</option>
            <option value="h3">제목 3</option>
          </select>

          <select
            title="글자 크기"
            aria-label="글자 크기"
            disabled={disabled || sourceMode}
            value=""
            onMouseDown={saveSelection}
            onChange={(event) => {
              const selectedValue = event.target.value;
              if (selectedValue === 'custom') openFontSizePanel();
              else {
                setFontSizePanelOpen(false);
                setFontSizeError('');
                applyFontSize(selectedValue === 'default' ? 'inherit' : Number(selectedValue));
              }
            }}
            className="h-8 min-w-[92px] rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none"
          >
            <option value="" disabled>{`크기 ${currentFontSize}`}</option>
            <option value="default">기본</option>
            {FONT_SIZE_PRESETS.map((size) => (
              <option key={size} value={String(size)}>{size}px</option>
            ))}
            <option value="custom">직접 입력...</option>
          </select>

          <select
            title="줄간격"
            aria-label="줄간격"
            disabled={disabled || sourceMode}
            value=""
            onMouseDown={saveSelection}
            onChange={(event) => {
              const selectedValue = event.target.value;
              if (selectedValue === 'custom') openLineHeightPanel();
              else {
                setLineHeightPanelOpen(false);
                setLineHeightError('');
                applyLineHeight(selectedValue === 'default' ? '' : selectedValue);
              }
            }}
            className="h-8 min-w-[92px] rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none"
          >
            <option value="" disabled>{`줄간격 ${currentLineHeight}`}</option>
            <option value="default">기본</option>
            {LINE_HEIGHT_PRESETS.map((lineHeight) => (
              <option key={lineHeight} value={String(lineHeight)}>{lineHeight}</option>
            ))}
            <option value="custom">직접 입력...</option>
          </select>

          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="실행 취소" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('undo')}><Undo2 size={15} /></ToolbarButton>
          <ToolbarButton title="다시 실행" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('redo')}><Redo2 size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="굵게" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('bold')}><Bold size={15} /></ToolbarButton>
          <ToolbarButton title="기울임" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('italic')}><Italic size={15} /></ToolbarButton>
          <ToolbarButton title="밑줄" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('underline')}><Underline size={15} /></ToolbarButton>
          <ToolbarButton title="취소선" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('strikeThrough')}><Strikethrough size={15} /></ToolbarButton>
          <label title="글자색" aria-label="글자색" className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600">
            <Palette size={15} />
            <input type="color" disabled={disabled || sourceMode} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => runCommand('foreColor', event.target.value)} />
          </label>
          <label title="배경색" aria-label="배경색" className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600">
            <Highlighter size={15} />
            <input type="color" disabled={disabled || sourceMode} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => {
              focusEditor();
              document.execCommand('hiliteColor', false, event.target.value) || document.execCommand('backColor', false, event.target.value);
              emitChange();
            }} />
          </label>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="글머리표" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')}><List size={15} /></ToolbarButton>
          <ToolbarButton title="번호 목록" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertOrderedList')}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton title="인용문" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('formatBlock', 'blockquote')}><Quote size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="왼쪽 정렬" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyLeft')}><AlignLeft size={15} /></ToolbarButton>
          <ToolbarButton title="가운데 정렬" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyCenter')}><AlignCenter size={15} /></ToolbarButton>
          <ToolbarButton title="오른쪽 정렬" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyRight')}><AlignRight size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="링크 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}><LinkIcon size={15} /></ToolbarButton>
          <ToolbarButton title="이미지 URL 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={openImagePanel}><ImagePlus size={15} /></ToolbarButton>
          {allowVideos && (
            <>
              <ToolbarButton title="YouTube 동영상 삽입·수정" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => openYouTubePanel()}><Youtube size={16} /></ToolbarButton>
              <ToolbarButton title="일반 동영상 삽입·수정" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => openHtml5VideoPanel()}><Video size={16} /></ToolbarButton>
            </>
          )}
          <button
            type="button"
            title="표 삽입·편집"
            aria-label="표 삽입·편집"
            disabled={disabled || sourceMode}
            onMouseDown={(event) => {
              event.preventDefault();
              saveSelection();
            }}
            onClick={openTablePanel}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition ${tablePanelOpen ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Table2 size={15} />
            표
          </button>
          <ToolbarButton title="구분선 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertHorizontalRule')}><Minus size={15} /></ToolbarButton>
          <ToolbarButton title="서식 제거" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={clearAllFormatting}><Eraser size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button
            type="button"
            title={sourceMode ? '편집기 보기' : '태그보기'}
            aria-label={sourceMode ? '편집기 보기' : '태그보기'}
            disabled={disabled}
            onClick={toggleSourceMode}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition ${sourceMode ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {sourceMode ? <Eye size={14} /> : <Code2 size={14} />}
            {sourceMode ? '편집기 보기' : '태그보기'}
          </button>
        </div>

        {fontSizePanelOpen && !sourceMode && (
          <div className="border-b border-slate-200 bg-violet-50/50 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">글자 크기 직접 입력</div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  {MIN_FONT_SIZE_PX}px부터 {MAX_FONT_SIZE_PX}px까지 정수로 입력할 수 있습니다.
                </div>
              </div>
              <button type="button" onClick={() => setFontSizePanelOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={MIN_FONT_SIZE_PX}
                max={MAX_FONT_SIZE_PX}
                step="1"
                value={customFontSize}
                onChange={(event) => {
                  setCustomFontSize(event.target.value);
                  setFontSizeError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyCustomFontSize();
                }}
                className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                aria-label="글자 크기 직접 입력"
              />
              <span className="text-xs font-semibold text-slate-600">px</span>
              <button type="button" onClick={applyCustomFontSize} className="h-9 rounded-lg bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-700">적용</button>
              <button type="button" onClick={() => setFontSizePanelOpen(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600">취소</button>
            </div>
            {fontSizeError && <div className="mt-2 text-[11px] font-semibold text-rose-600">{fontSizeError}</div>}
          </div>
        )}

        {lineHeightPanelOpen && !sourceMode && (
          <div className="border-b border-slate-200 bg-emerald-50/50 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">줄간격 직접 입력</div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  {MIN_LINE_HEIGHT}부터 {MAX_LINE_HEIGHT}까지 소수점 둘째 자리로 입력할 수 있습니다.
                </div>
              </div>
              <button type="button" onClick={() => setLineHeightPanelOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={MIN_LINE_HEIGHT}
                max={MAX_LINE_HEIGHT}
                step="0.01"
                value={customLineHeight}
                onChange={(event) => {
                  setCustomLineHeight(event.target.value);
                  setLineHeightError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyCustomLineHeight();
                }}
                className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                aria-label="줄간격 직접 입력"
              />
              <button type="button" onClick={applyCustomLineHeight} className="h-9 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700">적용</button>
              <button type="button" onClick={() => setLineHeightPanelOpen(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600">취소</button>
            </div>
            {lineHeightError && <div className="mt-2 text-[11px] font-semibold text-rose-600">{lineHeightError}</div>}
          </div>
        )}

        {tablePanelOpen && !sourceMode && (
          <div className="border-b border-slate-200 bg-cyan-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">{editingTable ? '표 행·열 편집' : '표 삽입'}</div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  {editingTable ? '선택한 셀을 기준으로 행과 열을 추가하거나 삭제합니다.' : '행은 1~20개, 열은 1~10개까지 만들 수 있습니다.'}
                </div>
              </div>
              <button type="button" onClick={closeTablePanel} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>

            {editingTable ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addTableRow('above')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-300">행 위에 추가</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addTableRow('below')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-300">행 아래에 추가</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={deleteTableRow} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">현재 행 삭제</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addTableColumn('left')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-300">열 왼쪽에 추가</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addTableColumn('right')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-300">열 오른쪽에 추가</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={deleteTableColumn} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">현재 열 삭제</button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                  if (window.confirm('표 전체를 삭제할까요?')) deleteCurrentTable();
                }} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">표 전체 삭제</button>
              </div>
            ) : (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="text-[11px] font-semibold text-slate-600">
                    행 개수
                    <input type="number" min="1" max="20" step="1" value={tableRows} onChange={(event) => {
                      setTableRows(event.target.value);
                      setTableError('');
                    }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-600">
                    열 개수
                    <input type="number" min="1" max="10" step="1" value={tableColumns} onChange={(event) => {
                      setTableColumns(event.target.value);
                      setTableError('');
                    }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus" />
                  </label>
                  <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                    <input type="checkbox" checked={tableHasHeader} onChange={(event) => setTableHasHeader(event.target.checked)} />
                    첫 번째 행을 제목 행으로 사용
                  </label>
                </div>
                {tableError && <div className="mt-2 text-[11px] font-semibold text-rose-600">{tableError}</div>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={closeTablePanel} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">취소</button>
                  <button type="button" onClick={insertConfiguredTable} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700">표 삽입</button>
                </div>
              </>
            )}
          </div>
        )}

        {imagePanelOpen && !sourceMode && (
          <div className="border-b border-slate-200 bg-orange-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">이미지 URL 삽입</div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">http:// 또는 https:// 이미지 주소만 사용할 수 있습니다.</div>
              </div>
              <button type="button" onClick={closeImagePanel} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={imageForm.url}
                onChange={(event) => setImageForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="이미지 주소 (https://...)"
                className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
              <input
                value={imageForm.alt}
                onChange={(event) => setImageForm((prev) => ({ ...prev, alt: event.target.value }))}
                placeholder="대체 텍스트"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
              <input
                value={imageForm.caption}
                onChange={(event) => setImageForm((prev) => ({ ...prev, caption: event.target.value }))}
                placeholder="이미지 설명문 (선택)"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
              <select
                value={imageForm.align}
                onChange={(event) => setImageForm((prev) => ({ ...prev, align: event.target.value }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
              >
                <option value="left">왼쪽 정렬</option>
                <option value="center">가운데 정렬</option>
                <option value="right">오른쪽 정렬</option>
              </select>
              <select
                value={imageForm.width}
                onChange={(event) => setImageForm((prev) => ({ ...prev, width: event.target.value }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
              >
                <option value="25">너비 25%</option>
                <option value="50">너비 50%</option>
                <option value="75">너비 75%</option>
                <option value="100">너비 100%</option>
              </select>
            </div>

            {imageError && <div className="mt-2 text-[11px] font-semibold text-rose-600">{imageError}</div>}

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeImagePanel} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">취소</button>
              <button type="button" onClick={insertImage} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">이미지 삽입</button>
            </div>
          </div>
        )}

        {youtubePanelOpen && !sourceMode && (
          <div className="border-b border-slate-200 bg-red-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">
                  {editingYouTube ? 'YouTube 동영상 설정 수정' : 'YouTube 동영상 삽입'}
                </div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  일반 영상·단축·Shorts·Live·임베드 주소를 사용할 수 있습니다.
                </div>
              </div>
              <button type="button" onClick={closeYouTubePanel} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={youtubeForm.url}
                onChange={(event) => setYouTubeForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="YouTube 영상 주소"
                className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
              <input
                value={youtubeForm.title}
                onChange={(event) => setYouTubeForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="영상 제목 (선택)"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
              <input
                value={youtubeForm.start}
                onChange={(event) => setYouTubeForm((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="시작 위치 예: 47, 05:27, 01:05:27"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={youtubeForm.autoplay}
                  onChange={(event) => setYouTubeForm((prev) => ({
                    ...prev,
                    autoplay: event.target.checked,
                    mute: event.target.checked ? prev.mute : false,
                  }))}
                />
                자동 시작
              </label>
              <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${youtubeForm.autoplay ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-100 bg-slate-100 text-slate-400'}`}>
                <input
                  type="checkbox"
                  checked={youtubeForm.mute}
                  disabled={!youtubeForm.autoplay}
                  onChange={(event) => setYouTubeForm((prev) => ({ ...prev, mute: event.target.checked }))}
                />
                자동 시작 시 음소거
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={youtubeForm.hideControls}
                  onChange={(event) => setYouTubeForm((prev) => ({ ...prev, hideControls: event.target.checked }))}
                />
                플레이어 조작 버튼 숨김
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={youtubeForm.hideFullscreen}
                  onChange={(event) => setYouTubeForm((prev) => ({ ...prev, hideFullscreen: event.target.checked }))}
                />
                전체 화면 버튼 숨김
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={youtubeForm.disableKeyboard}
                  onChange={(event) => setYouTubeForm((prev) => ({ ...prev, disableKeyboard: event.target.checked }))}
                />
                키보드 조작 비활성화
              </label>
            </div>

            <div className="mt-2 text-[10px] leading-4 text-slate-500">
              소리가 있는 자동재생은 브라우저 정책에 따라 차단될 수 있습니다. 편집 화면에서는 자동재생하지 않으며 실제 사용자 화면에서만 적용됩니다. YouTube 제목·채널 정보·브랜드 표시는 완전히 숨길 수 없습니다.
            </div>

            {youtubeError && <div className="mt-2 text-[11px] font-semibold text-rose-600">{youtubeError}</div>}

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeYouTubePanel} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">취소</button>
              <button type="button" onClick={insertOrUpdateYouTube} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">
                {editingYouTube ? '변경사항 적용' : '동영상 삽입'}
              </button>
            </div>
          </div>
        )}

        {html5VideoPanelOpen && !sourceMode && (
          <div className="border-b border-slate-200 bg-sky-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">
                  {editingHtml5Video ? '일반 동영상 설정 수정' : '일반 동영상 삽입'}
                </div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">동영상 파일을 직접 가리키는 http:// 또는 https:// 주소를 입력해 주세요.</div>
              </div>
              <button type="button" onClick={closeHtml5VideoPanel} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={html5VideoForm.url}
                onChange={(event) => setHtml5VideoForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="동영상 파일 주소 (https://.../video.mp4)"
                className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
              <input
                value={html5VideoForm.title}
                onChange={(event) => setHtml5VideoForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="영상 제목 또는 설명 (선택)"
                className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus"
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={html5VideoForm.autoplay}
                  onChange={(event) => setHtml5VideoForm((prev) => ({ ...prev, autoplay: event.target.checked }))}
                />
                자동 시작
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={html5VideoForm.loop}
                  onChange={(event) => setHtml5VideoForm((prev) => ({ ...prev, loop: event.target.checked }))}
                />
                반복 재생
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={html5VideoForm.muted}
                  onChange={(event) => setHtml5VideoForm((prev) => ({ ...prev, muted: event.target.checked }))}
                />
                음소거
              </label>
            </div>

            <div className="mt-2 text-[10px] leading-4 text-slate-500">
              Chrome 등에서는 소리가 있는 자동재생이 차단될 수 있습니다. 안정적인 자동재생이 필요하면 자동 시작과 음소거를 함께 선택해 주세요.
            </div>

            {html5VideoError && <div className="mt-2 text-[11px] font-semibold text-rose-600">{html5VideoError}</div>}

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeHtml5VideoPanel} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">취소</button>
              <button type="button" onClick={insertOrUpdateHtml5Video} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700">
                {editingHtml5Video ? '변경사항 적용' : '동영상 삽입'}
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          {sourceMode ? (
            <textarea
              value={sourceValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSourceValue(nextValue);
                lastEmittedHtmlRef.current = nextValue;
                onChange?.(nextValue);
              }}
              disabled={disabled}
              spellCheck={false}
              aria-label={`${label} HTML 태그 편집`}
              className="w-full resize-y bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60"
              style={{ minHeight }}
              placeholder="HTML 태그를 입력해 주세요. 저장 시 허용되지 않은 태그와 속성은 자동으로 제거됩니다."
            />
          ) : (
            <>
              {isRichTextEmpty(value) && (
                <div className="pointer-events-none absolute left-4 top-3 text-xs text-slate-400">{placeholder}</div>
              )}
              <div
                ref={editorRef}
                contentEditable={!disabled}
                suppressContentEditableWarning
                onInput={emitChange}
                onBlur={emitChange}
                onPaste={handlePaste}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
                onClick={handleEditorClick}
                onDoubleClick={handleEditorDoubleClick}
                style={{ minHeight }}
                className="rich-text-editor-area w-full overflow-y-auto px-4 py-3 text-sm leading-7 text-slate-700 outline-none"
              />
            </>
          )}
        </div>
      </div>

      <p className="text-[10px] leading-4 text-slate-500">
        {allowVideos
          ? '글자 크기·줄간격·표 편집과 외부 이미지·동영상 링크를 지원합니다. YouTube URL·임베드 태그, 일반 동영상 태그와 안전한 HTML 태그를 붙여넣을 수 있습니다.'
          : '글자 크기·줄간격·표 편집, 외부 이미지 URL, 링크와 안전한 HTML 태그를 사용할 수 있습니다. 이 영역에는 동영상이 저장되지 않습니다.'}
      </p>
    </div>
  );
}

export function RichTextContent({ html = '', text = '', className = '' }) {
  const contentRef = useRef(null);
  const safeHtml = useMemo(() => {
    const source = String(html || '').trim()
      ? html
      : legacyTextToRichHtml(text);
    const sanitized = sanitizeRichTextHtml(source);
    if (typeof document === 'undefined') return sanitized;

    const container = document.createElement('div');
    container.innerHTML = sanitized;
    let autoplayAssigned = false;

    container.querySelectorAll('[data-video-provider="youtube"] iframe').forEach((iframe) => {
      const config = parseYouTubeConfig(iframe.getAttribute('src') || '');
      if (!config) return;

      if (config.autoplay && autoplayAssigned) {
        iframe.setAttribute('src', buildYouTubeEmbedUrl({ ...config, autoplay: false }));
        return;
      }

      if (config.autoplay) autoplayAssigned = true;

      try {
        const url = new URL(iframe.getAttribute('src') || '');
        if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
          url.searchParams.set('origin', window.location.origin);
          iframe.setAttribute('src', url.toString());
        }
      } catch {
        // 이미 정제된 YouTube URL이므로 원본 주소를 유지합니다.
      }
    });

    return container.innerHTML;
  }, [html, text]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const iframe = [...root.querySelectorAll('[data-video-provider="youtube"] iframe')].find((frame) => {
      const config = parseYouTubeConfig(frame.getAttribute('src') || '');
      return Boolean(config?.autoplay);
    });

    if (!iframe) return undefined;

    const config = parseYouTubeConfig(iframe.getAttribute('src') || '');
    if (!config) return undefined;

    const targetOrigin = 'https://www.youtube-nocookie.com';
    const iframeId = iframe.id || `youtube-player-${Math.random().toString(36).slice(2)}`;
    iframe.id = iframeId;
    let disposed = false;
    const retryTimers = [];

    const postPlayerMessage = (payload) => {
      if (disposed || !iframe.contentWindow) return;
      iframe.contentWindow.postMessage(JSON.stringify(payload), targetOrigin);
    };

    const announceListener = () => {
      postPlayerMessage({ event: 'listening', id: iframeId });
    };

    const sendPlayerCommands = () => {
      announceListener();
      if (config.mute) {
        postPlayerMessage({ event: 'command', func: 'mute', args: [] });
      }
      postPlayerMessage({ event: 'command', func: 'playVideo', args: [] });
    };

    const scheduleRetries = () => {
      [0, 250, 600, 1200, 2200, 4000].forEach((delay) => {
        retryTimers.push(window.setTimeout(sendPlayerCommands, delay));
      });
    };

    const handleLoad = () => {
      scheduleRetries();
    };

    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      if (!/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/i.test(event.origin)) return;

      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (data?.event === 'onReady') {
        sendPlayerCommands();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendPlayerCommands();
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    iframe.addEventListener('load', handleLoad);
    scheduleRetries();

    return () => {
      disposed = true;
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      iframe.removeEventListener('load', handleLoad);
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [safeHtml]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const cleanups = [...root.querySelectorAll('[data-video-provider="html5"] video[autoplay]')].map((video) => {
      video.muted = video.hasAttribute('muted');

      const tryPlay = () => {
        const playResult = video.play?.();
        if (playResult?.catch) playResult.catch(() => {});
      };

      video.addEventListener('loadedmetadata', tryPlay);
      video.addEventListener('canplay', tryPlay);
      const timer = window.setTimeout(tryPlay, 150);

      return () => {
        video.removeEventListener('loadedmetadata', tryPlay);
        video.removeEventListener('canplay', tryPlay);
        window.clearTimeout(timer);
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [safeHtml]);

  return (
    <div
      ref={contentRef}
      className={`rich-text-content break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
