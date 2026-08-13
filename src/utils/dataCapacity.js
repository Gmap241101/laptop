const DATA_CAPACITY_COOLDOWN_KEY =
  'rental-system:data-capacity-cooldown-until';

export const DATA_CAPACITY_COOLDOWN_MS = 60 * 1000;

let memoryCooldownUntil = 0;

export const getDataErrorCode = (error) =>
  String(error?.code || error?.name || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z0-9_-]+\//, '');

export const isDataResourceExhaustedError = (error) => {
  const code = getDataErrorCode(error);
  const message = String(error?.message || '').toLowerCase();

  return (
    code === 'resource-exhausted' ||
    code === '8' ||
    message.includes('resource_exhausted') ||
    message.includes('resource-exhausted') ||
    message.includes('daily quota') ||
    message.includes('quota exceeded')
  );
};

const readStoredCooldownUntil = () => {
  if (typeof window === 'undefined') return 0;

  try {
    return Number(
      window.sessionStorage.getItem(DATA_CAPACITY_COOLDOWN_KEY) || 0
    );
  } catch {
    return 0;
  }
};

export const getDataCapacityCooldownUntil = () =>
  Math.max(memoryCooldownUntil, readStoredCooldownUntil());

export const isDataCapacityCoolingDown = (now = Date.now()) =>
  getDataCapacityCooldownUntil() > now;

export const markDataCapacityExhausted = (
  error,
  cooldownMs = DATA_CAPACITY_COOLDOWN_MS
) => {
  if (!isDataResourceExhaustedError(error)) return false;

  const cooldownUntil = Date.now() + Math.max(1000, Number(cooldownMs) || 0);
  memoryCooldownUntil = Math.max(memoryCooldownUntil, cooldownUntil);

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        DATA_CAPACITY_COOLDOWN_KEY,
        String(memoryCooldownUntil)
      );
    } catch {
      // 저장소 사용이 제한된 브라우저에서도 메모리 차단은 유지합니다.
    }
  }

  return true;
};

export const clearDataCapacityCooldown = () => {
  memoryCooldownUntil = 0;

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(DATA_CAPACITY_COOLDOWN_KEY);
    } catch {
      // 저장소 접근 실패는 무시합니다.
    }
  }
};

export const getDataResourceExhaustedMessage = ({
  operation = '데이터 작업',
  cachedDataAvailable = false,
} = {}) =>
  cachedDataAvailable
    ? `${operation} 중 데이터 서비스 용량 한도에 도달했습니다. 마지막으로 저장된 화면 데이터를 표시하며, 서비스 상태가 정상화된 뒤 다시 갱신할 수 있습니다.`
    : `${operation} 중 데이터 서비스 용량 한도에 도달했습니다. 서비스 상태와 PostgreSQL/API 용량 설정을 확인한 뒤 다시 시도해 주세요.`;
