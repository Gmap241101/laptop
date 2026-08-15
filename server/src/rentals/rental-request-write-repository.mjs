const normalizeText = (value) => String(value ?? '').trim();
const BLOCKING_STATUSES = new Set(['신청중', '대여중', '보류']);

const mapRequest = (row) => row ? Object.freeze({
  internalId: String(row.id),
  id: row.request_id,
  appUserId: String(row.app_user_id),
  requesterUid: row.firebase_uid,
  requesterEmail: row.requester_email,
  requesterName: row.requester_name,
  requesterTeam: row.requester_team,
  team: row.requester_team,
  borrower: row.requester_name,
  laptopId: row.laptop_id || '',
  assetCategory: row.asset_category || '',
  assetNo: row.asset_no || '',
  startDate: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date || ''),
  dueDate: row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : String(row.due_date || ''),
  purpose: row.purpose,
  status: row.status,
  adminMemo: '',
  extensionCount: 0,
  lastExtensionApprovedDate: '',
  nextExtensionRequestDate: '',
  extensionHistory: [],
  userActionRequest: null,
  requestedAt: row.requested_at_text,
  returnedAt: null,
  overduePenaltyPending: false,
  overduePenaltyBatchId: '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  firestoreMirrorStatus: row.firestore_mirror_status,
  firestoreMirroredAt: row.firestore_mirrored_at,
  idempotencyKey: row.idempotency_key,
}) : null;

const SELECT_REQUEST = `
  request.id, request.request_id, request.app_user_id, request.firebase_uid,
  request.requester_email, request.requester_name, request.requester_team,
  request.start_date, request.due_date, request.purpose, request.status,
  request.requested_at_text, request.idempotency_key,
  request.firestore_mirror_status, request.firestore_mirrored_at,
  request.created_at, request.updated_at,
  item.laptop_id, item.asset_category, item.asset_no`;

const repositoryError = (code, message) => {
  const error = new Error(message);
  error.name = 'RentalRequestWriteRepositoryError';
  error.code = code;
  return error;
};

export const createRentalRequestWriteRepository = (pool) => {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool with query()/connect() is required.');
  }

  const findExisting = async (client, { appUserId, requestId, idempotencyKey }) => {
    const result = await client.query(
      `SELECT ${SELECT_REQUEST}
         FROM app_rental_requests request
         LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
        WHERE request.request_id = $1
           OR (request.app_user_id = $2 AND request.idempotency_key = $3)
        ORDER BY CASE WHEN request.request_id = $1 THEN 0 ELSE 1 END
        LIMIT 1`,
      [requestId, appUserId, idempotencyKey],
    );
    return mapRequest(result.rows[0]);
  };

  return Object.freeze({
    async findByAppUserAndIdempotency(appUserId, idempotencyKey) {
      const result = await pool.query(
        `SELECT ${SELECT_REQUEST}
           FROM app_rental_requests request
           LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
          WHERE request.app_user_id = $1 AND request.idempotency_key = $2
          LIMIT 1`,
        [appUserId, idempotencyKey],
      );
      return mapRequest(result.rows[0]);
    },

    async createAuthoritative({
      appUserId,
      firebaseUid,
      requesterEmail,
      requesterName,
      requesterTeam,
      requestId,
      idempotencyKey,
      laptopId,
      assetCategory,
      assetNo,
      startDate,
      dueDate,
      purpose,
      requestedAtText,
      allowNonOverlappingSameAssetRequests = false,
      referenceDate,
      overdueRentalBlockEnabled = false,
      postOverduePenaltyEnabled = false,
    }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [laptopId]);

        const existing = await findExisting(client, { appUserId, requestId, idempotencyKey });
        if (existing) {
          if (existing.appUserId !== String(appUserId)) {
            throw repositoryError('rental_request_id_conflict', 'Rental request ID belongs to a different application user.');
          }
          await client.query('COMMIT');
          return Object.freeze({ request: existing, reused: true });
        }

        const restrictionResult = await client.query(
          `SELECT restriction_exists, restriction_payload
             FROM app_rental_restrictions
            WHERE app_user_id = $1
            FOR UPDATE`,
          [appUserId],
        );
        const restriction = restrictionResult.rows[0]?.restriction_exists
          ? (restrictionResult.rows[0]?.restriction_payload || {})
          : null;

        const overdueResult = await client.query(
          `SELECT COUNT(*)::bigint AS overdue_count
             FROM app_rental_requests
            WHERE app_user_id = $1
              AND status = '대여중'
              AND due_date < $2::date`,
          [appUserId, referenceDate],
        );
        const overdueCount = Number(overdueResult.rows[0]?.overdue_count || 0);
        const eligibleFromDate = normalizeText(restriction?.eligibleFromDate);
        if (overdueRentalBlockEnabled && overdueCount > 0) {
          throw repositoryError('rental_request_current_overdue_blocked', 'Current overdue rental blocks new rental requests.');
        }
        if (postOverduePenaltyEnabled && restriction?.activePenalty && eligibleFromDate && referenceDate < eligibleFromDate) {
          throw repositoryError('rental_request_penalty_blocked', 'Post-overdue penalty blocks new rental requests.');
        }

        const conflictQuery = allowNonOverlappingSameAssetRequests
          ? `SELECT request_id, start_date, due_date, status
               FROM app_rental_asset_reservation_guards
              WHERE laptop_id = $1 AND active = TRUE
                AND start_date <= $3::date AND due_date >= $2::date
              LIMIT 1`
          : `SELECT request_id, start_date, due_date, status
               FROM app_rental_asset_reservation_guards
              WHERE laptop_id = $1 AND active = TRUE
              LIMIT 1`;
        const conflictParams = allowNonOverlappingSameAssetRequests
          ? [laptopId, startDate, dueDate]
          : [laptopId];
        const conflictResult = await client.query(conflictQuery, conflictParams);
        if (conflictResult.rows[0]) {
          const conflict = repositoryError('rental_request_asset_conflict', 'Selected rental asset is already reserved.');
          conflict.blockingRequest = {
            id: conflictResult.rows[0].request_id,
            startDate: String(conflictResult.rows[0].start_date || '').slice(0, 10),
            dueDate: String(conflictResult.rows[0].due_date || '').slice(0, 10),
            status: conflictResult.rows[0].status,
          };
          throw conflict;
        }

        const requestResult = await client.query(
          `INSERT INTO app_rental_requests (
             request_id, app_user_id, firebase_uid, requester_email, requester_name,
             requester_team, start_date, due_date, purpose, status, requested_at_text,
             source_mode, idempotency_key, firestore_mirror_status
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,'신청중',$10,
             'postgresql-authoritative',$11,'retired'
           )
           RETURNING id`,
          [requestId, appUserId, firebaseUid, requesterEmail, requesterName, requesterTeam, startDate, dueDate, purpose, requestedAtText, idempotencyKey],
        );
        const internalId = requestResult.rows[0]?.id;
        if (!internalId) throw repositoryError('rental_request_insert_failed', 'PostgreSQL did not return a rental request ID.');

        await client.query(
          `INSERT INTO app_rental_request_items (
             rental_request_id, line_number, laptop_id, asset_category, asset_no
           ) VALUES ($1,1,$2,$3,$4)`,
          [internalId, laptopId, assetCategory, assetNo],
        );
        await client.query(
          `INSERT INTO app_rental_asset_reservation_guards (
             request_id, rental_request_id, laptop_id, start_date, due_date,
             status, active, source_mode, synced_at
           ) VALUES ($1,$2,$3,$4::date,$5::date,'신청중',TRUE,'postgresql-authoritative',NOW())
           ON CONFLICT (request_id) DO UPDATE SET
             rental_request_id = EXCLUDED.rental_request_id,
             laptop_id = EXCLUDED.laptop_id,
             start_date = EXCLUDED.start_date,
             due_date = EXCLUDED.due_date,
             status = EXCLUDED.status,
             active = TRUE,
             source_mode = 'postgresql-authoritative',
             synced_at = NOW(),
             updated_at = NOW()`,
          [requestId, internalId, laptopId, startDate, dueDate],
        );
        await client.query(
          `INSERT INTO app_rental_request_events (
             rental_request_id, event_type, actor_app_user_id, actor_firebase_uid, event_payload
           ) VALUES ($1,'request-created',$2,$3,$4::jsonb)`,
          [internalId, appUserId, firebaseUid, JSON.stringify({ requestId, laptopId, startDate, dueDate, source: 'phase16-postgresql' })],
        );

        const preparedResult = await client.query(
          `SELECT ${SELECT_REQUEST}
             FROM app_rental_requests request
             LEFT JOIN app_rental_request_items item ON item.rental_request_id = request.id
            WHERE request.id = $1`,
          [internalId],
        );
        const preparedRequest = Object.freeze({
          ...mapRequest(preparedResult.rows[0]),
          firestoreMirrorStatus: 'retired',
          firestoreMirroredAt: null,
        });

        await client.query('COMMIT');
        return Object.freeze({ request: preparedRequest, reused: false });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  });
};
