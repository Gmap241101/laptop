import { useEffect, useMemo, useRef } from 'react';
import {
  buildYouTubeEmbedUrl,
  legacyTextToRichHtml,
  parseYouTubeConfig,
  sanitizeRichTextHtml,
} from '../utils/richTextCore.js';

export default function RichTextContent({ html = '', text = '', className = '' }) {
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

    let targetOrigin = '';
    try {
      targetOrigin = new URL(iframe.getAttribute('src') || '', window.location.href).origin;
    } catch {
      return undefined;
    }
    if (!/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/i.test(targetOrigin)) {
      return undefined;
    }

    const iframeId = iframe.id || `youtube-player-${Math.random().toString(36).slice(2)}`;
    iframe.id = iframeId;
    let disposed = false;
    let iframeLoaded = false;
    const retryTimers = [];

    const postPlayerMessage = (payload) => {
      // A freshly inserted cross-origin iframe temporarily owns an about:blank document
      // that inherits the parent origin. Posting with YouTube's targetOrigin before its
      // load event therefore produces the DOMWindow target-origin warning.
      if (disposed || !iframeLoaded || !iframe.contentWindow) return;
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
      retryTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
      [0, 250, 600, 1200, 2200, 4000].forEach((delay) => {
        retryTimers.push(window.setTimeout(sendPlayerCommands, delay));
      });
    };

    const handleLoad = () => {
      iframeLoaded = true;
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
      if (iframeLoaded && document.visibilityState === 'visible') sendPlayerCommands();
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    iframe.addEventListener('load', handleLoad);

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
