import { useEffect, useRef, useState } from 'react';
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

import {
  FONT_SIZE_PRESETS,
  LINE_HEIGHT_PRESETS,
  MAX_FONT_SIZE_PX,
  MAX_LINE_HEIGHT,
  MIN_FONT_SIZE_PX,
  MIN_LINE_HEIGHT,
  RICH_TEXT_BLOCK_SELECTOR,
  buildHtml5VideoHtml,
  buildYouTubeEmbedHtml,
  buildYouTubeEmbedUrl,
  formatLineHeightForToolbar,
  formatYouTubeStartTime,
  isRichTextEmpty,
  isSafeHttpUrl,
  isSafeLinkUrl,
  normalizeFontSizeCssValue,
  normalizeLineHeightCssValue,
  parseYouTubeConfig,
  parseYouTubeStartInput,
  sanitizeRichTextHtml,
} from '../utils/richTextCore.js';
import ModalPortal from './ModalPortal.jsx';

const ToolbarButton = ({ active = false, children, title, tabIndex = -1, ...props }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    tabIndex={tabIndex}
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


const EditorModal = ({
  open,
  title,
  description = '',
  onClose,
  children,
  maxWidthClass = 'max-w-2xl',
  bare = false,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ModalPortal
      className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[86vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {bare ? (
          children
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900">{title}</div>
                {description && (
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">{description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={`${title} 닫기`}
              >
                <X size={17} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </>
        )}
      </div>
    </ModalPortal>
  );
};

const createEmptyImageForm = () => ({
  url: '',
  alt: '',
  caption: '',
  align: 'center',
  width: '100',
});

const getImageFormFromFigure = (figure) => {
  const image = figure?.querySelector?.('img');
  const rawWidth = String(figure?.getAttribute?.('data-width') || '').trim();
  const rawAlign = String(figure?.getAttribute?.('data-align') || '').trim();
  return {
    url: image?.getAttribute?.('src') || '',
    alt: image?.getAttribute?.('alt') || '',
    caption: figure?.querySelector?.('figcaption')?.textContent || '',
    align: ['left', 'center', 'right'].includes(rawAlign) ? rawAlign : 'center',
    width: ['25', '50', '75', '100'].includes(rawWidth) ? rawWidth : '100',
  };
};

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

const addResponsiveEditorMarkers = (container) => {
  if (!container?.querySelectorAll || typeof document === 'undefined') return;

  container.querySelectorAll('wbr').forEach((wbr) => {
    const marker = document.createElement('span');
    marker.setAttribute('data-editor-wbr-marker', 'true');
    marker.setAttribute('contenteditable', 'false');
    marker.setAttribute('title', '조건부 줄바꿈 <wbr>');
    marker.textContent = '¦';
    wbr.replaceWith(marker);
  });

  container.querySelectorAll('br[data-mobile-only]').forEach((lineBreak) => {
    const marker = document.createElement('span');
    marker.setAttribute('data-editor-mobile-break-marker', 'true');
    marker.setAttribute('contenteditable', 'false');
    marker.setAttribute('title', '모바일 전용 줄바꿈 <br data-mobile-only>');
    marker.textContent = 'M↵';
    lineBreak.replaceWith(marker);
  });

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const softHyphenNodes = [];
  let textNode = walker.nextNode();
  while (textNode) {
    if (String(textNode.textContent || '').includes('\u00AD')) softHyphenNodes.push(textNode);
    textNode = walker.nextNode();
  }

  softHyphenNodes.forEach((node) => {
    const parts = String(node.textContent || '').split('\u00AD');
    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (part) fragment.appendChild(document.createTextNode(part));
      if (index < parts.length - 1) {
        const marker = document.createElement('span');
        marker.setAttribute('data-editor-shy-marker', 'true');
        marker.setAttribute('contenteditable', 'false');
        marker.setAttribute('title', '소프트 하이픈 &shy;');
        marker.textContent = '¬';
        fragment.appendChild(marker);
      }
    });
    node.replaceWith(fragment);
  });
};

const restoreResponsiveEditorMarkers = (container) => {
  if (!container?.querySelectorAll || typeof document === 'undefined') return;

  container.querySelectorAll('[data-editor-wbr-marker]').forEach((marker) => {
    marker.replaceWith(document.createElement('wbr'));
  });
  container.querySelectorAll('[data-editor-mobile-break-marker]').forEach((marker) => {
    const lineBreak = document.createElement('br');
    lineBreak.setAttribute('data-mobile-only', 'true');
    marker.replaceWith(lineBreak);
  });
  container.querySelectorAll('[data-editor-shy-marker]').forEach((marker) => {
    marker.replaceWith(document.createTextNode('\u00AD'));
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

  addResponsiveEditorMarkers(container);
  return container.innerHTML;
};

const getStoredHtmlFromEditor = (editor) => {
  if (!editor || typeof document === 'undefined') return '';
  const clone = editor.cloneNode(true);
  restoreResponsiveEditorMarkers(clone);
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
  maxHeight = null,
  disabled = false,
  allowVideos = true,
}) {
  const resolvedMaxHeight = maxHeight ?? minHeight;
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);
  const savedRangeRef = useRef(null);
  const lastEmittedHtmlRef = useRef('');
  const selectedYouTubeRef = useRef(null);
  const selectedHtml5VideoRef = useRef(null);
  const selectedImageRef = useRef(null);
  const [imagePanelOpen, setImagePanelOpen] = useState(false);
  const [imageForm, setImageForm] = useState(createEmptyImageForm);
  const [imageError, setImageError] = useState('');
  const [editingImage, setEditingImage] = useState(false);
  const [colorDialog, setColorDialog] = useState({
    open: false,
    command: 'foreColor',
    value: '#111827',
  });
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
  const [responsivePanelOpen, setResponsivePanelOpen] = useState(false);

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

  const applyColorCommand = (command, colorValue) => {
    if (disabled || sourceMode) return;
    focusEditor();
    restoreSelection();
    document.execCommand('styleWithCSS', false, true);
    const applied = document.execCommand(command, false, colorValue);
    if (!applied && command === 'hiliteColor') document.execCommand('backColor', false, colorValue);
    document.execCommand('styleWithCSS', false, false);
    emitChange();
    saveSelection();
  };

  const focusFirstToolbarControl = () => {
    const toolbar = toolbarRef.current;
    const firstControl = toolbar?.querySelector?.('select:not(:disabled), button:not(:disabled), input:not(:disabled)');
    firstControl?.focus?.();
  };

  const handleEditorKeyDown = (event) => {
    if (event.altKey && event.key === 'F10') {
      event.preventDefault();
      focusFirstToolbarControl();
    }
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

  const openColorDialog = (command) => {
    saveSelection();
    setColorDialog({
      open: true,
      command,
      value: command === 'hiliteColor' ? '#fff59d' : '#111827',
    });
  };

  const closeColorDialog = () => {
    setColorDialog((current) => ({ ...current, open: false }));
  };

  const confirmColorDialog = () => {
    applyColorCommand(colorDialog.command, colorDialog.value);
    closeColorDialog();
  };

  const clearFormattingPanels = () => {
    setFontSizePanelOpen(false);
    setLineHeightPanelOpen(false);
    setTablePanelOpen(false);
    setResponsivePanelOpen(false);
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


  const toggleBlockquote = () => {
    if (disabled || sourceMode) return;
    focusEditor();
    restoreSelection();
    const blocks = getSelectedBlockElements();
    const shouldRemove = blocks.length > 0 && blocks.every((block) => block.tagName === 'BLOCKQUOTE');
    document.execCommand('formatBlock', false, shouldRemove ? 'p' : 'blockquote');
    emitChange();
    saveSelection();
  };

  const toggleAlignment = (alignment) => {
    if (disabled || sourceMode) return;
    focusEditor();
    restoreSelection();

    const blocks = getSelectedBlockElements();
    if (blocks.length === 0) {
      const command = alignment === 'center'
        ? 'justifyCenter'
        : alignment === 'right'
          ? 'justifyRight'
          : 'justifyLeft';
      document.execCommand(command, false, null);
      emitChange();
      saveSelection();
      return;
    }

    const normalizeAlignment = (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'start') return 'left';
      if (normalized === 'end') return 'right';
      return normalized || 'left';
    };

    const allActive = blocks.every((block) => {
      const current = normalizeAlignment(window.getComputedStyle(block).textAlign);
      return current === alignment;
    });

    blocks.forEach((block) => {
      block.removeAttribute('align');
      if (allActive) {
        block.style.removeProperty('text-align');
        if (!block.getAttribute('style')?.trim()) block.removeAttribute('style');
      } else {
        block.style.textAlign = alignment;
      }
    });

    emitChange();
    saveSelection();
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

  const openTablePanel = (cellOverride = null) => {
    if (!cellOverride) saveSelection();
    setImagePanelOpen(false);
    setYouTubePanelOpen(false);
    setHtml5VideoPanelOpen(false);
    clearSelectedYouTube();
    clearSelectedHtml5Video();
    setFontSizePanelOpen(false);
    setLineHeightPanelOpen(false);
    setTableError('');
    const isCellOverride = Boolean(
      cellOverride
      && typeof cellOverride === 'object'
      && typeof cellOverride.nodeType === 'number'
      && editorRef.current?.contains(cellOverride)
    );
    const cell = isCellOverride
      ? cellOverride
      : resolveTableCellFromSavedRange();
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

  const openImagePanel = (figure = null) => {
    if (!figure) saveSelection();
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

    if (figure && editorRef.current?.contains(figure) && figure.querySelector?.('img')) {
      selectedImageRef.current = figure;
      setImageForm(getImageFormFromFigure(figure));
      setEditingImage(true);
    } else {
      selectedImageRef.current = null;
      setImageForm(createEmptyImageForm());
      setEditingImage(false);
    }

    setImagePanelOpen(true);
  };

  const closeImagePanel = () => {
    setImagePanelOpen(false);
    setImageError('');
    setImageForm(createEmptyImageForm());
    setEditingImage(false);
    selectedImageRef.current = null;
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

    const escapeAttribute = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const escapeText = (value) =>
      String(value || '')
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

    const figureHtml = `<figure data-align="${imageForm.align}" data-width="${width}" style="display: block; width: ${width}%; ${alignStyle}"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(imageForm.alt)}" title="${escapeAttribute(imageForm.alt)}" loading="lazy" style="display: block; width: 100%; max-width: 100%; height: auto; ${alignStyle}">${imageForm.caption.trim() ? `<figcaption>${escapeText(imageForm.caption.trim())}</figcaption>` : ''}</figure>`;
    const sanitizedFigure = sanitizeRichTextHtml(figureHtml);

    const selectedFigure = selectedImageRef.current;
    if (editingImage && selectedFigure && editorRef.current?.contains(selectedFigure)) {
      const holder = document.createElement('div');
      holder.innerHTML = sanitizedFigure;
      const replacement = holder.querySelector('figure');
      if (!replacement) {
        setImageError('이미지를 수정할 수 없습니다.');
        return;
      }
      selectedFigure.replaceWith(replacement);
    } else {
      focusEditor();
      restoreSelection();
      document.execCommand('insertHTML', false, `${sanitizedFigure}<p><br></p>`);
    }

    emitChange();
    closeImagePanel();
  };

  const insertResponsiveMarkup = (type) => {
    if (disabled || sourceMode) return;
    focusEditor();
    restoreSelection();

    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editorRef.current?.contains(range.commonAncestorContainer)) return;

    if (type === 'nowrap') {
      if (!range.collapsed) {
        const startBlock = getElementFromNode(range.startContainer)?.closest?.(RICH_TEXT_BLOCK_SELECTOR);
        const endBlock = getElementFromNode(range.endContainer)?.closest?.(RICH_TEXT_BLOCK_SELECTOR);
        if (startBlock !== endBlock) {
          window.alert('줄바꿈 금지는 같은 문단 또는 같은 표 셀 안의 짧은 문자열에만 적용할 수 있습니다.');
          return;
        }
      }

      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-nowrap', 'true');

      if (range.collapsed) {
        const placeholder = document.createTextNode('\u200B');
        wrapper.appendChild(placeholder);
        range.insertNode(wrapper);
        range.setStart(placeholder, placeholder.textContent.length);
      } else {
        wrapper.appendChild(range.extractContents());
        range.insertNode(wrapper);
        range.setStartAfter(wrapper);
      }

      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      savedRangeRef.current = range.cloneRange();
    } else {
      const markup = type === 'wbr'
        ? '<wbr>'
        : type === 'shy'
          ? '&shy;'
          : '<br data-mobile-only>';
      document.execCommand('insertHTML', false, prepareEditorPreviewHtml(markup));
    }

    emitChange();
    saveSelection();
    setResponsivePanelOpen(false);
  };

  const toggleResponsivePanel = () => {
    saveSelection();
    setResponsivePanelOpen(true);
    setFontSizePanelOpen(false);
    setLineHeightPanelOpen(false);
    setTablePanelOpen(false);
    setImagePanelOpen(false);
    setYouTubePanelOpen(false);
    setHtml5VideoPanelOpen(false);
  };

  const toggleSourceMode = () => {
    if (disabled) return;
    setResponsivePanelOpen(false);
    closeColorDialog();

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
    const imageFigure = event.target?.closest?.('figure');
    const tableCell = event.target?.closest?.('td,th');
    const youtubeWrapper = event.target?.closest?.('[data-video-provider="youtube"]');
    const html5Wrapper = event.target?.closest?.('[data-video-provider="html5"]');

    if (imageFigure && imageFigure.querySelector?.('img') && editorRef.current?.contains(imageFigure)) {
      event.preventDefault();
      clearSelectedTableCell();
      clearSelectedYouTube();
      clearSelectedHtml5Video();
      openImagePanel(imageFigure);
      return;
    }

    if (tableCell && editorRef.current?.contains(tableCell)) {
      event.preventDefault();
      clearSelectedYouTube();
      clearSelectedHtml5Video();
      selectTableCell(tableCell);
      openTablePanel(tableCell);
      return;
    }

    clearSelectedTableCell();
    if (editingTable) {
      setTablePanelOpen(false);
      setEditingTable(false);
    }

    if (youtubeWrapper && editorRef.current?.contains(youtubeWrapper)) {
      event.preventDefault();
      clearSelectedHtml5Video();
      openYouTubePanel(youtubeWrapper);
      return;
    }

    if (html5Wrapper && editorRef.current?.contains(html5Wrapper)) {
      event.preventDefault();
      clearSelectedYouTube();
      openHtml5VideoPanel(html5Wrapper);
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
        <div ref={toolbarRef} role="toolbar" aria-label={`${label} 편집 도구`} className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
          <select
            tabIndex={-1}
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
            tabIndex={-1}
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
            tabIndex={-1}
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
          <ToolbarButton
            title="글자색"
            active={colorDialog.open && colorDialog.command === 'foreColor'}
            disabled={disabled || sourceMode}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openColorDialog('foreColor')}
          >
            <Palette size={15} />
          </ToolbarButton>
          <ToolbarButton
            title="배경색"
            active={colorDialog.open && colorDialog.command === 'hiliteColor'}
            disabled={disabled || sourceMode}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openColorDialog('hiliteColor')}
          >
            <Highlighter size={15} />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="글머리표" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')}><List size={15} /></ToolbarButton>
          <ToolbarButton title="번호 목록" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertOrderedList')}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton title="인용문" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={toggleBlockquote}><Quote size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="왼쪽 정렬" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleAlignment('left')}><AlignLeft size={15} /></ToolbarButton>
          <ToolbarButton title="가운데 정렬" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleAlignment('center')}><AlignCenter size={15} /></ToolbarButton>
          <ToolbarButton title="오른쪽 정렬" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleAlignment('right')}><AlignRight size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="링크 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}><LinkIcon size={15} /></ToolbarButton>
          <ToolbarButton title="이미지 URL 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => openImagePanel()}><ImagePlus size={15} /></ToolbarButton>
          {allowVideos && (
            <>
              <ToolbarButton title="YouTube 동영상 삽입·수정" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => openYouTubePanel()}><Youtube size={16} /></ToolbarButton>
              <ToolbarButton title="일반 동영상 삽입·수정" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => openHtml5VideoPanel()}><Video size={16} /></ToolbarButton>
            </>
          )}
          <button
            tabIndex={-1}
            type="button"
            title="모바일 반응형 조판"
            aria-label="모바일 반응형 조판"
            disabled={disabled || sourceMode}
            onMouseDown={(event) => {
              event.preventDefault();
              saveSelection();
            }}
            onClick={toggleResponsivePanel}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition ${responsivePanelOpen ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span aria-hidden="true" className="text-xs">↔</span>
            반응형
          </button>
          <button
            tabIndex={-1}
            type="button"
            title="표 삽입·편집"
            aria-label="표 삽입·편집"
            disabled={disabled || sourceMode}
            onMouseDown={(event) => {
              event.preventDefault();
              saveSelection();
            }}
            onClick={() => openTablePanel()}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition ${tablePanelOpen ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Table2 size={15} />
            표
          </button>
          <ToolbarButton title="구분선 삽입" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertHorizontalRule')}><Minus size={15} /></ToolbarButton>
          <ToolbarButton title="서식 제거" disabled={disabled || sourceMode} onMouseDown={(e) => e.preventDefault()} onClick={clearAllFormatting}><Eraser size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button
            tabIndex={-1}
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

        <EditorModal
          open={responsivePanelOpen && !sourceMode}
          title="모바일 반응형 조판"
          onClose={() => setResponsivePanelOpen(false)}
          maxWidthClass="max-w-4xl"
          bare
        >
          <div className="border-b border-slate-200 bg-indigo-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">모바일 반응형 조판</div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  PC 편집 화면에는 조판부호가 보이지만 사용자 화면에는 표시되지 않습니다. &lt;picture&gt;·&lt;source&gt;·srcset·sizes는 태그보기에서 직접 입력할 수 있습니다.
                </div>
              </div>
              <button type="button" onClick={() => setResponsivePanelOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertResponsiveMarkup('wbr')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300">
                <span className="block text-xs font-bold text-slate-800">¦ 조건부 줄바꿈</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">폭이 부족할 때만 &lt;wbr&gt; 위치에서 줄바꿈합니다.</span>
              </button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertResponsiveMarkup('shy')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300">
                <span className="block text-xs font-bold text-slate-800">¬ 소프트 하이픈</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">영문 단어가 나뉠 때만 하이픈을 표시합니다.</span>
              </button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertResponsiveMarkup('mobile-break')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300">
                <span className="block text-xs font-bold text-slate-800">M↵ 모바일 줄바꿈</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">640px 이하 화면에서만 강제로 줄을 바꿉니다.</span>
              </button>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertResponsiveMarkup('nowrap')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300">
                <span className="block text-xs font-bold text-slate-800">↔ 줄바꿈 금지</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">선택한 짧은 전화번호·날짜 등을 한 줄로 묶습니다.</span>
              </button>
            </div>
          </div>
        </EditorModal>

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

        <EditorModal
          open={tablePanelOpen && !sourceMode}
          title={editingTable ? '표 행·열 편집' : '표 삽입'}
          onClose={closeTablePanel}
          maxWidthClass="max-w-3xl"
          bare
        >
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
        </EditorModal>

        <EditorModal
          open={imagePanelOpen && !sourceMode}
          title={editingImage ? '이미지 설정 수정' : '이미지 URL 삽입'}
          onClose={closeImagePanel}
          maxWidthClass="max-w-xl"
          bare
        >
          <div className="border-b border-slate-200 bg-orange-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800">{editingImage ? '이미지 설정 수정' : '이미지 URL 삽입'}</div>
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
              <button type="button" onClick={insertImage} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">{editingImage ? '변경사항 적용' : '이미지 삽입'}</button>
            </div>
          </div>
        </EditorModal>

        <EditorModal
          open={youtubePanelOpen && !sourceMode}
          title={editingYouTube ? 'YouTube 동영상 설정 수정' : 'YouTube 동영상 삽입'}
          onClose={closeYouTubePanel}
          maxWidthClass="max-w-2xl"
          bare
        >
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
        </EditorModal>

        <EditorModal
          open={html5VideoPanelOpen && !sourceMode}
          title={editingHtml5Video ? '일반 동영상 설정 수정' : '일반 동영상 삽입'}
          onClose={closeHtml5VideoPanel}
          maxWidthClass="max-w-2xl"
          bare
        >
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
        </EditorModal>

        <EditorModal
          open={colorDialog.open && !sourceMode}
          title={colorDialog.command === 'hiliteColor' ? '배경색 설정' : '글자색 설정'}
          description="색상을 고른 뒤 적용 버튼을 눌러 확정해 주세요."
          onClose={closeColorDialog}
          maxWidthClass="max-w-sm"
        >
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={colorDialog.value}
              onChange={(event) => setColorDialog((current) => ({ ...current, value: event.target.value }))}
              className="h-12 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              aria-label={colorDialog.command === 'hiliteColor' ? '배경색 선택' : '글자색 선택'}
            />
            <input
              value={colorDialog.value}
              onChange={(event) => {
                const value = event.target.value.trim();
                setColorDialog((current) => ({ ...current, value }));
              }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 font-mono text-xs uppercase outline-none mk-form-focus"
              aria-label="색상 코드"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={closeColorDialog} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">취소</button>
            <button
              type="button"
              onClick={confirmColorDialog}
              disabled={!/^#[0-9a-f]{6}$/i.test(colorDialog.value)}
              className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </EditorModal>

        <div className="relative">
          {sourceMode ? (
            <textarea
              tabIndex={0}
              value={sourceValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSourceValue(nextValue);
                lastEmittedHtmlRef.current = nextValue;
                onChange?.(nextValue);
              }}
              disabled={disabled}
              spellCheck={false}
              wrap="soft"
              aria-label={`${label} HTML 태그 편집`}
              className="mk-rich-text-scroll w-full resize-none overflow-x-hidden overflow-y-auto overscroll-contain whitespace-pre-wrap break-words bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100 outline-none [overflow-wrap:anywhere] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ minHeight, maxHeight: resolvedMaxHeight }}
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
                tabIndex={disabled ? -1 : 0}
                suppressContentEditableWarning
                onInput={emitChange}
                onBlur={emitChange}
                onPaste={handlePaste}
                onKeyDown={handleEditorKeyDown}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
                onClick={handleEditorClick}
                onDoubleClick={handleEditorDoubleClick}
                style={{ minHeight, maxHeight: resolvedMaxHeight }}
                className="rich-text-editor-area mk-rich-text-scroll w-full overflow-y-auto overscroll-contain px-4 py-3 text-sm leading-7 text-slate-700 outline-none"
              />
            </>
          )}
        </div>
      </div>

      <p className="text-[10px] leading-4 text-slate-500">
        {allowVideos
          ? '글자 크기·줄간격·표 편집, 모바일 반응형 조판과 외부 이미지·동영상 링크를 지원합니다. YouTube URL·임베드 태그, 일반 동영상 태그와 안전한 HTML 태그를 붙여넣을 수 있습니다.'
          : '글자 크기·줄간격·표 편집, 모바일 반응형 조판, 외부 이미지 URL, 링크와 안전한 HTML 태그를 사용할 수 있습니다. 이 영역에는 동영상이 저장되지 않습니다.'}
      </p>
    </div>
  );
}
