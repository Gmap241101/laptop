import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';

export const loadMemberAccountRentalHistory = async (account = {}) => {
  const uid = String(account?.uid || account?.firebaseUid || '').trim();
  if (!uid) {
    const error = new Error('Member UID is required before loading rental history.');
    error.code = 'admin_member_rental_history_uid_missing';
    throw error;
  }

  const payload = await clerkStagingClient.getAdminMemberRentalHistory(uid);
  const history = payload?.adminMemberRentalHistory;
  if (history?.source !== 'postgresql' || !Array.isArray(history?.requests)) {
    const error = new Error('Backend returned an invalid PostgreSQL member rental history payload.');
    error.code = 'admin_member_rental_history_payload_invalid';
    throw error;
  }

  return history;
};

export const loadMemberAccountHistorySummary = async (account = {}) => {
  const history = await loadMemberAccountRentalHistory(account);
  return history.summary || {
    linkedUidCount: Array.isArray(history.linkedUids) ? history.linkedUids.length : 0,
    totalRequests: history.requests.length,
    previousRequests: 0,
    activeRequests: 0,
    overdueRequests: 0,
    returnedRequests: 0,
  };
};
