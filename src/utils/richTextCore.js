/** Shared rich-text sanitizing and media helpers. */
const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'WBR',
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
  'PICTURE',
  'SOURCE',
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

const isSafeImageSrcSet = (value = '') => {
  const candidates = String(value || '')
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  if (candidates.length === 0 || candidates.length > 12) return false;

  return candidates.every((candidate) => {
    const parts = candidate.split(/\s+/).filter(Boolean);
    if (parts.length < 1 || parts.length > 2 || !isSafeHttpUrl(parts[0])) return false;
    if (parts.length === 1) return true;
    return /^(?:\d+w|\d+(?:\.\d+)?x)$/i.test(parts[1]);
  });
};

const isSafeResponsiveSizes = (value = '') => {
  const normalized = String(value || '').trim();
  return Boolean(
    normalized &&
    normalized.length <= 500 &&
    !/[<>`{}]|url\s*\(|expression\s*\(|javascript:/i.test(normalized)
  );
};

const isSafeResponsiveMedia = (value = '') => {
  const normalized = String(value || '').trim();
  return Boolean(
    normalized &&
    normalized.length <= 240 &&
    /^[a-z0-9\s:().,/%+\-]+$/i.test(normalized)
  );
};

const isSafeImageMimeType = (value = '') =>
  /^image\/(?:avif|gif|jpeg|png|svg\+xml|webp)$/i.test(String(value || '').trim());


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

  if (element.tagName === 'SOURCE') {
    const sourceSet = element.getAttribute('srcset') || '';
    if (element.parentElement?.tagName !== 'PICTURE' || !isSafeImageSrcSet(sourceSet)) return false;
  }

  [...element.attributes].forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    let keep = false;

    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      return;
    }

    if (['WBR', 'PICTURE', 'SOURCE', 'BR'].includes(element.tagName) && name === 'style') {
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
      keep = ['src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'loading'].includes(name);
      if (name === 'src' && !isSafeHttpUrl(value)) keep = false;
      if (name === 'srcset' && !isSafeImageSrcSet(value)) keep = false;
      if (name === 'sizes' && !isSafeResponsiveSizes(value)) keep = false;
    } else if (element.tagName === 'SOURCE') {
      keep = ['srcset', 'sizes', 'media', 'type', 'width', 'height'].includes(name);
      if (name === 'srcset' && !isSafeImageSrcSet(value)) keep = false;
      if (name === 'sizes' && !isSafeResponsiveSizes(value)) keep = false;
      if (name === 'media' && !isSafeResponsiveMedia(value)) keep = false;
      if (name === 'type' && !isSafeImageMimeType(value)) keep = false;
    } else if (element.tagName === 'BR') {
      keep = name === 'data-mobile-only';
    } else if (element.tagName === 'SPAN') {
      keep = name === 'data-nowrap';
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

  if (element.tagName === 'BR' && element.hasAttribute('data-mobile-only')) {
    element.setAttribute('data-mobile-only', 'true');
  }

  if (element.tagName === 'SPAN' && element.hasAttribute('data-nowrap')) {
    element.setAttribute('data-nowrap', 'true');
  }

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
    .replace(/\u00AD/g, '')
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

export {
  FONT_SIZE_PRESETS,
  LINE_HEIGHT_PRESETS,
  RICH_TEXT_BLOCK_SELECTOR,
  normalizeFontSizeCssValue,
  normalizeLineHeightCssValue,
  formatLineHeightForToolbar,
  isSafeHttpUrl,
  isSafeLinkUrl,
  formatYouTubeStartTime,
  parseYouTubeStartInput,
  parseYouTubeConfig,
  buildYouTubeEmbedUrl,
  buildYouTubeEmbedHtml,
  buildHtml5VideoHtml,
};
