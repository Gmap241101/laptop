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
]);

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
    } else if (element.tagName === 'TD' || element.tagName === 'TH') {
      keep = ['colspan', 'rowspan'].includes(name);
    } else if (element.tagName === 'FIGURE') {
      keep = ['data-align', 'data-width'].includes(name);
    } else if (element.tagName === 'DIV') {
      keep = ['data-video-provider'].includes(name);
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

  container.querySelectorAll('iframe').forEach((frame) => {
    const title = frame.getAttribute('title')?.trim();
    if (title) frame.insertAdjacentText('afterend', ` ${title} `);
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
  const hasMedia = Boolean(container.querySelector('img, iframe, table, hr'));
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
  const config = parseYouTubeConfig(iframe?.getAttribute('src') || '');
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
  addYouTubeEditorControls(container);
  return container.innerHTML;
};

const getStoredHtmlFromEditor = (editor) => {
  if (!editor || typeof document === 'undefined') return '';
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('iframe[data-stored-youtube-src]').forEach((iframe) => {
    iframe.setAttribute('src', iframe.getAttribute('data-stored-youtube-src') || '');
    iframe.removeAttribute('data-stored-youtube-src');
  });
  clone.querySelectorAll('[data-youtube-selected]').forEach((node) => {
    node.removeAttribute('data-youtube-selected');
  });
  clone.querySelectorAll('[data-youtube-editor-control]').forEach((node) => node.remove());
  return sanitizeRichTextHtml(clone.innerHTML);
};

export function RichTextEditor({
  value = '',
  onChange,
  label = '본문',
  placeholder = '내용을 입력해 주세요.',
  minHeight = 300,
  disabled = false,
}) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const lastEmittedHtmlRef = useRef('');
  const selectedYouTubeRef = useRef(null);
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
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(String(value || ''));

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

  const saveSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || !savedRangeRef.current) return;

    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
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
    setYouTubePanelOpen(false);
    setYouTubeError('');
    setEditingYouTube(false);
    clearSelectedYouTube();
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

  const openYouTubePanel = (wrapper = null) => {
    saveSelection();
    closeImagePanel();
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

  const insertTable = () => {
    const html = `
      <table>
        <tbody>
          <tr><th>항목</th><th>내용</th></tr>
          <tr><td>항목 1</td><td>내용을 입력하세요.</td></tr>
          <tr><td>항목 2</td><td>내용을 입력하세요.</td></tr>
        </tbody>
      </table>
      <p><br></p>
    `;
    runCommand('insertHTML', sanitizeRichTextHtml(html));
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
    clearSelectedYouTube();
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
    const wrapper = event.target?.closest?.('[data-video-provider="youtube"]');
    if (!wrapper || !editorRef.current?.contains(wrapper)) {
      clearSelectedYouTube();
      return;
    }

    if (selectedYouTubeRef.current !== wrapper) {
      clearSelectedYouTube();
      wrapper.setAttribute('data-youtube-selected', 'true');
      selectedYouTubeRef.current = wrapper;
    }

    if (event.target?.closest?.('[data-youtube-editor-control]')) {
      event.preventDefault();
      openYouTubePanel(wrapper);
    }
  };

  const handleEditorDoubleClick = (event) => {
    const wrapper = event.target?.closest?.('[data-video-provider="youtube"]');
    if (!wrapper || !editorRef.current?.contains(wrapper)) return;
    event.preventDefault();
    openYouTubePanel(wrapper);
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
          <ToolbarButton title="YouTube 동영상 삽입·수정" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => openYouTubePanel()}><Youtube size={16} /></ToolbarButton>
          <ToolbarButton title="표 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={insertTable}><Table2 size={15} /></ToolbarButton>
          <ToolbarButton title="구분선 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertHorizontalRule')}><Minus size={15} /></ToolbarButton>
          <ToolbarButton title="서식 제거" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('removeFormat')}><Eraser size={15} /></ToolbarButton>
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
        외부 이미지 링크는 원본 서버 상태에 따라 표시되지 않을 수 있습니다. 유튜브 URL·임베드 태그와 안전한 HTML 태그 붙여넣기를 지원합니다.
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

    container.querySelectorAll('iframe').forEach((iframe) => {
      const config = parseYouTubeConfig(iframe.getAttribute('src') || '');
      if (!config) return;

      if (config.autoplay && autoplayAssigned) {
        iframe.setAttribute('src', buildYouTubeEmbedUrl({ ...config, autoplay: false }));
        return;
      }

      if (config.autoplay) autoplayAssigned = true;
    });

    return container.innerHTML;
  }, [html, text]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const iframe = [...root.querySelectorAll('iframe')].find((frame) => {
      const config = parseYouTubeConfig(frame.getAttribute('src') || '');
      return Boolean(config?.autoplay);
    });

    if (!iframe) return undefined;

    const config = parseYouTubeConfig(iframe.getAttribute('src') || '');
    if (!config) return undefined;

    try {
      const url = new URL(iframe.getAttribute('src') || '');
      if (/^https?:$/.test(window.location.protocol)) {
        url.searchParams.set('origin', window.location.origin);
        iframe.setAttribute('src', url.toString());
      }
    } catch {
      // 정제된 YouTube URL이므로 URL 보정 실패 시 기존 주소를 그대로 사용합니다.
    }

    const sendPlayerCommand = () => {
      const playerWindow = iframe.contentWindow;
      if (!playerWindow) return;

      if (config.mute) {
        playerWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'mute', args: [] }),
          'https://www.youtube-nocookie.com'
        );
      }

      playerWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        'https://www.youtube-nocookie.com'
      );
    };

    iframe.addEventListener('load', sendPlayerCommand);
    const timer = window.setTimeout(sendPlayerCommand, 900);

    return () => {
      iframe.removeEventListener('load', sendPlayerCommand);
      window.clearTimeout(timer);
    };
  }, [safeHtml]);

  return (
    <div
      ref={contentRef}
      className={`rich-text-content break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
