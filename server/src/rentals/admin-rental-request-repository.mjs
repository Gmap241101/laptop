const trim = (value) => String(value ?? '').trim();
const asJson = (value, fallback) => value == null ? fallback : value;
const BLOCKING = new Set(['신청중', '대여중', '보류']);
const TRANSITIONS = Object.freeze({
  '신청중': ['대여중', '보류', '불허', '사용자취소'],
  '대여중': ['신청중', '보류', '불허', '반납완료'],
  '보류': ['신청중', '대여중', '불허', '사용자취소'],
  '불허': ['신청중', '보류', '대여중'],
  '반납완료': ['대여중'],
  '사용자취소': ['신청중', '보류'],
});

const mapRow = (row) => row ? Object.freeze({
  id: row.request_id,
  appUserId: row.app_user_id == null ? null : String(row.app_user_id),
  requesterUid: row.firebase_uid,
  requesterEmail: row.requester_email,
  requesterName: row.requester_name,
  requesterTeam: row.requester_team,
  team: row.requester_team,
  borrower: row.requester_name,
  laptopId: row.laptop_id || '',
  assetCategory: row.asset_category || '',
  assetNo: row.asset_no || '',
  startDate: row.start_date ? String(row.start_date).slice(0, 10) : '',
  dueDate: row.due_date ? String(row.due_date).slice(0, 10) : '',
  purpose: row.purpose,
  status: row.status,
  adminMemo: row.admin_memo || '',
  extensionCount: Number(row.extension_count || 0),
  lastExtensionApprovedDate: row.last_extension_approved_date || '',
  nextExtensionRequestDate: row.next_extension_request_date || '',
  extensionHistory: Array.isArray(row.extension_history) ? row.extension_history : [],
  userActionRequest: asJson(row.user_action_request, null),
  requestedAt: row.requested_at_text || '',
  returnedAt: row.returned_at,
  actualReturnDate: row.actual_return_date || '',
  overdueDaysAtReturn: Number(row.overdue_days_at_return || 0),
  overduePenaltyPending: Boolean(row.overdue_penalty_pending),
  overduePenaltyBatchId: row.overdue_penalty_batch_id || '',
  createdAt: row.source_created_at || row.created_at,
  updatedAt: row.source_updated_at || row.updated_at,
  syncedAt: row.source_synced_at || null,
  sourceMode: row.source_mode,
  firestoreMirrorStatus: row.firestore_mirror_status,
}) : null;

const SELECT = `
  request.request_id, request.app_user_id, request.firebase_uid,
  request.requester_email, request.requester_name, request.requester_team,
  item.laptop_id, item.asset_category, item.asset_no,
  request.start_date, request.due_date, request.purpose, request.status,
  request.admin_memo, request.extension_count, request.last_extension_approved_date,
  request.next_extension_request_date, request.extension_history, request.user_action_request,
  request.requested_at_text, request.returned_at, request.actual_return_date,
  request.overdue_days_at_return, request.overdue_penalty_pending,
  request.overdue_penalty_batch_id, request.source_mode, request.firestore_mirror_status,
  request.source_created_at, request.source_updated_at, request.source_synced_at,
  request.created_at, request.updated_at`;

const buildTabWhere = ({ tab, quickFilter, referenceDate, query }) => {
  const values = [];
  const where = [];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };

  if (quickFilter !== 'pendingUserAction') {
    if (tab === 'pending') where.push("request.status IN ('신청중','보류')");
    else if (tab === 'rental') where.push("request.status = '대여중'");
    else if (tab === 'closed') where.push("request.status IN ('불허','사용자취소')");
    else if (tab === 'returned') where.push("request.status = '반납완료'");
  }

  if (quickFilter === 'overdue') {
    where.push("request.status = '대여중'");
    add('request.due_date < ?::date', referenceDate);
    add('(request.start_date IS NULL OR request.start_date <= ?::date)', referenceDate);
  } else if (quickFilter === 'dueToday') {
    where.push("request.status = '대여중'");
    add('request.due_date = ?::date', referenceDate);
  } else if (quickFilter === 'startToday') {
    where.push("request.status = '대여중'");
    add('request.start_date = ?::date', referenceDate);
  } else if (quickFilter === 'pendingUserAction') {
    where.push("request.user_action_request->>'status' = 'pending'");
  } else if (quickFilter === 'requested') {
    where.push("request.status = '신청중'");
  } else if (quickFilter === 'onHold') {
    where.push("request.status = '보류'");
  } else if (quickFilter === 'reserved') {
    where.push("request.status = '대여중'");
    add('request.start_date > ?::date', referenceDate);
  }

  const normalizedQuery = trim(query).toLowerCase();
  if (normalizedQuery) {
    add(`LOWER(CONCAT_WS(' ', request.request_id, item.asset_no, item.asset_category, request.requester_name,
      request.requester_email, request.requester_team, request.purpose)) LIKE '%' || ? || '%'`, normalizedQuery);
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
};

const orderForTab = (tab, referenceDateParam) => {
  if (tab === 'pending') return 'ORDER BY COALESCE(request.source_updated_at, request.updated_at, request.created_at) ASC, request.request_id ASC';
  if (tab === 'rental') {
    return `ORDER BY CASE WHEN request.due_date < ${referenceDateParam}::date THEN 0 ELSE 1 END ASC,
      request.due_date ASC, request.request_id ASC`;
  }
  return 'ORDER BY COALESCE(request.source_updated_at, request.updated_at, request.created_at) DESC, request.request_id DESC';
};

export const createAdminRentalRequestRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with query()/connect() is required.');
  }

  const resolveAppUserId = async (client, firebaseUid) => {
    const result = await client.query(
      'SELECT app_user_id FROM app_user_firebase_links WHERE firebase_uid = $1 LIMIT 1',
      [firebaseUid],
    );
    return result.rows[0]?.app_user_id || null;
  };

  return Object.freeze({
    async upsertImportedRequests(requests = []) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const request of requests) {
          const appUserId = await resolveAppUserId(client, request.requesterUid);
          const result = await client.query(
            `INSERT INTO app_rental_requests (
               request_id, app_user_id, firebase_uid, requester_email, requester_name,
               requester_team, start_date, due_date, purpose, status, requested_at_text,
               source_mode, idempotency_key, firestore_mirror_status, admin_memo,
               extension_count, last_extension_approved_date, next_extension_request_date,
               extension_history, user_action_request, returned_at, actual_return_date,
               overdue_days_at_return, overdue_penalty_pending, overdue_penalty_batch_id,
               source_created_at, source_updated_at, source_synced_at, created_at, updated_at
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,
               'firestore-admin-import','legacy:' || $1,'legacy-source',$12,$13,$14,$15,
               $16::jsonb,$17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,
               COALESCE($23,NOW()),COALESCE($24,NOW())
             )
             ON CONFLICT (request_id) DO UPDATE SET
               app_user_id = COALESCE(app_rental_requests.app_user_id, EXCLUDED.app_user_id),
               firebase_uid = EXCLUDED.firebase_uid,
               requester_email = EXCLUDED.requester_email,
               requester_name = EXCLUDED.requester_name,
               requester_team = EXCLUDED.requester_team,
               start_date = EXCLUDED.start_date,
               due_date = EXCLUDED.due_date,
               purpose = EXCLUDED.purpose,
               status = EXCLUDED.status,
               requested_at_text = EXCLUDED.requested_at_text,
               admin_memo = EXCLUDED.admin_memo,
               extension_count = EXCLUDED.extension_count,
               last_extension_approved_date = EXCLUDED.last_extension_approved_date,
               next_extension_request_date = EXCLUDED.next_extension_request_date,
               extension_history = EXCLUDED.extension_history,
               user_action_request = EXCLUDED.user_action_request,
               returned_at = EXCLUDED.returned_at,
               actual_return_date = EXCLUDED.actual_return_date,
               overdue_days_at_return = EXCLUDED.overdue_days_at_return,
               overdue_penalty_pending = EXCLUDED.overdue_penalty_pending,
               overdue_penalty_batch_id = EXCLUDED.overdue_penalty_batch_id,
               source_created_at = EXCLUDED.source_created_at,
               source_updated_at = EXCLUDED.source_updated_at,
               source_synced_at = EXCLUDED.source_synced_at,
               firestore_mirror_status = CASE
                 WHEN app_rental_requests.source_mode LIKE 'postgresql-authoritative%' THEN 'synced'
                 ELSE 'legacy-source'
               END,
               updated_at = NOW()
             RETURNING id`,
            [
              request.id, appUserId, request.requesterUid, request.requesterEmail,
              request.requesterName, request.requesterTeam, request.startDate, request.dueDate,
              request.purpose, request.status, request.requestedAt, request.adminMemo,
              request.extensionCount, request.lastExtensionApprovedDate,
              request.nextExtensionRequestDate, JSON.stringify(request.extensionHistory || []),
              request.userActionRequest == null ? null : JSON.stringify(request.userActionRequest),
              request.returnedAt, request.actualReturnDate, request.overdueDaysAtReturn,
              request.overduePenaltyPending, request.overduePenaltyBatchId,
              request.createdAt, request.updatedAt, request.syncedAt,
            ],
          );
          const rentalRequestId = result.rows[0]?.id;
          await client.query(
            `INSERT INTO app_rental_request_items (rental_request_id, line_number, laptop_id, asset_category, asset_no)
             VALUES ($1,1,$2,$3,$4)
             ON CONFLICT (rental_request_id) DO UPDATE SET
               laptop_id = EXCLUDED.laptop_id,
               asset_category = EXCLUDED.asset_category,
               asset_no = EXCLUDED.asset_no,
               updated_at = NOW()`,
            [rentalRequestId, request.laptopId, request.assetCategory, request.assetNo],
          );
          const active = BLOCKING.has(request.status);
          await client.query(
            `INSERT INTO app_rental_asset_reservation_guards (
               request_id, rental_request_id, laptop_id, start_date, due_date, status, active, source_mode, synced_at
             ) VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,'firestore-admin-import',NOW())
             ON CONFLICT (request_id) DO UPDATE SET
               rental_request_id = EXCLUDED.rental_request_id,
               laptop_id = EXCLUDED.laptop_id,
               start_date = EXCLUDED.start_date,
               due_date = EXCLUDED.due_date,
               status = EXCLUDED.status,
               active = EXCLUDED.active,
               source_mode = EXCLUDED.source_mode,
               synced_at = NOW(), updated_at = NOW()`,
            [request.id, rentalRequestId, request.laptopId, request.startDate, request.dueDate, request.status, active],
          );
        }
        await client.query('COMMIT');
        return requests.length;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async list({ tab = 'pending', quickFilter = 'all', query = '', page = 1, pageSize = 10, referenceDate }) {
      const filter = buildTabWhere({ tab, quickFilter, referenceDate, query });
      const count = await pool.query(
        `SELECT COUNT(*)::bigint AS count
           FROM app_rental_requests request
           LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
           ${filter.clause}`,
        filter.values,
      );
      const values = [...filter.values];
      values.push(referenceDate);
      const referenceParam = `$${values.length}`;
      values.push(pageSize);
      const limitParam = `$${values.length}`;
      values.push(Math.max(0, (page - 1) * pageSize));
      const offsetParam = `$${values.length}`;
      const rows = await pool.query(
        `SELECT ${SELECT}
           FROM app_rental_requests request
           LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
           ${filter.clause}
           ${orderForTab(tab, referenceParam)}
           LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values,
      );
      return Object.freeze({
        requests: rows.rows.map(mapRow),
        totalCount: Number(count.rows[0]?.count || 0),
      });
    },

    async getByRequestId(requestId) {
      const result = await pool.query(
        `SELECT ${SELECT}
           FROM app_rental_requests request
           LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
          WHERE request.request_id = $1`,
        [requestId],
      );
      return mapRow(result.rows[0]);
    },

    async getCounts(referenceDate) {
      const result = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('신청중','보류'))::bigint AS pending,
           COUNT(*) FILTER (WHERE status = '대여중')::bigint AS rental,
           COUNT(*) FILTER (WHERE status IN ('불허','사용자취소'))::bigint AS closed,
           COUNT(*) FILTER (WHERE status = '반납완료')::bigint AS returned,
           COUNT(*) FILTER (WHERE status = '신청중')::bigint AS requested,
           COUNT(*) FILTER (WHERE status = '보류')::bigint AS on_hold,
           COUNT(*) FILTER (WHERE status = '대여중' AND start_date <= $1::date AND due_date < $1::date)::bigint AS overdue,
           COUNT(*) FILTER (WHERE status = '대여중' AND due_date = $1::date)::bigint AS due_today,
           COUNT(*) FILTER (WHERE status = '대여중' AND start_date = $1::date)::bigint AS start_today,
           COUNT(*) FILTER (WHERE user_action_request->>'status' = 'pending')::bigint AS pending_user_action,
           COUNT(DISTINCT laptop_id) FILTER (WHERE status = '대여중' AND start_date > $1::date)::bigint AS unique_reserved_assets,
           COUNT(DISTINCT laptop_id) FILTER (WHERE status = '대여중' AND start_date <= $1::date)::bigint AS unique_active_assets,
           COUNT(DISTINCT laptop_id) FILTER (WHERE status = '대여중' AND start_date <= $1::date AND due_date < $1::date)::bigint AS unique_overdue_assets,
           COUNT(DISTINCT COALESCE(NULLIF(firebase_uid,''), NULLIF(requester_email,''), requester_name || '|' || requester_team))
             FILTER (WHERE status = '대여중' AND start_date <= $1::date AND due_date < $1::date)::bigint AS unique_overdue_users,
           COALESCE(MAX(($1::date - due_date)) FILTER (WHERE status = '대여중' AND start_date <= $1::date AND due_date < $1::date), 0)::bigint AS longest_overdue_days,
           COALESCE(MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(source_created_at, created_at))) / 86400))
             FILTER (WHERE status = '신청중'), 0)::bigint AS oldest_requested_days
         FROM app_rental_requests request
         LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id`,
        [referenceDate],
      );
      const row = result.rows[0] || {};
      return Object.freeze(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)])));
    },

    async hasOtherCurrentOverdue({ requesterUid, excludedRequestId, referenceDate }) {
      const result = await pool.query(
        `SELECT 1 FROM app_rental_requests
          WHERE firebase_uid = $1 AND request_id <> $2 AND status = '대여중' AND due_date < $3::date
          LIMIT 1`,
        [requesterUid, excludedRequestId, referenceDate],
      );
      return result.rowCount > 0;
    },

    async changeStatus({ requestId, nextStatus, auditActor, returnFields = {}, allowNonOverlappingSameAssetRequests = false, relatedRequestUpdates = [], beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query(
          `SELECT ${SELECT}
             FROM app_rental_requests request
             LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
            WHERE request.request_id = $1
            FOR UPDATE OF request`,
          [requestId],
        );
        const current = mapRow(locked.rows[0]);
        if (!current) {
          const error = new Error('rental-request-not-found');
          error.code = 'rental_request_not_found';
          throw error;
        }
        const allowed = TRANSITIONS[current.status] || [];
        if (!allowed.includes(nextStatus)) {
          const error = new Error('invalid-rental-status-transition');
          error.code = 'invalid_rental_status_transition';
          error.previousStatus = current.status;
          error.nextStatus = nextStatus;
          throw error;
        }

        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [current.laptopId]);

        if (BLOCKING.has(nextStatus)) {
          const conflict = await client.query(
            `SELECT request_id, start_date, due_date, status
               FROM app_rental_asset_reservation_guards
              WHERE laptop_id = $1 AND active = TRUE AND request_id <> $2
                AND ($5::boolean = FALSE OR (start_date <= $4::date AND due_date >= $3::date))
              ORDER BY start_date, request_id LIMIT 1`,
            [current.laptopId, requestId, current.startDate, current.dueDate, Boolean(allowNonOverlappingSameAssetRequests)],
          );
          if (conflict.rowCount) {
            const error = new Error('rental-period-conflict');
            error.code = 'rental_period_conflict';
            error.blockingRequest = conflict.rows[0];
            throw error;
          }
        }

        const nextRequest = Object.freeze({
          ...current,
          status: nextStatus,
          ...(returnFields || {}),
        });

        if (typeof beforeCommit === 'function') {
          await beforeCommit({ currentRequest: current, nextRequest, client });
        }

        await client.query(
          `UPDATE app_rental_requests SET
             status = $2,
             returned_at = $3,
             actual_return_date = $4,
             overdue_days_at_return = $5,
             overdue_penalty_pending = $6,
             overdue_penalty_batch_id = $7,
             firestore_mirror_status = 'synced',
             firestore_mirror_error = '',
             firestore_mirrored_at = NOW(),
             source_updated_at = NOW(),
             source_synced_at = NOW(),
             updated_at = NOW()
           WHERE request_id = $1`,
          [
            requestId, nextStatus, nextRequest.returnedAt || null,
            nextRequest.actualReturnDate || '', Number(nextRequest.overdueDaysAtReturn || 0),
            Boolean(nextRequest.overduePenaltyPending), nextRequest.overduePenaltyBatchId || '',
          ],
        );
        await client.query(
          `UPDATE app_rental_asset_reservation_guards SET
             status = $2, active = $3, source_mode = 'postgresql-authoritative-admin',
             synced_at = NOW(), updated_at = NOW()
           WHERE request_id = $1`,
          [requestId, nextStatus, BLOCKING.has(nextStatus)],
        );
        for (const related of Array.isArray(relatedRequestUpdates) ? relatedRequestUpdates : []) {
          const relatedId = String(related?.id || '').trim();
          if (!relatedId || relatedId === requestId) continue;
          const fields = related?.fields || {};
          await client.query(
            `UPDATE app_rental_requests SET
               overdue_penalty_pending = $2,
               overdue_penalty_batch_id = $3,
               source_updated_at = NOW(),
               source_synced_at = NOW(),
               updated_at = NOW()
             WHERE request_id = $1`,
            [relatedId, Boolean(fields.overduePenaltyPending), String(fields.overduePenaltyBatchId || '')],
          );
        }
        await client.query(
          `INSERT INTO app_rental_request_events (
             rental_request_id, event_type, actor_app_user_id, actor_firebase_uid, event_payload
           ) SELECT id, 'admin-status-changed', NULL, $2, $3::jsonb
               FROM app_rental_requests WHERE request_id = $1`,
          [requestId, auditActor.uid, JSON.stringify({
            previousStatus: current.status,
            nextStatus,
            actorAdminId: auditActor.adminId,
            actorName: auditActor.name,
          })],
        );
        await client.query('COMMIT');
        return mapRow((await pool.query(
          `SELECT ${SELECT}
             FROM app_rental_requests request
             LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
            WHERE request.request_id = $1`, [requestId],
        )).rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  });
};
