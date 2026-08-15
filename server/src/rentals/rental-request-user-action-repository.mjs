const asJson = (value, fallback) => value == null ? fallback : value;
const mapRow = (row) => row ? Object.freeze({
  internalId: String(row.id),
  appUserId: row.app_user_id == null ? '' : String(row.app_user_id),
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
  startDate: row.start_date,
  dueDate: row.due_date,
  purpose: row.purpose,
  status: row.status,
  adminMemo: row.admin_memo || '',
  extensionCount: Number(row.extension_count || 0),
  lastExtensionApprovedDate: row.last_extension_approved_date || '',
  nextExtensionRequestDate: row.next_extension_request_date || '',
  extensionHistory: Array.isArray(row.extension_history) ? row.extension_history : [],
  userActionRequest: asJson(row.user_action_request, null),
  requestedAt: row.requested_at_text || '',
  returnedAt: row.returned_at || null,
  actualReturnDate: row.actual_return_date || '',
  overdueDaysAtReturn: Number(row.overdue_days_at_return || 0),
  overduePenaltyPending: Boolean(row.overdue_penalty_pending),
  overduePenaltyBatchId: row.overdue_penalty_batch_id || '',
  createdAt: row.source_created_at || row.created_at,
  updatedAt: row.source_updated_at || row.updated_at,
}) : null;

const SELECT = `request.id, request.app_user_id, request.request_id, request.firebase_uid,
  request.requester_email, request.requester_name, request.requester_team,
  request.start_date::text AS start_date, request.due_date::text AS due_date,
  request.purpose, request.status, request.requested_at_text, request.admin_memo,
  request.extension_count, request.last_extension_approved_date, request.next_extension_request_date,
  request.extension_history, request.user_action_request, request.returned_at,
  request.actual_return_date, request.overdue_days_at_return, request.overdue_penalty_pending,
  request.overdue_penalty_batch_id, request.source_created_at, request.source_updated_at,
  request.created_at, request.updated_at, item.laptop_id, item.asset_category, item.asset_no`;

const eventPayload = ({ action, current, next, firebaseUid, detail = '', extra = {} }) => ({
  action,
  previousStatus: current?.status || '',
  nextStatus: next?.status || current?.status || '',
  previousMemo: current?.adminMemo || '',
  nextMemo: next?.adminMemo || current?.adminMemo || '',
  actorUid: firebaseUid || '',
  actorName: current?.requesterName || '',
  detail,
  ...extra,
});

export const createRentalRequestUserActionRepository = (pool) => {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool is required.');
  }

  const lockOwned = async (client, appUserId, requestId) => {
    const result = await client.query(
      `SELECT ${SELECT}
         FROM app_rental_requests request
         LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
        WHERE request.request_id = $1 AND request.app_user_id = $2
        FOR UPDATE OF request`,
      [requestId, appUserId],
    );
    const current = mapRow(result.rows[0]);
    if (!current) {
      const error = new Error('rental-request-not-found');
      error.code = 'rental_request_not_found';
      throw error;
    }
    return current;
  };

  const fetchRequest = async (requestId) => mapRow((await pool.query(
    `SELECT ${SELECT}
       FROM app_rental_requests request
       LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
      WHERE request.request_id = $1`, [requestId],
  )).rows[0]);

  return Object.freeze({
    async getOwned(appUserId, requestId) {
      const result = await pool.query(
        `SELECT ${SELECT}
           FROM app_rental_requests request
           LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
          WHERE request.request_id = $1 AND request.app_user_id = $2`,
        [requestId, appUserId],
      );
      return mapRow(result.rows[0]);
    },

    async countCurrentOverdue(appUserId, referenceDate) {
      const result = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM app_rental_requests
          WHERE app_user_id = $1
            AND status = '대여중'
            AND due_date < $2::date`,
        [appUserId, referenceDate],
      );
      return Number(result.rows[0]?.count || 0);
    },

    async editAuthoritative({ appUserId, firebaseUid, requestId, startDate, dueDate, purpose, allowNonOverlappingSameAssetRequests = false, firestoreMirrorStatus = 'synced', beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await lockOwned(client, appUserId, requestId);
        if (!['신청중', '보류'].includes(current.status)) {
          const error = new Error('invalid-direct-edit-status'); error.code = 'invalid_direct_edit_status'; throw error;
        }
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [current.laptopId]);
        const conflict = await client.query(
          `SELECT request_id, start_date::text, due_date::text, status
             FROM app_rental_asset_reservation_guards
            WHERE laptop_id = $1 AND active = TRUE AND request_id <> $2
              AND ($5::boolean = FALSE OR (start_date <= $4::date AND due_date >= $3::date))
            ORDER BY start_date, request_id LIMIT 1`,
          [current.laptopId, requestId, startDate, dueDate, Boolean(allowNonOverlappingSameAssetRequests)],
        );
        if (conflict.rowCount) {
          const error = new Error('direct-edit-period-conflict');
          error.code = 'direct_edit_period_conflict';
          error.blockingRequest = conflict.rows[0];
          throw error;
        }
        const next = Object.freeze({ ...current, startDate, dueDate, purpose, userActionRequest: null });
        if (typeof beforeCommit === 'function') await beforeCommit({ currentRequest: current, nextRequest: next, client });
        await client.query(
          `UPDATE app_rental_requests SET start_date=$3::date, due_date=$4::date, purpose=$5,
             user_action_request=NULL, source_mode='postgresql-authoritative-user-action',
             firestore_mirror_status=$6, firestore_mirror_error='', firestore_mirrored_at=CASE WHEN $6='synced' THEN NOW() ELSE NULL END,
             source_updated_at=NOW(), source_synced_at=NOW(), updated_at=NOW()
           WHERE request_id=$1 AND app_user_id=$2`,
          [requestId, appUserId, startDate, dueDate, purpose, firestoreMirrorStatus],
        );
        await client.query(
          `UPDATE app_rental_asset_reservation_guards SET start_date=$2::date, due_date=$3::date,
             source_mode='postgresql-authoritative-user-action', synced_at=NOW(), updated_at=NOW()
           WHERE request_id=$1`, [requestId, startDate, dueDate],
        );
        await client.query(
          `INSERT INTO app_rental_request_events (rental_request_id,event_type,actor_app_user_id,actor_firebase_uid,event_payload,source_mode)
           SELECT id,'user-request-edited',$2,$3,$4::jsonb,'postgresql-authoritative-user-action'
             FROM app_rental_requests WHERE request_id=$1`,
          [requestId, appUserId, firebaseUid, JSON.stringify(eventPayload({ action: 'user-request-edited', current, next, firebaseUid, detail: '사용자 신청 정보 수정' }))],
        );
        await client.query('COMMIT');
        return fetchRequest(requestId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },

    async cancelAuthoritative({ appUserId, firebaseUid, requestId, beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await lockOwned(client, appUserId, requestId);
        if (current.status !== '신청중') {
          const error = new Error('invalid-direct-cancel-status'); error.code = 'invalid_direct_cancel_status'; throw error;
        }
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [current.laptopId]);
        if (typeof beforeCommit === 'function') await beforeCommit({ currentRequest: current, client });
        await client.query('DELETE FROM app_rental_requests WHERE request_id=$1 AND app_user_id=$2', [requestId, appUserId]);
        await client.query('COMMIT');
        return Object.freeze({ deleted: true, request: current, firebaseUid });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },

    async submitManualExtension({ appUserId, firebaseUid, requestId, actionRequest, firestoreMirrorStatus = 'synced', beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await lockOwned(client, appUserId, requestId);
        if (typeof beforeCommit === 'function') await beforeCommit({ currentRequest: current, nextRequest: { ...current, userActionRequest: actionRequest }, client });
        await client.query(
          `UPDATE app_rental_requests SET user_action_request=$3::jsonb,
             source_mode='postgresql-authoritative-user-action', firestore_mirror_status=$4,
             firestore_mirror_error='', firestore_mirrored_at=CASE WHEN $4='synced' THEN NOW() ELSE NULL END, source_updated_at=NOW(), source_synced_at=NOW(), updated_at=NOW()
           WHERE request_id=$1 AND app_user_id=$2`,
          [requestId, appUserId, JSON.stringify(actionRequest), firestoreMirrorStatus],
        );
        await client.query(
          `INSERT INTO app_rental_request_events (rental_request_id,event_type,actor_app_user_id,actor_firebase_uid,event_payload,source_mode)
           SELECT id,'user-extension-requested',$2,$3,$4::jsonb,'postgresql-authoritative-user-action'
             FROM app_rental_requests WHERE request_id=$1`,
          [requestId, appUserId, firebaseUid, JSON.stringify(eventPayload({ action: 'user-extension-requested', current, next: current, firebaseUid, detail: '대여 연장 요청 접수', extra: { userActionRequest: actionRequest } }))],
        );
        await client.query('COMMIT');
        return fetchRequest(requestId);
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },

    async autoExtendAuthoritative({ appUserId, firebaseUid, requestId, dueDate, extensionCount, lastExtensionApprovedDate, nextExtensionRequestDate, extensionHistory, actionRequest, firestoreMirrorStatus = 'synced', beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await lockOwned(client, appUserId, requestId);
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [current.laptopId]);
        const conflict = await client.query(
          `SELECT request_id, start_date::text, due_date::text, status
             FROM app_rental_asset_reservation_guards
            WHERE laptop_id=$1 AND active=TRUE AND request_id<>$2
              AND start_date <= $3::date AND due_date >= ($4::date + INTERVAL '1 day')::date
            ORDER BY start_date, request_id LIMIT 1`,
          [current.laptopId, requestId, dueDate, current.dueDate],
        );
        if (conflict.rowCount) {
          const error = new Error('rental-extension-period-conflict'); error.code = 'rental_extension_period_conflict'; error.blockingRequest = conflict.rows[0]; throw error;
        }
        const next = Object.freeze({ ...current, dueDate, extensionCount, lastExtensionApprovedDate, nextExtensionRequestDate, extensionHistory, userActionRequest: actionRequest });
        if (typeof beforeCommit === 'function') await beforeCommit({ currentRequest: current, nextRequest: next, client });
        await client.query(
          `UPDATE app_rental_requests SET due_date=$3::date, extension_count=$4,
             last_extension_approved_date=$5, next_extension_request_date=$6,
             extension_history=$7::jsonb, user_action_request=$8::jsonb,
             source_mode='postgresql-authoritative-user-action', firestore_mirror_status=$9, firestore_mirror_error='',
             firestore_mirrored_at=CASE WHEN $9='synced' THEN NOW() ELSE NULL END, source_updated_at=NOW(), source_synced_at=NOW(), updated_at=NOW()
           WHERE request_id=$1 AND app_user_id=$2`,
          [requestId, appUserId, dueDate, extensionCount, lastExtensionApprovedDate, nextExtensionRequestDate, JSON.stringify(extensionHistory), JSON.stringify(actionRequest), firestoreMirrorStatus],
        );
        await client.query(
          `UPDATE app_rental_asset_reservation_guards SET due_date=$2::date,
             source_mode='postgresql-authoritative-user-action', synced_at=NOW(), updated_at=NOW()
           WHERE request_id=$1`, [requestId, dueDate],
        );
        await client.query(
          `INSERT INTO app_rental_request_events (rental_request_id,event_type,actor_app_user_id,actor_firebase_uid,event_payload,source_mode)
           SELECT id,'user-extension-auto-approved',$2,$3,$4::jsonb,'postgresql-authoritative-user-action'
             FROM app_rental_requests WHERE request_id=$1`,
          [requestId, appUserId, firebaseUid, JSON.stringify(eventPayload({ action: 'user-extension-auto-approved', current, next, firebaseUid, detail: '대여 연장 자동 승인', extra: { userActionRequest: actionRequest } }))],
        );
        await client.query('COMMIT');
        return fetchRequest(requestId);
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
  });
};
