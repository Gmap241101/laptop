const normalizeJson = (value, fallback) => {
  if (value == null) return fallback;
  return value;
};

const mapRow = (row) => {
  if (!row) return null;
  return Object.freeze({
    shadowId: String(row.shadow_id),
    appUserId: String(row.app_user_id),
    id: row.source_request_id,
    requesterUid: row.requester_uid,
    requesterEmail: row.requester_email,
    requesterName: row.requester_name,
    requesterTeam: row.requester_team,
    team: row.team,
    borrower: row.borrower,
    laptopId: row.laptop_id || '',
    assetCategory: row.asset_category || '',
    assetNo: row.asset_no || '',
    startDate: row.start_date,
    dueDate: row.due_date,
    purpose: row.purpose,
    status: row.status,
    adminMemo: row.admin_memo,
    extensionCount: Number(row.extension_count || 0),
    lastExtensionApprovedDate: row.last_extension_approved_date,
    nextExtensionRequestDate: row.next_extension_request_date,
    extensionHistory: Array.isArray(row.extension_history) ? row.extension_history : [],
    userActionRequest: normalizeJson(row.user_action_request, null),
    requestedAt: row.requested_at_text,
    returnedAt: row.returned_at,
    overduePenaltyPending: Boolean(row.overdue_penalty_pending),
    overduePenaltyBatchId: row.overdue_penalty_batch_id,
    syncedAt: row.source_synced_at,
    createdAt: row.source_created_at,
    updatedAt: row.source_updated_at,
    sourceDocumentPath: row.source_document_path,
    sourceHash: row.source_hash,
    shadowSyncedAt: row.shadow_synced_at,
  });
};

const SELECT_COLUMNS = `
  request_shadow.id AS shadow_id,
  request_shadow.app_user_id,
  request_shadow.source_request_id,
  request_shadow.requester_uid,
  request_shadow.requester_email,
  request_shadow.requester_name,
  request_shadow.requester_team,
  request_shadow.team,
  request_shadow.borrower,
  request_item.laptop_id,
  request_item.asset_category,
  request_item.asset_no,
  request_shadow.start_date,
  request_shadow.due_date,
  request_shadow.purpose,
  request_shadow.status,
  request_shadow.admin_memo,
  request_shadow.extension_count,
  request_shadow.last_extension_approved_date,
  request_shadow.next_extension_request_date,
  request_shadow.extension_history,
  request_shadow.user_action_request,
  request_shadow.requested_at_text,
  request_shadow.returned_at,
  request_shadow.overdue_penalty_pending,
  request_shadow.overdue_penalty_batch_id,
  request_shadow.source_synced_at,
  request_shadow.source_document_path,
  request_shadow.source_created_at,
  request_shadow.source_updated_at,
  request_shadow.source_hash,
  request_shadow.synced_at AS shadow_synced_at`;

const mapSync = (row) => {
  if (!row) return null;
  return Object.freeze({
    appUserId: String(row.app_user_id),
    firebaseUid: row.firebase_uid,
    sourceRequestCount: Number(row.source_request_count || 0),
    sourceHash: row.source_hash,
    syncedAt: row.synced_at,
  });
};

export const createRentalRequestRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with query()/connect() is required.');
  }

  return Object.freeze({
    async getSyncState(appUserId) {
      const result = await pool.query(
        `SELECT app_user_id, firebase_uid, source_request_count, source_hash, synced_at
           FROM app_user_rental_request_shadow_syncs
          WHERE app_user_id = $1`,
        [appUserId],
      );
      return mapSync(result.rows[0]);
    },

    async listByAppUserId(appUserId) {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM app_user_rental_request_shadows request_shadow
           LEFT JOIN app_user_rental_request_item_shadows request_item
             ON request_item.rental_request_shadow_id = request_shadow.id
          WHERE request_shadow.app_user_id = $1
          ORDER BY request_shadow.source_created_at DESC NULLS LAST,
                   request_shadow.source_request_id DESC`,
        [appUserId],
      );
      return result.rows.map(mapRow);
    },

    async replaceForAppUser({ appUserId, firebaseUid, requests, sourceHash }) {
      const client = await pool.connect();
      const sourceIds = [];
      try {
        await client.query('BEGIN');

        for (const request of requests) {
          sourceIds.push(request.id);
          const result = await client.query(
            `INSERT INTO app_user_rental_request_shadows (
               app_user_id, source_request_id, requester_uid, requester_email,
               requester_name, requester_team, team, borrower, start_date, due_date,
               purpose, status, admin_memo, extension_count,
               last_extension_approved_date, next_extension_request_date,
               extension_history, user_action_request, requested_at_text, returned_at,
               overdue_penalty_pending, overdue_penalty_batch_id, source_synced_at,
               source_document_path, source_created_at, source_updated_at, source_hash, synced_at
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17::jsonb,$18::jsonb,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW()
             )
             ON CONFLICT (source_request_id) DO UPDATE SET
               requester_uid = EXCLUDED.requester_uid,
               requester_email = EXCLUDED.requester_email,
               requester_name = EXCLUDED.requester_name,
               requester_team = EXCLUDED.requester_team,
               team = EXCLUDED.team,
               borrower = EXCLUDED.borrower,
               start_date = EXCLUDED.start_date,
               due_date = EXCLUDED.due_date,
               purpose = EXCLUDED.purpose,
               status = EXCLUDED.status,
               admin_memo = EXCLUDED.admin_memo,
               extension_count = EXCLUDED.extension_count,
               last_extension_approved_date = EXCLUDED.last_extension_approved_date,
               next_extension_request_date = EXCLUDED.next_extension_request_date,
               extension_history = EXCLUDED.extension_history,
               user_action_request = EXCLUDED.user_action_request,
               requested_at_text = EXCLUDED.requested_at_text,
               returned_at = EXCLUDED.returned_at,
               overdue_penalty_pending = EXCLUDED.overdue_penalty_pending,
               overdue_penalty_batch_id = EXCLUDED.overdue_penalty_batch_id,
               source_synced_at = EXCLUDED.source_synced_at,
               source_document_path = EXCLUDED.source_document_path,
               source_created_at = EXCLUDED.source_created_at,
               source_updated_at = EXCLUDED.source_updated_at,
               source_hash = EXCLUDED.source_hash,
               synced_at = NOW(),
               updated_at = NOW()
             WHERE app_user_rental_request_shadows.app_user_id = EXCLUDED.app_user_id
             RETURNING id`,
            [
              appUserId, request.id, request.requesterUid, request.requesterEmail,
              request.requesterName, request.requesterTeam, request.team, request.borrower,
              request.startDate, request.dueDate, request.purpose, request.status,
              request.adminMemo, request.extensionCount, request.lastExtensionApprovedDate,
              request.nextExtensionRequestDate, JSON.stringify(request.extensionHistory || []),
              request.userActionRequest == null ? null : JSON.stringify(request.userActionRequest),
              request.requestedAt, request.returnedAt, request.overduePenaltyPending,
              request.overduePenaltyBatchId, request.syncedAt, request.sourceDocumentPath,
              request.createdAt, request.updatedAt, request.sourceHash,
            ],
          );

          const shadowId = result.rows[0]?.id;
          if (!shadowId) {
            const error = new Error('Rental request shadow belongs to a different application user.');
            error.code = 'rental_request_shadow_owner_conflict';
            throw error;
          }

          await client.query(
            `INSERT INTO app_user_rental_request_item_shadows (
               rental_request_shadow_id, line_number, laptop_id, asset_category, asset_no
             ) VALUES ($1, 1, $2, $3, $4)
             ON CONFLICT (rental_request_shadow_id) DO UPDATE SET
               laptop_id = EXCLUDED.laptop_id,
               asset_category = EXCLUDED.asset_category,
               asset_no = EXCLUDED.asset_no,
               updated_at = NOW()`,
            [shadowId, request.laptopId, request.assetCategory, request.assetNo],
          );

          const canonicalResult = await client.query(
            `INSERT INTO app_rental_requests (
               request_id, app_user_id, firebase_uid, requester_email, requester_name,
               requester_team, start_date, due_date, purpose, status, requested_at_text,
               source_mode, idempotency_key, firestore_mirror_status, admin_memo,
               extension_count, last_extension_approved_date, next_extension_request_date,
               extension_history, user_action_request, returned_at, overdue_penalty_pending,
               overdue_penalty_batch_id, source_created_at, source_updated_at, source_synced_at,
               created_at, updated_at
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,
               'firestore-user-sync','legacy:' || $1,'legacy-source',$12,$13,$14,$15,
               $16::jsonb,$17::jsonb,$18,$19,$20,$21,$22,$23,
               COALESCE($21,NOW()),COALESCE($22,NOW())
             )
             ON CONFLICT (request_id) DO UPDATE SET
               app_user_id = COALESCE(app_rental_requests.app_user_id, EXCLUDED.app_user_id),
               firebase_uid = EXCLUDED.firebase_uid, requester_email = EXCLUDED.requester_email,
               requester_name = EXCLUDED.requester_name, requester_team = EXCLUDED.requester_team,
               start_date = EXCLUDED.start_date, due_date = EXCLUDED.due_date, purpose = EXCLUDED.purpose,
               status = EXCLUDED.status, requested_at_text = EXCLUDED.requested_at_text,
               admin_memo = EXCLUDED.admin_memo, extension_count = EXCLUDED.extension_count,
               last_extension_approved_date = EXCLUDED.last_extension_approved_date,
               next_extension_request_date = EXCLUDED.next_extension_request_date,
               extension_history = EXCLUDED.extension_history, user_action_request = EXCLUDED.user_action_request,
               returned_at = EXCLUDED.returned_at, overdue_penalty_pending = EXCLUDED.overdue_penalty_pending,
               overdue_penalty_batch_id = EXCLUDED.overdue_penalty_batch_id, source_created_at = EXCLUDED.source_created_at,
               source_updated_at = EXCLUDED.source_updated_at, source_synced_at = EXCLUDED.source_synced_at,
               firestore_mirror_status = 'legacy-source', updated_at = NOW()
             RETURNING id`,
            [
              request.id, appUserId, request.requesterUid, request.requesterEmail, request.requesterName,
              request.requesterTeam, request.startDate, request.dueDate, request.purpose, request.status,
              request.requestedAt, request.adminMemo, request.extensionCount, request.lastExtensionApprovedDate,
              request.nextExtensionRequestDate, JSON.stringify(request.extensionHistory || []),
              request.userActionRequest == null ? null : JSON.stringify(request.userActionRequest),
              request.returnedAt, request.overduePenaltyPending, request.overduePenaltyBatchId,
              request.createdAt, request.updatedAt, request.syncedAt,
            ],
          );

          const canonicalId = canonicalResult.rows[0]?.id;
          if (canonicalId && request.laptopId) {
            await client.query(
              `INSERT INTO app_rental_request_items (rental_request_id, line_number, laptop_id, asset_category, asset_no)
               VALUES ($1,1,$2,$3,$4)
               ON CONFLICT (rental_request_id) DO UPDATE SET
                 laptop_id = EXCLUDED.laptop_id, asset_category = EXCLUDED.asset_category,
                 asset_no = EXCLUDED.asset_no, updated_at = NOW()`,
              [canonicalId, request.laptopId, request.assetCategory, request.assetNo],
            );
            await client.query(
              `INSERT INTO app_rental_asset_reservation_guards (
                 request_id, rental_request_id, laptop_id, start_date, due_date, status, active, source_mode, synced_at
               ) VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,'firestore-user-sync',NOW())
               ON CONFLICT (request_id) DO UPDATE SET
                 rental_request_id = EXCLUDED.rental_request_id, laptop_id = EXCLUDED.laptop_id,
                 start_date = EXCLUDED.start_date, due_date = EXCLUDED.due_date, status = EXCLUDED.status,
                 active = EXCLUDED.active, source_mode = EXCLUDED.source_mode, synced_at = NOW(), updated_at = NOW()`,
              [request.id, canonicalId, request.laptopId, request.startDate, request.dueDate, request.status,
               ['신청중','대여중','보류'].includes(request.status)],
            );
          }
        }

        if (sourceIds.length > 0) {
          await client.query(
            `DELETE FROM app_user_rental_request_shadows
              WHERE app_user_id = $1
                AND NOT (source_request_id = ANY($2::text[]))`,
            [appUserId, sourceIds],
          );
        } else {
          await client.query(
            'DELETE FROM app_user_rental_request_shadows WHERE app_user_id = $1',
            [appUserId],
          );
        }

        const syncResult = await client.query(
          `INSERT INTO app_user_rental_request_shadow_syncs (
             app_user_id, firebase_uid, source_request_count, source_hash, synced_at
           ) VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (app_user_id) DO UPDATE SET
             firebase_uid = EXCLUDED.firebase_uid,
             source_request_count = EXCLUDED.source_request_count,
             source_hash = EXCLUDED.source_hash,
             synced_at = NOW(),
             updated_at = NOW()
           RETURNING app_user_id, firebase_uid, source_request_count, source_hash, synced_at`,
          [appUserId, firebaseUid, requests.length, sourceHash],
        );

        await client.query('COMMIT');
        return mapSync(syncResult.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  });
};
