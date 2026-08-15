const dateText = (value) => {
  if (!value) return '';
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  return String(value).slice(0, 10);
};

const mapAuthoritativeRow = (row) => row ? Object.freeze({
  shadowId: '',
  appUserId: String(row.app_user_id),
  id: row.request_id,
  requesterUid: row.firebase_uid,
  requesterEmail: row.requester_email,
  requesterName: row.requester_name,
  requesterTeam: row.requester_team,
  team: row.requester_team,
  borrower: row.requester_name,
  laptopId: row.laptop_id || '',
  assetCategory: row.asset_category || '',
  assetNo: row.asset_no || '',
  startDate: dateText(row.start_date),
  dueDate: dateText(row.due_date),
  purpose: row.purpose || '',
  status: row.status || '',
  adminMemo: row.admin_memo || '',
  extensionCount: Number(row.extension_count || 0),
  lastExtensionApprovedDate: row.last_extension_approved_date || '',
  nextExtensionRequestDate: row.next_extension_request_date || '',
  extensionHistory: Array.isArray(row.extension_history) ? row.extension_history : [],
  userActionRequest: row.user_action_request || null,
  requestedAt: row.requested_at_text || '',
  returnedAt: row.returned_at || null,
  overduePenaltyPending: Boolean(row.overdue_penalty_pending),
  overduePenaltyBatchId: row.overdue_penalty_batch_id || '',
  syncedAt: row.source_synced_at || row.updated_at || null,
  createdAt: row.source_created_at || row.created_at || null,
  updatedAt: row.source_updated_at || row.updated_at || null,
  sourceDocumentPath: `postgresql/rentalRequests/${row.request_id}`,
  sourceHash: '',
  shadowSyncedAt: null,
  sourceMode: row.source_mode || 'postgresql-authoritative',
  firestoreMirrorStatus: row.firestore_mirror_status || '',
}) : null;

const AUTHORITATIVE_COLUMNS = `
  request.app_user_id, request.request_id, request.firebase_uid,
  request.requester_email, request.requester_name, request.requester_team,
  item.laptop_id, item.asset_category, item.asset_no,
  request.start_date, request.due_date, request.purpose, request.status,
  request.admin_memo, request.extension_count, request.last_extension_approved_date,
  request.next_extension_request_date, request.extension_history, request.user_action_request,
  request.requested_at_text, request.returned_at, request.overdue_penalty_pending,
  request.overdue_penalty_batch_id, request.source_mode, request.firestore_mirror_status,
  request.source_created_at, request.source_updated_at, request.source_synced_at,
  request.created_at, request.updated_at`;

export const createRentalRequestRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool with query() is required.');
  }

  return Object.freeze({
    async listAuthoritativeByAppUserId(appUserId) {
      const result = await pool.query(
        `SELECT ${AUTHORITATIVE_COLUMNS}
           FROM app_rental_requests request
           LEFT JOIN app_rental_request_items item ON item.rental_request_id=request.id
          WHERE request.app_user_id=$1
          ORDER BY COALESCE(request.source_created_at, request.created_at) DESC NULLS LAST,
                   request.request_id DESC`,
        [appUserId],
      );
      return result.rows.map(mapAuthoritativeRow);
    },
  });
};
