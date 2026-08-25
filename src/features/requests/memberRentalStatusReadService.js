import { clerkUserClient as clerkStagingClient } from '../../clerk/clerkUserClient.js';

const CACHE_TTL_MS = 30000;
const monthCache = new Map();
const monthPending = new Map();

const normalizeMonth = (value) => String(value || '').trim();

export const loadMemberRentalStatusMonth = async (month, { force = false } = {}) => {
  const key = normalizeMonth(month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
    throw Object.assign(new Error('Invalid rental status month.'), { code: 'member_rental_status_month_invalid' });
  }

  const cached = monthCache.get(key);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }
  if (!force && monthPending.has(key)) return monthPending.get(key);

  const pending = clerkStagingClient.getMemberRentalStatusMonth(key)
    .then((payload) => {
      const value = Object.freeze({
        ...(payload.memberRentalStatus || {}),
        loadedAt: Date.now(),
      });
      monthCache.set(key, value);
      return value;
    })
    .finally(() => {
      if (monthPending.get(key) === pending) monthPending.delete(key);
    });

  monthPending.set(key, pending);
  return pending;
};

export const getCachedMemberRentalStatusMonth = (month) => monthCache.get(normalizeMonth(month)) || null;

export const clearMemberRentalStatusCache = (month = '') => {
  const key = normalizeMonth(month);
  if (key) {
    monthCache.delete(key);
    monthPending.delete(key);
    return;
  }
  monthCache.clear();
  monthPending.clear();
};
