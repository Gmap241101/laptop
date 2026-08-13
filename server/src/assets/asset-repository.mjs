const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const BLOCKING = new Set(['신청중', '대여중', '보류']);

const repositoryError = (code, message, details = {}) => {
  const error = new Error(message);
  error.name = 'AssetRepositoryError';
  error.code = code;
  Object.assign(error, details);
  return error;
};

const dateText = (value) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const mapAsset = (row) => row ? {
  id: row.asset_id,
  category: row.category_name || '',
  assetNo: row.asset_no || '',
  assetNoNormalized: row.asset_no_normalized || '',
  serialNo: row.serial_no || '',
  model: row.model || '',
  manufactureDate: row.manufacture_date || '',
  photo: row.photo || '',
  note: row.note || '',
  baseStatus: row.base_status || '대여가능',
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
} : null;

const representativeReservation = (reservations, referenceDate) => {
  const items = (reservations || []).filter((item) => BLOCKING.has(item.status));
  const byStart = (a, b) => String(a.startDate).localeCompare(String(b.startDate));
  return items.filter((item) => item.status === '대여중' && item.startDate <= referenceDate).sort(byStart)[0]
    || items.filter((item) => item.status === '대여중' && item.startDate > referenceDate).sort(byStart)[0]
    || items.filter((item) => item.status === '신청중').sort(byStart)[0]
    || items.filter((item) => item.status === '보류').sort(byStart)[0]
    || null;
};

const readCatalog = async (queryable, referenceDate) => {
  const [categoryResult, assetResult, reservationResult, syncResult] = await Promise.all([
    queryable.query(`SELECT name FROM app_asset_categories ORDER BY sort_order, id`),
    queryable.query(`SELECT asset.asset_id, category.name AS category_name,
                            asset.asset_no, asset.asset_no_normalized, asset.serial_no,
                            asset.model, asset.manufacture_date, asset.photo, asset.note,
                            asset.base_status, asset.created_at, asset.updated_at
                       FROM app_rental_assets asset
                       JOIN app_asset_categories category ON category.id = asset.category_id
                      ORDER BY category.sort_order, asset.asset_no_normalized, asset.asset_id`),
    queryable.query(`SELECT request_id, laptop_id, start_date::text AS start_date,
                            due_date::text AS due_date, status
                       FROM app_rental_asset_reservation_guards
                      WHERE active = TRUE
                      ORDER BY laptop_id, start_date, request_id`),
    queryable.query(`SELECT source_asset_count, source_category_count, source_hash, source_mode, synced_at
                       FROM app_asset_catalog_syncs WHERE scope='main'`),
  ]);
  const reservationsByAsset = new Map();
  const availability = reservationResult.rows.map((row) => ({
    id: row.request_id,
    laptopId: row.laptop_id,
    startDate: dateText(row.start_date),
    dueDate: dateText(row.due_date),
    status: row.status,
  }));
  availability.forEach((item) => {
    const list = reservationsByAsset.get(item.laptopId) || [];
    list.push(item);
    reservationsByAsset.set(item.laptopId, list);
  });
  const assets = assetResult.rows.map((row) => {
    const base = mapAsset(row);
    const reservations = reservationsByAsset.get(base.id) || [];
    const representative = representativeReservation(reservations, referenceDate);
    return Object.freeze({
      ...base,
      reservations,
      status: base.baseStatus === '대여불가' ? '대여불가' : representative?.status || '대여가능',
      currentRequestId: representative?.id || null,
    });
  });
  const sync = syncResult.rows[0] || null;
  return Object.freeze({
    categories: categoryResult.rows.map((row) => row.name),
    assets,
    availability,
    sync: sync ? Object.freeze({
      assetCount: Number(sync.source_asset_count || 0),
      categoryCount: Number(sync.source_category_count || 0),
      sourceHash: sync.source_hash || '',
      sourceMode: sync.source_mode || '',
      syncedAt: sync.synced_at || null,
    }) : null,
  });
};

const ensureCategory = async (client, name) => {
  const normalized = lower(name);
  const result = await client.query(
    `SELECT id, name FROM app_asset_categories WHERE normalized_name=$1 LIMIT 1`,
    [normalized],
  );
  if (!result.rows[0]) throw repositoryError('asset_category_not_found', 'Asset category does not exist.', { category: name });
  return result.rows[0];
};

const hasActiveReservation = async (client, assetId) => {
  const result = await client.query(
    `SELECT request_id, start_date::text AS start_date, due_date::text AS due_date, status
       FROM app_rental_asset_reservation_guards
      WHERE laptop_id=$1 AND active=TRUE
      ORDER BY start_date, request_id LIMIT 1`,
    [assetId],
  );
  return result.rows[0] || null;
};

const refreshCatalogMetadata = async (client, sourceMode = 'postgresql-authoritative-live') => {
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM app_rental_assets)::int AS assets,
      (SELECT COUNT(*) FROM app_asset_categories)::int AS categories
  `);
  const assetCount = Number(counts.rows[0]?.assets || 0);
  const categoryCount = Number(counts.rows[0]?.categories || 0);
  await client.query(
    `INSERT INTO app_asset_catalog_syncs (
       scope, source_asset_count, source_category_count, source_hash, source_mode, synced_at, updated_at
     ) VALUES ('main',$1,$2,'postgresql-live',$3,NOW(),NOW())
     ON CONFLICT (scope) DO UPDATE SET
       source_asset_count=EXCLUDED.source_asset_count,
       source_category_count=EXCLUDED.source_category_count,
       source_hash=EXCLUDED.source_hash,
       source_mode=EXCLUDED.source_mode,
       synced_at=NOW(), updated_at=NOW()`,
    [assetCount, categoryCount, sourceMode],
  );
  return Object.freeze({ assetCount, categoryCount });
};

export const createAssetRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with query()/connect() is required.');
  }

  return Object.freeze({
    async getCatalog(referenceDate) {
      return readCatalog(pool, referenceDate);
    },

    async bootstrap({ categories, assets, sourceHash = '' }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('phase20-asset-bootstrap'))`);
        const normalizedCategories = [...new Set((categories || []).map(trim).filter(Boolean))];
        for (let index = 0; index < normalizedCategories.length; index += 1) {
          const name = normalizedCategories[index];
          await client.query(
            `INSERT INTO app_asset_categories (name, normalized_name, sort_order, source_mode, updated_at)
             VALUES ($1,$2,$3,'firestore-imported-legacy',NOW())
             ON CONFLICT (normalized_name) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, updated_at=NOW()`,
            [name, lower(name), index],
          );
        }
        const sourceIds = [];
        for (const asset of assets || []) {
          const category = await ensureCategory(client, asset.category);
          sourceIds.push(trim(asset.id));
          await client.query(
            `INSERT INTO app_rental_assets (
               asset_id, category_id, asset_no, asset_no_normalized, serial_no, model,
               manufacture_date, photo, note, base_status, source_mode,
               source_created_at, source_updated_at, source_synced_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'firestore-imported-legacy',$11,$12,NOW(),NOW())
             ON CONFLICT (asset_id) DO UPDATE SET
               category_id=EXCLUDED.category_id,
               asset_no=EXCLUDED.asset_no,
               asset_no_normalized=EXCLUDED.asset_no_normalized,
               serial_no=EXCLUDED.serial_no,
               model=EXCLUDED.model,
               manufacture_date=EXCLUDED.manufacture_date,
               photo=EXCLUDED.photo,
               note=EXCLUDED.note,
               base_status=EXCLUDED.base_status,
               source_updated_at=EXCLUDED.source_updated_at,
               source_synced_at=NOW(),
               updated_at=NOW()`,
            [
              trim(asset.id), category.id, trim(asset.assetNo), lower(asset.assetNo), trim(asset.serialNo),
              trim(asset.model), trim(asset.manufactureDate), trim(asset.photo), trim(asset.note),
              asset.baseStatus === '대여불가' || asset.status === '대여불가' ? '대여불가' : '대여가능',
              asset.createdAt || null, asset.updatedAt || null,
            ],
          );
        }
        if (sourceIds.length > 0) {
          await client.query(`DELETE FROM app_rental_assets WHERE NOT (asset_id = ANY($1::text[]))`, [sourceIds]);
        } else {
          await client.query(`DELETE FROM app_rental_assets`);
        }
        await client.query(
          `DELETE FROM app_asset_categories category
            WHERE NOT EXISTS (SELECT 1 FROM app_rental_assets asset WHERE asset.category_id=category.id)
              AND NOT (category.normalized_name = ANY($1::text[]))`,
          [normalizedCategories.map(lower)],
        );
        await client.query(
          `INSERT INTO app_asset_catalog_syncs (scope, source_asset_count, source_category_count, source_hash, source_mode, synced_at, updated_at)
           VALUES ('main',$1,$2,$3,'firestore-admin-bootstrap',NOW(),NOW())
           ON CONFLICT (scope) DO UPDATE SET source_asset_count=EXCLUDED.source_asset_count,
             source_category_count=EXCLUDED.source_category_count, source_hash=EXCLUDED.source_hash,
             source_mode=EXCLUDED.source_mode, synced_at=NOW(), updated_at=NOW()`,
          [sourceIds.length, normalizedCategories.length, sourceHash],
        );
        await client.query('COMMIT');
        return { assetCount: sourceIds.length, categoryCount: normalizedCategories.length };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async createAuthoritative({ asset, referenceDate, beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`asset-no:${lower(asset.assetNo)}`]);
        const category = await ensureCategory(client, asset.category);
        const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM app_rental_assets`);
        if (Number(countResult.rows[0]?.count || 0) >= 200) throw repositoryError('asset_catalog_limit_exceeded', 'Asset catalog limit exceeded.');
        await client.query(
          `INSERT INTO app_rental_assets (
             asset_id, category_id, asset_no, asset_no_normalized, serial_no, model,
             manufacture_date, photo, note, base_status, source_mode, source_synced_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'postgresql-authoritative',NOW())`,
          [asset.id, category.id, trim(asset.assetNo), lower(asset.assetNo), trim(asset.serialNo), trim(asset.model), trim(asset.manufactureDate), trim(asset.photo), trim(asset.note), asset.baseStatus === '대여불가' ? '대여불가' : '대여가능'],
        );
        await refreshCatalogMetadata(client);
        const catalog = await readCatalog(client, referenceDate);
        const mirrorResult = await beforeCommit({ asset: catalog.assets.find((item) => item.id === asset.id), catalog });
        await client.query('COMMIT');
        return { asset: catalog.assets.find((item) => item.id === asset.id), catalog, mirrorResult };
      } catch (error) {
        await client.query('ROLLBACK');
        if (error?.code === '23505') throw repositoryError('duplicate_asset_number', 'Asset number already exists.');
        throw error;
      } finally { client.release(); }
    },

    async editAuthoritative({ assetId, patch, referenceDate, beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [assetId]);
        const currentResult = await client.query(
          `SELECT asset.asset_id, category.name AS category_name, asset.asset_no, asset.asset_no_normalized,
                  asset.serial_no, asset.model, asset.manufacture_date, asset.photo, asset.note, asset.base_status
             FROM app_rental_assets asset JOIN app_asset_categories category ON category.id=asset.category_id
            WHERE asset.asset_id=$1 FOR UPDATE`, [assetId]);
        const current = mapAsset(currentResult.rows[0]);
        if (!current) throw repositoryError('asset_not_found', 'Asset was not found.');
        const category = await ensureCategory(client, patch.category);
        const nextAssetNo = trim(patch.assetNo);
        const identityChanged = current.assetNo !== nextAssetNo || current.category !== trim(patch.category);
        if (identityChanged) {
          const blocking = await hasActiveReservation(client, assetId);
          if (blocking) throw repositoryError('active_rental_identity_change', 'Active reservation blocks asset identity changes.', { blockingRequest: blocking });
        }
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`asset-no:${lower(nextAssetNo)}`]);
        await client.query(
          `UPDATE app_rental_assets SET category_id=$2, asset_no=$3, asset_no_normalized=$4,
             serial_no=$5, model=$6, manufacture_date=$7, photo=$8, note=$9, base_status=$10,
             source_mode='postgresql-authoritative', source_synced_at=NOW(), updated_at=NOW()
           WHERE asset_id=$1`,
          [assetId, category.id, nextAssetNo, lower(nextAssetNo), trim(patch.serialNo), trim(patch.model), trim(patch.manufactureDate), trim(patch.photo), trim(patch.note), patch.baseStatus === '대여불가' || patch.status === '대여불가' ? '대여불가' : '대여가능'],
        );
        await refreshCatalogMetadata(client);
        const catalog = await readCatalog(client, referenceDate);
        const next = catalog.assets.find((item) => item.id === assetId);
        const mirrorResult = await beforeCommit({ previousAsset: current, asset: next, catalog });
        await client.query('COMMIT');
        return { asset: next, catalog, mirrorResult };
      } catch (error) {
        await client.query('ROLLBACK');
        if (error?.code === '23505') throw repositoryError('duplicate_asset_number', 'Asset number already exists.');
        throw error;
      } finally { client.release(); }
    },

    async deleteAuthoritative({ assetId, referenceDate, beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [assetId]);
        const currentResult = await client.query(
          `SELECT asset.asset_id, category.name AS category_name, asset.asset_no, asset.asset_no_normalized,
                  asset.serial_no, asset.model, asset.manufacture_date, asset.photo, asset.note, asset.base_status
             FROM app_rental_assets asset JOIN app_asset_categories category ON category.id=asset.category_id
            WHERE asset.asset_id=$1 FOR UPDATE`, [assetId]);
        const current = mapAsset(currentResult.rows[0]);
        if (!current) throw repositoryError('asset_not_found', 'Asset was not found.');
        const blocking = await hasActiveReservation(client, assetId);
        if (blocking) throw repositoryError('active_rental_exists', 'Active reservation blocks asset deletion.', { blockingRequest: blocking });
        await client.query(`DELETE FROM app_rental_assets WHERE asset_id=$1`, [assetId]);
        await refreshCatalogMetadata(client);
        const catalog = await readCatalog(client, referenceDate);
        const mirrorResult = await beforeCommit({ previousAsset: current, catalog });
        await client.query('COMMIT');
        return { deletedAsset: current, catalog, mirrorResult };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },

    async bulkCreateAuthoritative({ assets, referenceDate, beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('phase20-asset-bulk'))`);
        const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM app_rental_assets`);
        const currentCount = Number(countResult.rows[0]?.count || 0);
        const accepted = [];
        const duplicateAssetNumbers = [];
        const invalidCategories = [];
        const seen = new Set();
        for (const asset of assets || []) {
          const normalizedNo = lower(asset.assetNo);
          if (!normalizedNo || seen.has(normalizedNo)) {
            duplicateAssetNumbers.push(trim(asset.assetNo));
            continue;
          }
          seen.add(normalizedNo);
          let category;
          try { category = await ensureCategory(client, asset.category); }
          catch { invalidCategories.push(trim(asset.category)); continue; }
          const duplicate = await client.query(`SELECT asset_id FROM app_rental_assets WHERE asset_no_normalized=$1 LIMIT 1`, [normalizedNo]);
          if (duplicate.rows[0]) { duplicateAssetNumbers.push(trim(asset.assetNo)); continue; }
          if (currentCount + accepted.length >= 200) break;
          await client.query(
            `INSERT INTO app_rental_assets (asset_id, category_id, asset_no, asset_no_normalized, serial_no, model,
              manufacture_date, photo, note, base_status, source_mode, source_synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'postgresql-authoritative',NOW())`,
            [asset.id, category.id, trim(asset.assetNo), normalizedNo, trim(asset.serialNo), trim(asset.model), trim(asset.manufactureDate), trim(asset.photo), trim(asset.note), asset.baseStatus === '대여불가' || asset.status === '대여불가' ? '대여불가' : '대여가능'],
          );
          accepted.push(asset.id);
        }
        if (accepted.length === 0) throw repositoryError('asset_bulk_no_valid_assets', 'No valid assets were available for bulk creation.', { duplicateAssetNumbers, invalidCategories });
        await refreshCatalogMetadata(client);
        const catalog = await readCatalog(client, referenceDate);
        const createdAssets = catalog.assets.filter((asset) => accepted.includes(asset.id));
        const mirrorResult = await beforeCommit({ assets: createdAssets, catalog });
        await client.query('COMMIT');
        return { assets: createdAssets, catalog, duplicateAssetNumbers, invalidCategories, mirrorResult };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },

    async saveCategoriesAuthoritative({ categories, renameMap = {}, referenceDate, beforeCommit }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('phase20-asset-categories'))`);
        const finalCategories = [...new Set((categories || []).map(trim).filter(Boolean))];
        if (finalCategories.length !== (categories || []).map(trim).filter(Boolean).length) {
          throw repositoryError('duplicate_asset_category', 'Asset category names must be unique.');
        }
        const existingResult = await client.query(`SELECT id, name, normalized_name FROM app_asset_categories ORDER BY sort_order,id FOR UPDATE`);
        const existingByNormalized = new Map(existingResult.rows.map((row) => [row.normalized_name, row]));
        const targetByNormalized = new Map();
        for (let index = 0; index < finalCategories.length; index += 1) {
          const name = finalCategories[index];
          const normalized = lower(name);
          let row = existingByNormalized.get(normalized);
          if (!row) {
            const inserted = await client.query(
              `INSERT INTO app_asset_categories (name, normalized_name, sort_order, source_mode)
               VALUES ($1,$2,$3,'postgresql-authoritative') RETURNING id,name,normalized_name`, [name, normalized, index]);
            row = inserted.rows[0];
          } else {
            await client.query(`UPDATE app_asset_categories SET name=$2, sort_order=$3, source_mode='postgresql-authoritative', updated_at=NOW() WHERE id=$1`, [row.id, name, index]);
            row = { ...row, name };
          }
          targetByNormalized.set(normalized, row);
        }
        for (const [oldNameRaw, newNameRaw] of Object.entries(renameMap || {})) {
          const oldName = trim(oldNameRaw); const newName = trim(newNameRaw);
          if (!oldName || !newName || lower(oldName) === lower(newName)) continue;
          const oldCategory = existingByNormalized.get(lower(oldName));
          const newCategory = targetByNormalized.get(lower(newName));
          if (!oldCategory || !newCategory) continue;
          const blocking = await client.query(
            `SELECT asset.asset_no, guard.request_id, guard.status
               FROM app_rental_assets asset
               JOIN app_rental_asset_reservation_guards guard ON guard.laptop_id=asset.asset_id AND guard.active=TRUE
              WHERE asset.category_id=$1 LIMIT 1`, [oldCategory.id]);
          if (blocking.rows[0]) throw repositoryError('active_rental_category_rename', 'Active reservation blocks category rename.', { assetNo: blocking.rows[0].asset_no, blockingRequest: blocking.rows[0] });
          await client.query(`UPDATE app_rental_assets SET category_id=$2, source_mode='postgresql-authoritative', source_synced_at=NOW(), updated_at=NOW() WHERE category_id=$1`, [oldCategory.id, newCategory.id]);
        }
        const finalNormalized = finalCategories.map(lower);
        const inUseRemoved = await client.query(
          `SELECT category.name FROM app_asset_categories category
             WHERE NOT (category.normalized_name = ANY($1::text[]))
               AND EXISTS (SELECT 1 FROM app_rental_assets asset WHERE asset.category_id=category.id)
             LIMIT 1`, [finalNormalized]);
        if (inUseRemoved.rows[0]) throw repositoryError('asset_category_still_in_use', 'Asset category is still in use.', { category: inUseRemoved.rows[0].name });
        await client.query(`DELETE FROM app_asset_categories WHERE NOT (normalized_name = ANY($1::text[]))`, [finalNormalized]);
        await refreshCatalogMetadata(client);
        const catalog = await readCatalog(client, referenceDate);
        const mirrorResult = await beforeCommit({ catalog });
        await client.query('COMMIT');
        return { catalog, mirrorResult };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  });
};
