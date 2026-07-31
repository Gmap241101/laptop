const FIRESTORE_CAPACITY_COOLDOWN_KEY =
  'rental-system:firestore-capacity-cooldown-until';

export const FIRESTORE_CAPACITY_COOLDOWN_MS = 60 * 1000;

let memoryCooldownUntil = 0;

export const getFirestoreErrorCode = (error) =>
  String(error?.code || error?.name || '')
    .trim()
    .toLowerCase()
    .replace(/^firestore\//, '');

export const isFirestoreResourceExhaustedError = (error) => {
  const code = getFirestoreErrorCode(error);
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
      window.sessionStorage.getItem(FIRESTORE_CAPACITY_COOLDOWN_KEY) || 0
    );
  } catch {
    return 0;
  }
};

export const getFirestoreCapacityCooldownUntil = () =>
  Math.max(memoryCooldownUntil, readStoredCooldownUntil());

export const isFirestoreCapacityCoolingDown = (now = Date.now()) =>
  getFirestoreCapacityCooldownUntil() > now;

export const markFirestoreCapacityExhausted = (
  error,
  cooldownMs = FIRESTORE_CAPACITY_COOLDOWN_MS
) => {
  if (!isFirestoreResourceExhaustedError(error)) return false;

  const cooldownUntil = Date.now() + Math.max(1000, Number(cooldownMs) || 0);
  memoryCooldownUntil = Math.max(memoryCooldownUntil, cooldownUntil);

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        FIRESTORE_CAPACITY_COOLDOWN_KEY,
        String(memoryCooldownUntil)
      );
    } catch {
      // 저장소 사용이 제한된 브라우저에서도 메모리 차단은 유지합니다.
    }
  }

  return true;
};

export const clearFirestoreCapacityCooldown = () => {
  memoryCooldownUntil = 0;

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(FIRESTORE_CAPACITY_COOLDOWN_KEY);
    } catch {
      // 저장소 접근 실패는 무시합니다.
    }
  }
};

export const getFirestoreResourceExhaustedMessage = ({
  operation = 'Firestore 작업',
  cachedDataAvailable = false,
} = {}) =>
  cachedDataAvailable
    ? `${operation} 중 Firestore 사용량 한도에 도달했습니다. 마지막으로 저장된 화면 데이터를 표시하며, 무료 할당량 초기화 후 다시 갱신할 수 있습니다.`
    : `${operation} 중 Firestore 사용량 한도에 도달했습니다. 무료 할당량이 초기화된 뒤 다시 시도하거나 Firebase 결제 사용 설정 여부를 확인해 주세요.`;
