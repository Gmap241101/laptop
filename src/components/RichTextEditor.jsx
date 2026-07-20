import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
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
]);

const DROP_CONTENT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
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

      if (property === 'text-align' && !/^(left|center|right|justify)$/i.test(value)) {
        return '';
      }

      return `${property}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');

const sanitizeElementAttributes = (element) => {
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
      if (safeStyle) {
        element.setAttribute('style', safeStyle);
      } else {
        element.removeAttribute('style');
      }
      return;
    }

    if (element.tagName === 'A') {
      keep = ['href', 'target', 'rel', 'title'].includes(name);
      if (name === 'href' && !isSafeLinkUrl(value)) keep = false;
    } else if (element.tagName === 'IMG') {
      keep = ['src', 'alt', 'title', 'width', 'height', 'loading'].includes(name);
      if (name === 'src' && !isSafeHttpUrl(value)) keep = false;
    } else if (element.tagName === 'TD' || element.tagName === 'TH') {
      keep = ['colspan', 'rowspan'].includes(name);
    } else if (element.tagName === 'FIGURE') {
      keep = ['data-align', 'data-width'].includes(name);
    }

    if (!keep) {
      element.removeAttribute(attribute.name);
    }
  });

  if (element.tagName === 'A') {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  }

  if (element.tagName === 'IMG') {
    element.setAttribute('loading', 'lazy');
    element.setAttribute('style', `${sanitizeStyle(element.getAttribute('style'))}; max-width: 100%; height: auto;`.replace(/^;\s*/, ''));
  }
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

      sanitizeElementAttributes(child);
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
  const hasMedia = Boolean(container.querySelector('img, table, hr'));
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
  const [imagePanelOpen, setImagePanelOpen] = useState(false);
  const [imageForm, setImageForm] = useState({
    url: '',
    alt: '',
    caption: '',
    align: 'center',
    width: '100',
  });
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const nextHtml = String(value || '');
    if (editor.innerHTML !== nextHtml && lastEmittedHtmlRef.current !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [value]);

  const emitChange = () => {
    const html = editorRef.current?.innerHTML || '';
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
    setImageError('');
    setImagePanelOpen(true);
  };

  const closeImagePanel = () => {
    setImagePanelOpen(false);
    setImageError('');
    setImageForm({ url: '', alt: '', caption: '', align: 'center', width: '100' });
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

  const handlePaste = (event) => {
    if (disabled) return;

    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain');
    event.preventDefault();

    if (html) {
      document.execCommand('insertHTML', false, sanitizeRichTextHtml(html));
    } else {
      document.execCommand('insertText', false, text || '');
    }

    emitChange();
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-slate-600">{label}</div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white mk-form-ring-focus-within">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
          <select
            title="문단 형식"
            aria-label="문단 형식"
            disabled={disabled}
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
          <ToolbarButton title="실행 취소" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('undo')}><Undo2 size={15} /></ToolbarButton>
          <ToolbarButton title="다시 실행" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('redo')}><Redo2 size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="굵게" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('bold')}><Bold size={15} /></ToolbarButton>
          <ToolbarButton title="기울임" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('italic')}><Italic size={15} /></ToolbarButton>
          <ToolbarButton title="밑줄" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('underline')}><Underline size={15} /></ToolbarButton>
          <ToolbarButton title="취소선" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('strikeThrough')}><Strikethrough size={15} /></ToolbarButton>
          <label title="글자색" aria-label="글자색" className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600">
            <Palette size={15} />
            <input type="color" disabled={disabled} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => runCommand('foreColor', event.target.value)} />
          </label>
          <label title="배경색" aria-label="배경색" className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600">
            <Highlighter size={15} />
            <input type="color" disabled={disabled} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => {
              focusEditor();
              document.execCommand('hiliteColor', false, event.target.value) || document.execCommand('backColor', false, event.target.value);
              emitChange();
            }} />
          </label>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="글머리표" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')}><List size={15} /></ToolbarButton>
          <ToolbarButton title="번호 목록" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertOrderedList')}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton title="인용문" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('formatBlock', 'blockquote')}><Quote size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="왼쪽 정렬" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyLeft')}><AlignLeft size={15} /></ToolbarButton>
          <ToolbarButton title="가운데 정렬" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyCenter')}><AlignCenter size={15} /></ToolbarButton>
          <ToolbarButton title="오른쪽 정렬" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('justifyRight')}><AlignRight size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolbarButton title="링크 삽입" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}><LinkIcon size={15} /></ToolbarButton>
          <ToolbarButton title="이미지 URL 삽입" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={openImagePanel}><ImagePlus size={15} /></ToolbarButton>
          <ToolbarButton title="표 삽입" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={insertTable}><Table2 size={15} /></ToolbarButton>
          <ToolbarButton title="구분선 삽입" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertHorizontalRule')}><Minus size={15} /></ToolbarButton>
          <ToolbarButton title="서식 제거" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('removeFormat')}><Eraser size={15} /></ToolbarButton>
        </div>

        {imagePanelOpen && (
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

        <div className="relative">
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
            style={{ minHeight }}
            className="rich-text-editor-area w-full overflow-y-auto px-4 py-3 text-sm leading-7 text-slate-700 outline-none"
          />
        </div>
      </div>

      <p className="text-[10px] leading-4 text-slate-500">
        외부 이미지 링크는 원본 서버가 주소를 변경하거나 접근을 차단하면 표시되지 않을 수 있습니다.
      </p>
    </div>
  );
}

export function RichTextContent({ html = '', text = '', className = '' }) {
  const safeHtml = useMemo(() => {
    const source = String(html || '').trim()
      ? html
      : legacyTextToRichHtml(text);
    return sanitizeRichTextHtml(source);
  }, [html, text]);

  return (
    <div
      className={`rich-text-content break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
