import { useState } from 'react';
import { createDefaultFooterConfigDraft } from './footerContentShared.js';

export const POPUP_DISMISSED_SESSION_KEY =
  'rentalSystemDismissedPopupVersions';
export const POPUP_DISMISSED_LOCAL_KEY =
  'rentalSystemDismissedPopupVersionsUntil';
export const POPUP_DISMISS_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const scheduleAfterUserFirstPaint = (callback) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    const timeoutId = globalThis.setTimeout(callback, 0);
    return () => globalThis.clearTimeout(timeoutId);
  }

  let secondFrameId = 0;
  const firstFrameId = window.requestAnimationFrame(() => {
    secondFrameId = window.requestAnimationFrame(callback);
  });

  return () => {
    window.cancelAnimationFrame?.(firstFrameId);
    if (secondFrameId) window.cancelAnimationFrame?.(secondFrameId);
  };
};

const readDismissedPopupSessionVersions = () => {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(POPUP_DISMISSED_SESSION_KEY) || '[]'
    );
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const readDismissedPopupLocalVersions = () => {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(POPUP_DISMISSED_LOCAL_KEY) || '{}'
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const nowMillis = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([versionKey, expiresAt]) =>
          versionKey && Number(expiresAt) > nowMillis
      )
    );
  } catch {
    return {};
  }
};

export const usePopupFooterContentSubscriptionState = () => {
  const [popupPosts, setPopupPosts] = useState([]);
  const [popupPostsReady, setPopupPostsReady] = useState(true);
  const [
    popupPostsLoadErrorMessage,
    setPopupPostsLoadErrorMessage,
  ] = useState('');

  const [footerConfig, setFooterConfig] = useState(
    createDefaultFooterConfigDraft
  );
  const [footerConfigReady, setFooterConfigReady] = useState(false);
  const [
    footerConfigLoadErrorMessage,
    setFooterConfigLoadErrorMessage,
  ] = useState('');
  const [footerPages, setFooterPages] = useState([]);
  const [footerPagesReady, setFooterPagesReady] = useState(false);
  const [
    footerPagesLoadErrorMessage,
    setFooterPagesLoadErrorMessage,
  ] = useState('');

  const [
    temporarilyDismissedPopupVersions,
    setTemporarilyDismissedPopupVersions,
  ] = useState([]);
  const [
    dismissedPopupSessionVersions,
    setDismissedPopupSessionVersions,
  ] = useState(readDismissedPopupSessionVersions);
  const [
    dismissedPopupLocalVersions,
    setDismissedPopupLocalVersions,
  ] = useState(readDismissedPopupLocalVersions);

  return {
    dismissedPopupLocalVersions,
    dismissedPopupSessionVersions,
    footerConfig,
    footerConfigLoadErrorMessage,
    footerConfigReady,
    footerPages,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    popupPosts,
    popupPostsLoadErrorMessage,
    popupPostsReady,
    setDismissedPopupLocalVersions,
    setDismissedPopupSessionVersions,
    setFooterConfig,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    setTemporarilyDismissedPopupVersions,
    temporarilyDismissedPopupVersions,
  };
};
