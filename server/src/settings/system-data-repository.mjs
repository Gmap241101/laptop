const trim = (value) => String(value ?? '').trim();

const count = (row, key) => Number(row?.[key] || 0);

const RESET_SCOPES = new Set(['assets', 'members', 'rentals', 'organization', 'content', 'settings']);
const normalizeScopes = (scopes) => [...new Set((Array.isArray(scopes) ? scopes : []).map((value) => trim(value).toLowerCase()).filter((value) => RESET_SCOPES.has(value)))];

const mapIssue = (row, code, level, message) => ({
  code,
  level,
  message,
  requestId: trim(row?.request_id),
  laptopId: trim(row?.laptop_id),
  assetNo: trim(row?.asset_no),
  matchedAssetId: trim(row?.matched_asset_id),
});

export const createSystemDataRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with query()/connect() is required.');
  }

  const readIntegrity = async (queryable = pool) => {
    const [countsResult, missingAssetResult, reservationResult, mismatchResult, syncResult] = await Promise.all([
      queryable.query(`
        SELECT
          (SELECT COUNT(*) FROM app_rental_assets)::int AS assets,
          (SELECT COUNT(*) FROM app_asset_categories)::int AS asset_categories,
          (SELECT COUNT(*) FROM app_rental_requests)::int AS rental_requests,
          (SELECT COUNT(*) FROM app_rental_request_items)::int AS rental_request_items,
          (SELECT COUNT(*) FROM app_rental_asset_reservation_guards WHERE active=TRUE)::int AS active_reservations,
          (SELECT COUNT(*) FROM app_member_accounts)::int AS members,
          (SELECT COUNT(*) FROM app_admin_identity_registry WHERE retired_at IS NULL)::int AS admins,
          (SELECT COUNT(*) FROM app_board_posts)::int AS board_posts,
          (SELECT COUNT(*) FROM app_site_content_documents)::int AS site_content_documents,
          (SELECT COUNT(*) FROM app_system_configuration)::int AS system_configurations
      `),
      queryable.query(`
        SELECT request.request_id, item.laptop_id, item.asset_no,
               matched.asset_id AS matched_asset_id
          FROM app_rental_request_items item
          JOIN app_rental_requests request ON request.id=item.rental_request_id
          LEFT JOIN app_rental_assets direct_asset ON direct_asset.asset_id=item.laptop_id
          LEFT JOIN app_rental_assets matched
            ON matched.asset_no_normalized=lower(trim(item.asset_no))
         WHERE direct_asset.asset_id IS NULL
         ORDER BY request.created_at DESC, request.request_id
         LIMIT 200
      `),
      queryable.query(`
        SELECT guard.request_id, guard.laptop_id, item.asset_no,
               matched.asset_id AS matched_asset_id
          FROM app_rental_asset_reservation_guards guard
          LEFT JOIN app_rental_assets direct_asset ON direct_asset.asset_id=guard.laptop_id
          LEFT JOIN app_rental_request_items item ON item.rental_request_id=guard.rental_request_id
          LEFT JOIN app_rental_assets matched
            ON matched.asset_no_normalized=lower(trim(item.asset_no))
         WHERE direct_asset.asset_id IS NULL
         ORDER BY guard.active DESC, guard.start_date DESC, guard.request_id
         LIMIT 200
      `),
      queryable.query(`
        SELECT request.request_id, item.laptop_id AS item_laptop_id, guard.laptop_id AS guard_laptop_id
          FROM app_rental_requests request
          JOIN app_rental_request_items item ON item.rental_request_id=request.id
          JOIN app_rental_asset_reservation_guards guard ON guard.rental_request_id=request.id
         WHERE item.laptop_id<>guard.laptop_id
         ORDER BY request.created_at DESC, request.request_id
         LIMIT 200
      `),
      queryable.query(`
        SELECT source_asset_count, source_category_count, source_mode, synced_at
          FROM app_asset_catalog_syncs
         WHERE scope='main'
         LIMIT 1
      `),
    ]);

    const countsRow = countsResult.rows[0] || {};
    const missingAssetRows = missingAssetResult.rows || [];
    const missingReservationRows = reservationResult.rows || [];
    const mismatchedRows = mismatchResult.rows || [];
    const recoverableAssetRows = missingAssetRows.filter((row) => trim(row.matched_asset_id));
    const unrecoverableAssetRows = missingAssetRows.filter((row) => !trim(row.matched_asset_id));
    const recoverableReservationRows = missingReservationRows.filter((row) => trim(row.matched_asset_id));
    const unrecoverableReservationRows = missingReservationRows.filter((row) => !trim(row.matched_asset_id));
    const syncRow = syncResult.rows[0] || null;
    const currentAssetCount = count(countsRow, 'assets');
    const currentCategoryCount = count(countsRow, 'asset_categories');
    const syncAssetCount = syncRow ? Number(syncRow.source_asset_count || 0) : null;
    const syncCategoryCount = syncRow ? Number(syncRow.source_category_count || 0) : null;
    const syncMismatch = !syncRow || syncAssetCount !== currentAssetCount || syncCategoryCount !== currentCategoryCount;

    const issues = [];
    for (const row of recoverableAssetRows.slice(0, 50)) {
      issues.push(mapIssue(
        row,
        'rental_request_asset_reference_recoverable',
        'warning',
        `신청 ${trim(row.request_id)}의 자산 ID ${trim(row.laptop_id)}는 현재 자산에 없지만 자산관리번호 ${trim(row.asset_no)}로 ${trim(row.matched_asset_id)}에 연결할 수 있습니다.`,
      ));
    }
    for (const row of unrecoverableAssetRows.slice(0, 50)) {
      issues.push(mapIssue(
        row,
        'rental_request_asset_reference_missing',
        'error',
        `신청 ${trim(row.request_id)}이 등록되지 않은 자산 ID ${trim(row.laptop_id)}를 참조하며 자산관리번호 ${trim(row.asset_no) || '-'}로도 복구할 수 없습니다.`,
      ));
    }
    for (const row of unrecoverableReservationRows.slice(0, 25)) {
      issues.push(mapIssue(
        row,
        'reservation_asset_reference_missing',
        'error',
        `예약 ${trim(row.request_id)}이 등록되지 않은 자산 ID ${trim(row.laptop_id)}를 참조합니다.`,
      ));
    }
    for (const row of mismatchedRows.slice(0, 25)) {
      issues.push({
        code: 'request_reservation_asset_mismatch',
        level: 'error',
        message: `신청 ${trim(row.request_id)}의 신청 자산(${trim(row.item_laptop_id)})과 예약 자산(${trim(row.guard_laptop_id)})이 다릅니다.`,
        requestId: trim(row.request_id),
      });
    }
    if (syncMismatch) {
      issues.push({
        code: 'asset_catalog_metadata_mismatch',
        level: 'warning',
        message: syncRow
          ? `자산 카탈로그 메타데이터가 실제 PostgreSQL 데이터와 다릅니다. 메타데이터 ${syncAssetCount}/${syncCategoryCount}, 실제 ${currentAssetCount}/${currentCategoryCount}.`
          : '자산 카탈로그 동기화 메타데이터가 없습니다.',
      });
    }

    const errors = unrecoverableAssetRows.length + unrecoverableReservationRows.length + mismatchedRows.length;
    const warnings = recoverableAssetRows.length + recoverableReservationRows.length + (syncMismatch ? 1 : 0);

    return Object.freeze({
      authority: 'postgresql',
      checkedAt: new Date().toISOString(),
      counts: Object.freeze({
        assets: currentAssetCount,
        assetCategories: currentCategoryCount,
        rentalRequests: count(countsRow, 'rental_requests'),
        rentalRequestItems: count(countsRow, 'rental_request_items'),
        activeReservations: count(countsRow, 'active_reservations'),
        members: count(countsRow, 'members'),
        admins: count(countsRow, 'admins'),
        boardPosts: count(countsRow, 'board_posts'),
        siteContentDocuments: count(countsRow, 'site_content_documents'),
        systemConfigurations: count(countsRow, 'system_configurations'),
      }),
      assetReference: Object.freeze({
        missingRequestCount: missingAssetRows.length,
        recoverableRequestCount: recoverableAssetRows.length,
        unrecoverableRequestCount: unrecoverableAssetRows.length,
        missingReservationCount: missingReservationRows.length,
        recoverableReservationCount: recoverableReservationRows.length,
        unrecoverableReservationCount: unrecoverableReservationRows.length,
        requestReservationMismatchCount: mismatchedRows.length,
      }),
      assetCatalog: Object.freeze({
        metadataPresent: Boolean(syncRow),
        metadataAssetCount: syncAssetCount,
        metadataCategoryCount: syncCategoryCount,
        actualAssetCount: currentAssetCount,
        actualCategoryCount: currentCategoryCount,
        metadataMatches: !syncMismatch,
        sourceMode: trim(syncRow?.source_mode),
        syncedAt: syncRow?.synced_at || null,
      }),
      errors,
      warnings,
      issues: Object.freeze(issues),
    });
  };

  return Object.freeze({
    async getOverview() {
      const [integrity, databaseResult, migrationResult] = await Promise.all([
        readIntegrity(pool),
        pool.query(`SELECT current_database() AS database_name, pg_database_size(current_database())::bigint AS database_bytes, NOW() AS database_time`),
        pool.query(`SELECT name, applied_at FROM schema_migrations ORDER BY name DESC LIMIT 1`),
      ]);
      const database = databaseResult.rows[0] || {};
      const migration = migrationResult.rows[0] || null;
      return Object.freeze({
        authority: 'postgresql',
        generatedAt: new Date().toISOString(),
        database: Object.freeze({
          name: trim(database.database_name),
          bytes: Number(database.database_bytes || 0),
          time: database.database_time || null,
          latestMigration: trim(migration?.name),
          latestMigrationAppliedAt: migration?.applied_at || null,
        }),
        integrity,
      });
    },

    async checkIntegrity() {
      return readIntegrity(pool);
    },

    async repairAssetReferences({ actorClerkUserId = '' } = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('phase34-asset-reference-repair'))");
        const before = await readIntegrity(client);
        const recoverableResult = await client.query(`
          SELECT request.id AS rental_request_id, request.request_id,
                 item.laptop_id AS previous_laptop_id, matched.asset_id AS next_laptop_id
            FROM app_rental_request_items item
            JOIN app_rental_requests request ON request.id=item.rental_request_id
            LEFT JOIN app_rental_assets direct_asset ON direct_asset.asset_id=item.laptop_id
            JOIN app_rental_assets matched ON matched.asset_no_normalized=lower(trim(item.asset_no))
           WHERE direct_asset.asset_id IS NULL
           FOR UPDATE OF item
        `);
        const mappings = recoverableResult.rows || [];
        for (const row of mappings) {
          await client.query(
            `UPDATE app_rental_request_items
                SET laptop_id=$2, updated_at=NOW()
              WHERE rental_request_id=$1`,
            [row.rental_request_id, row.next_laptop_id],
          );
          await client.query(
            `UPDATE app_rental_asset_reservation_guards
                SET laptop_id=$2, source_mode='postgresql-reference-repaired', synced_at=NOW(), updated_at=NOW()
              WHERE rental_request_id=$1`,
            [row.rental_request_id, row.next_laptop_id],
          );
        }
        const actualCounts = await client.query(`
          SELECT (SELECT COUNT(*) FROM app_rental_assets)::int AS assets,
                 (SELECT COUNT(*) FROM app_asset_categories)::int AS categories
        `);
        await client.query(`
          INSERT INTO app_asset_catalog_syncs (
            scope, source_asset_count, source_category_count, source_hash, source_mode, synced_at, updated_at
          ) VALUES ('main',$1,$2,'postgresql-authoritative','postgresql-authoritative',NOW(),NOW())
          ON CONFLICT (scope) DO UPDATE SET
            source_asset_count=EXCLUDED.source_asset_count,
            source_category_count=EXCLUDED.source_category_count,
            source_hash=EXCLUDED.source_hash,
            source_mode=EXCLUDED.source_mode,
            synced_at=NOW(), updated_at=NOW()
        `, [Number(actualCounts.rows[0]?.assets || 0), Number(actualCounts.rows[0]?.categories || 0)]);
        await client.query(`
          INSERT INTO app_runtime_metadata (key, value, updated_at)
          VALUES ('phase34_asset_reference_repair', $1::jsonb, NOW())
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
        `, [JSON.stringify({
          actorClerkUserId: trim(actorClerkUserId),
          repairedRequestCount: mappings.length,
          repairedAt: new Date().toISOString(),
        })]);
        const after = await readIntegrity(client);
        await client.query('COMMIT');
        return Object.freeze({
          authority: 'postgresql',
          repairedRequestCount: mappings.length,
          mappings: Object.freeze(mappings.slice(0, 100).map((row) => Object.freeze({
            requestId: trim(row.request_id),
            previousLaptopId: trim(row.previous_laptop_id),
            nextLaptopId: trim(row.next_laptop_id),
          }))),
          before,
          after,
          repairedAt: new Date().toISOString(),
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async getResetCounts(scopes = []) {
      const selected = normalizeScopes(scopes);
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM app_rental_assets)::int AS assets,
          (SELECT COUNT(*) FROM app_asset_categories)::int AS asset_categories,
          (SELECT COUNT(*) FROM app_member_accounts)::int AS member_accounts,
          (SELECT COUNT(*) FROM app_user_member_shadows)::int AS member_shadows,
          (SELECT COUNT(*) FROM app_user_term_consent_states)::int AS term_states,
          (SELECT COUNT(*) FROM app_user_term_consent_logs)::int AS term_logs,
          (SELECT COUNT(*) FROM app_rental_requests)::int AS rental_requests,
          (SELECT COUNT(*) FROM app_rental_asset_reservation_guards)::int AS reservation_guards,
          (SELECT COUNT(*) FROM app_user_rental_request_shadows)::int AS rental_shadows,
          (SELECT COUNT(*) FROM app_user_rental_restriction_shadows)::int AS restrictions,
          (SELECT COUNT(*) FROM app_member_directory_entries)::int AS directory_entries,
          (SELECT COUNT(*) FROM app_board_posts)::int AS board_posts,
          (SELECT COUNT(*) FROM app_faq_categories)::int AS faq_categories,
          (SELECT COUNT(*) FROM app_site_content_documents WHERE domain IN ('home','popup','footer','terms'))::int AS content_documents,
          (SELECT COUNT(*) FROM app_site_content_documents WHERE domain IN ('site-settings','rental-config'))::int AS setting_documents,
          (SELECT COUNT(*) FROM app_system_configuration)::int AS system_configurations
      `);
      const row = result.rows[0] || {};
      const details = {
        assets: { assets: count(row, 'assets'), assetCategories: count(row, 'asset_categories') },
        members: { memberAccounts: count(row, 'member_accounts'), memberShadows: count(row, 'member_shadows'), termStates: count(row, 'term_states'), termLogs: count(row, 'term_logs') },
        rentals: { rentalRequests: count(row, 'rental_requests'), reservationGuards: count(row, 'reservation_guards'), rentalShadows: count(row, 'rental_shadows'), restrictions: count(row, 'restrictions') },
        organization: { directoryEntries: count(row, 'directory_entries') },
        content: { boardPosts: count(row, 'board_posts'), faqCategories: count(row, 'faq_categories'), siteContentDocuments: count(row, 'content_documents') },
        settings: { siteSettingDocuments: count(row, 'setting_documents'), systemConfigurations: count(row, 'system_configurations') },
      };
      const totals = Object.fromEntries(Object.entries(details).map(([scope, values]) => [scope, Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0)]));
      return Object.freeze({ authority: 'postgresql', scopes: selected, counts: Object.freeze(totals), details: Object.freeze(details), scannedAt: new Date().toISOString() });
    },

    async resetScopes({ scopes = [], actorClerkUserId = '' } = {}) {
      const selected = normalizeScopes(scopes);
      const before = await this.getResetCounts(selected);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('phase34-system-data-reset'))");
        if (selected.includes('rentals')) {
          await client.query('DELETE FROM app_rental_asset_reservation_guards');
          await client.query('DELETE FROM app_rental_requests');
          await client.query('DELETE FROM app_user_rental_request_shadows');
          await client.query('DELETE FROM app_user_rental_request_shadow_syncs');
          await client.query('DELETE FROM app_user_rental_restriction_shadows');
        }
        if (selected.includes('assets')) {
          await client.query('DELETE FROM app_rental_assets');
          await client.query('DELETE FROM app_asset_categories');
          await client.query('DELETE FROM app_asset_catalog_syncs');
          await client.query(`INSERT INTO app_asset_catalog_syncs (scope, source_asset_count, source_category_count, source_hash, source_mode, synced_at, updated_at) VALUES ('main',0,0,'postgresql-reset','postgresql-reset',NOW(),NOW()) ON CONFLICT (scope) DO UPDATE SET source_asset_count=0, source_category_count=0, source_hash='postgresql-reset', source_mode='postgresql-reset', synced_at=NOW(), updated_at=NOW()`);
        }
        if (selected.includes('members')) {
          await client.query('DELETE FROM app_user_term_consent_logs');
          await client.query('DELETE FROM app_user_term_consent_states');
          await client.query('DELETE FROM app_member_profile_events');
          await client.query('DELETE FROM app_user_member_shadows');
          await client.query('DELETE FROM app_member_accounts');
        }
        if (selected.includes('organization')) {
          await client.query('DELETE FROM app_member_directory_entries');
        }
        if (selected.includes('content')) {
          await client.query('DELETE FROM app_board_posts');
          await client.query('DELETE FROM app_faq_categories');
          await client.query('DELETE FROM app_board_syncs');
          await client.query("DELETE FROM app_site_content_documents WHERE domain IN ('home','popup','footer','terms')");
          await client.query("DELETE FROM app_site_content_syncs WHERE domain IN ('home','popup','footer','terms')");
          await client.query(`INSERT INTO app_site_content_documents (domain, document_key, payload, enabled, sort_order, source_mode, synced_at, updated_at) VALUES ('terms','signupTermsPolicy/current','{"enabled":false,"requireReconsentOnChange":true,"applyToExistingMembers":false,"revision":0,"requiredRevision":0,"initialRevision":0,"activeTerms":[]}'::jsonb,false,NULL,'postgresql-reset',NOW(),NOW())`);
          await client.query(`INSERT INTO app_site_content_syncs (domain, source_hash, document_count, source_mode, last_actor_clerk_user_id, synced_at, updated_at) VALUES ('terms','postgresql-reset',1,'postgresql-reset',$1,NOW(),NOW()) ON CONFLICT (domain) DO UPDATE SET source_hash='postgresql-reset', document_count=1, source_mode='postgresql-reset', last_actor_clerk_user_id=EXCLUDED.last_actor_clerk_user_id, synced_at=NOW(), updated_at=NOW()`, [trim(actorClerkUserId)]);
        }
        if (selected.includes('settings')) {
          await client.query("DELETE FROM app_site_content_documents WHERE domain IN ('site-settings','rental-config')");
          await client.query("DELETE FROM app_site_content_syncs WHERE domain IN ('site-settings','rental-config')");
          await client.query(`INSERT INTO app_site_content_documents (domain, document_key, payload, enabled, sort_order, source_mode, synced_at, updated_at) VALUES ('site-settings','siteSettings/config','{}'::jsonb,true,NULL,'postgresql-reset',NOW(),NOW())`);
          await client.query(`INSERT INTO app_site_content_syncs (domain, source_hash, document_count, source_mode, last_actor_clerk_user_id, synced_at, updated_at) VALUES ('site-settings','postgresql-reset',1,'postgresql-reset',$1,NOW(),NOW()) ON CONFLICT (domain) DO UPDATE SET source_hash='postgresql-reset', document_count=1, source_mode='postgresql-reset', last_actor_clerk_user_id=EXCLUDED.last_actor_clerk_user_id, synced_at=NOW(), updated_at=NOW()`, [trim(actorClerkUserId)]);
          await client.query('DELETE FROM app_system_configuration');
        }
        await client.query(`INSERT INTO app_runtime_metadata (key, value, updated_at) VALUES ('phase34_last_system_data_reset',$1::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`, [JSON.stringify({ actorClerkUserId: trim(actorClerkUserId), scopes: selected, resetAt: new Date().toISOString() })]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      const after = await this.getResetCounts(selected);
      return Object.freeze({ authority: 'postgresql', scopes: selected, before, after, completedAt: new Date().toISOString() });
    },

    async exportSnapshot({ includeOperations = true, includeMembers = false, includePersonalData = false } = {}) {
      const exportedAt = new Date().toISOString();
      const [migrationResult, categoryResult, assetResult, siteContentResult, boardConfigResult, boardPostResult, faqCategoryResult, systemConfigResult] = await Promise.all([
        pool.query(`SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name`),
        pool.query(`SELECT * FROM app_asset_categories ORDER BY sort_order, id`),
        pool.query(`SELECT * FROM app_rental_assets ORDER BY asset_no_normalized, asset_id`),
        pool.query(`SELECT * FROM app_site_content_documents ORDER BY domain, document_key`),
        pool.query(`SELECT * FROM app_board_configs ORDER BY board_type`),
        pool.query(`SELECT * FROM app_board_posts ORDER BY board_type, created_at, post_id`),
        pool.query(`SELECT * FROM app_faq_categories ORDER BY sort_order, category_id`),
        pool.query(`SELECT * FROM app_system_configuration ORDER BY config_key`),
      ]);
      const redact = (row) => {
        if (includePersonalData) return row;
        const next = { ...row };
        for (const key of [
          'email', 'firebase_email', 'name', 'member_name', 'phone', 'phone_number',
          'requester_email', 'requester_name', 'requester_team', 'firebase_uid',
          'identity_key', 'recovery_key', 'previous_account_uids'
        ]) {
          if (key in next) next[key] = '[redacted]';
        }
        return next;
      };
      const snapshot = {
        format: 'mk-rental-postgresql-backup-v1',
        authority: 'postgresql',
        exportedAt,
        schemaMigrations: migrationResult.rows,
        assets: { categories: categoryResult.rows, items: assetResult.rows },
        content: { site: siteContentResult.rows, boardConfigs: boardConfigResult.rows, boardPosts: boardPostResult.rows, faqCategories: faqCategoryResult.rows },
        systemConfiguration: systemConfigResult.rows,
      };
      if (includeOperations) {
        const [requestResult, itemResult, guardResult, eventResult] = await Promise.all([
          pool.query(`SELECT * FROM app_rental_requests ORDER BY id`),
          pool.query(`SELECT * FROM app_rental_request_items ORDER BY rental_request_id`),
          pool.query(`SELECT * FROM app_rental_asset_reservation_guards ORDER BY request_id`),
          pool.query(`SELECT * FROM app_rental_request_events ORDER BY id`),
        ]);
        snapshot.operations = {
          rentalRequests: requestResult.rows.map(redact),
          rentalRequestItems: itemResult.rows,
          reservationGuards: guardResult.rows,
          rentalRequestEvents: eventResult.rows,
        };
      }
      if (includeMembers) {
        const [memberResult, directoryResult, restrictionResult, termsStateResult] = await Promise.all([
          pool.query(`SELECT * FROM app_member_accounts ORDER BY firebase_uid`),
          pool.query(`SELECT * FROM app_member_directory_entries ORDER BY sort_order, identity_key`),
          pool.query(`SELECT * FROM app_user_rental_restriction_shadows ORDER BY firebase_uid`),
          pool.query(`SELECT * FROM app_user_term_consent_states ORDER BY app_user_id`),
        ]);
        snapshot.members = {
          accounts: memberResult.rows.map(redact),
          directory: directoryResult.rows.map(redact),
          restrictions: restrictionResult.rows,
          termsStates: termsStateResult.rows,
          personalDataIncluded: Boolean(includePersonalData),
        };
      }
      return Object.freeze(snapshot);
    },
  });
};
