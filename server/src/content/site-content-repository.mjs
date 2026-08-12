import { createHash } from 'node:crypto';

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const hashDocuments = (documents) => createHash('sha256').update(JSON.stringify(stable(documents))).digest('hex');

const mapRow = (row) => ({
  key: row.document_key,
  payload: row.payload || {},
  enabled: row.enabled,
  sortOrder: row.sort_order,
  sourceUpdatedAt: row.source_updated_at,
  syncedAt: row.synced_at,
});

export const createSiteContentRepository = (pool) => Object.freeze({
  async getDomain(domain) {
    const syncResult = await pool.query(
      `SELECT domain, source_hash, document_count, source_mode, synced_at
         FROM app_site_content_syncs
        WHERE domain = $1`,
      [domain],
    );
    if (syncResult.rowCount === 0) return null;
    const docsResult = await pool.query(
      `SELECT document_key, payload, enabled, sort_order, source_updated_at, synced_at
         FROM app_site_content_documents
        WHERE domain = $1
        ORDER BY sort_order NULLS LAST, document_key`,
      [domain],
    );
    const sync = syncResult.rows[0];
    return Object.freeze({
      domain,
      source: 'postgresql',
      authoritative: false,
      synchronized: true,
      sourceMode: sync.source_mode,
      sourceHash: sync.source_hash,
      syncedAt: sync.synced_at,
      documentCount: Number(sync.document_count || 0),
      documents: docsResult.rows.map(mapRow),
    });
  },

  async replaceDomain({ domain, documents, actorClerkUserId = '', sourceMode = 'firestore-write-through' }) {
    const normalizedDocuments = (Array.isArray(documents) ? documents : []).map((item) => ({
      key: String(item?.key || '').trim(),
      payload: item?.payload && typeof item.payload === 'object' ? item.payload : {},
      enabled: typeof item?.enabled === 'boolean' ? item.enabled : null,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : null,
      sourceUpdatedAt: item?.sourceUpdatedAt || null,
    })).filter((item) => item.key);
    const sourceHash = hashDocuments(normalizedDocuments);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`phase24-site-content:${domain}`]);
      const normalizedSourceMode = String(sourceMode || '').trim() || 'postgresql-admin-direct';
      await client.query(`DELETE FROM app_site_content_documents WHERE domain = $1`, [domain]);
      for (const item of normalizedDocuments) {
        await client.query(
          `INSERT INTO app_site_content_documents
             (domain, document_key, payload, enabled, sort_order, source_mode, source_updated_at, synced_at, updated_at)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::timestamptz,NOW(),NOW())`,
          [domain, item.key, JSON.stringify(item.payload), item.enabled, item.sortOrder, normalizedSourceMode, item.sourceUpdatedAt],
        );
      }
      await client.query(
        `INSERT INTO app_site_content_syncs
           (domain, source_hash, document_count, source_mode, last_actor_clerk_user_id, synced_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT (domain) DO UPDATE SET
           source_hash=EXCLUDED.source_hash,
           document_count=EXCLUDED.document_count,
           source_mode=EXCLUDED.source_mode,
           last_actor_clerk_user_id=EXCLUDED.last_actor_clerk_user_id,
           synced_at=NOW(), updated_at=NOW()`,
        [domain, sourceHash, normalizedDocuments.length, normalizedSourceMode, String(actorClerkUserId || '')],
      );
      await client.query('COMMIT');
      return this.getDomain(domain);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  },
});
