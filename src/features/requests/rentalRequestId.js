export const RENTAL_REQUEST_ID_PATTERN = /^REQ-[A-Za-z0-9_-]{8,80}$/;

export const createRentalRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  const value = uuid
    ? uuid.replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  const requestId = `REQ-${value}`;
  if (!RENTAL_REQUEST_ID_PATTERN.test(requestId)) {
    throw Object.assign(new Error('Generated rental request ID does not satisfy the backend contract.'), {
      code: 'rental_request_id_generation_invalid',
    });
  }
  return requestId;
};
