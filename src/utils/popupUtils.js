export const getPopupDateMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export const getPopupVersionKey = (post = {}) => {
  const popupId = String(post.id || '').trim();
  if (!popupId) return '';

  const versionMillis =
    getPopupDateMillis(post.updatedAt) ||
    getPopupDateMillis(post.createdAt) ||
    getPopupDateMillis(post.startAt) ||
    0;

  return `${popupId}:${versionMillis}`;
};

export const toDateTimeLocalValue = (value) => {
  const millis = getPopupDateMillis(value);
  if (!millis) return '';

  const date = new Date(millis);
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  );
  return localDate.toISOString().slice(0, 16);
};

export const formatPopupDateTime = (value, dateOnly = false) => {
  const millis = getPopupDateMillis(value);
  if (!millis) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    ...(dateOnly
      ? {}
      : {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
  }).format(new Date(millis));
};

export const getPopupDisplayStatus = (
  post = {},
  nowMillis = Date.now()
) => {
  if (!post.enabled) return { key: 'disabled', label: '사용안함' };

  const authoritativeVisibility = post?.__publicVisibility;
  const startMillis = authoritativeVisibility && Number.isFinite(Number(authoritativeVisibility.startMillis))
    ? Number(authoritativeVisibility.startMillis)
    : getPopupDateMillis(post.startAt);
  const isIndefinite = authoritativeVisibility
    ? authoritativeVisibility.isIndefinite === true
    : post.isIndefinite === true;
  const endMillis = isIndefinite
    ? 0
    : authoritativeVisibility && Number.isFinite(Number(authoritativeVisibility.endMillis))
      ? Number(authoritativeVisibility.endMillis)
      : getPopupDateMillis(post.endAt);

  if (!startMillis || nowMillis < startMillis) {
    return { key: 'scheduled', label: '노출예정' };
  }

  if (!isIndefinite && (!endMillis || nowMillis > endMillis)) {
    return { key: 'ended', label: '노출종료' };
  }

  return { key: 'active', label: '노출중' };
};
