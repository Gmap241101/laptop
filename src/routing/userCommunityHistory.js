const USER_COMMUNITY_HISTORY_STATE_KEY = '__mkRentalUserCommunityHistoryV1';
const USER_COMMUNITY_TABS = new Set(['notice', 'faq', 'inquiry']);

const normalizeText = (value) => String(value || '').trim();

export const readUserCommunityHistoryState = (
  state = globalThis.history?.state
) => {
  const value = state?.[USER_COMMUNITY_HISTORY_STATE_KEY];
  const tab = normalizeText(value?.tab);
  const view = normalizeText(value?.view);
  if (!USER_COMMUNITY_TABS.has(tab) || !view) return null;
  return Object.freeze({
    tab,
    view,
    id: normalizeText(value?.id),
  });
};

const createUserCommunityHistoryState = ({ tab, view, id = '' }) => ({
  ...(globalThis.history?.state || {}),
  [USER_COMMUNITY_HISTORY_STATE_KEY]: {
    surface: 'user',
    tab: normalizeText(tab),
    view: normalizeText(view),
    id: normalizeText(id),
  },
});

const isSameState = (current, next) => Boolean(
  current
  && current.tab === normalizeText(next?.tab)
  && current.view === normalizeText(next?.view)
  && current.id === normalizeText(next?.id)
);

export const replaceUserCommunityHistoryState = (next) => {
  if (typeof window === 'undefined') return false;
  const normalized = {
    tab: normalizeText(next?.tab),
    view: normalizeText(next?.view),
    id: normalizeText(next?.id),
  };
  if (!USER_COMMUNITY_TABS.has(normalized.tab) || !normalized.view) return false;
  const current = readUserCommunityHistoryState();
  if (isSameState(current, normalized)) return false;
  window.history.replaceState(
    createUserCommunityHistoryState(normalized),
    '',
    window.location.href
  );
  return true;
};

export const pushUserCommunityHistoryState = (next) => {
  if (typeof window === 'undefined') return false;
  const normalized = {
    tab: normalizeText(next?.tab),
    view: normalizeText(next?.view),
    id: normalizeText(next?.id),
  };
  if (!USER_COMMUNITY_TABS.has(normalized.tab) || !normalized.view) return false;
  const current = readUserCommunityHistoryState();
  if (isSameState(current, normalized)) return false;
  window.history.pushState(
    createUserCommunityHistoryState(normalized),
    '',
    window.location.href
  );
  return true;
};

export const backUserCommunityHistoryState = ({ tab, view, id = '' } = {}) => {
  if (typeof window === 'undefined') return false;
  const current = readUserCommunityHistoryState();
  if (
    !current
    || current.tab !== normalizeText(tab)
    || current.view !== normalizeText(view)
    || (id && current.id !== normalizeText(id))
    || window.history.length <= 1
  ) {
    return false;
  }
  window.history.back();
  return true;
};
