import { createRentalConfigBootstrapDocument } from './rental-config-bootstrap.mjs';
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

export const createSiteContentRepository = (pool) => {
  const getRentalConfigBootstrapContext = async () => {
    const [teamResult, directoryStateResult, directoryCountResult] = await Promise.all([
      pool.query(`
        SELECT team
          FROM (
            SELECT DISTINCT trim(team) AS team
              FROM app_member_directory_entries
             WHERE enabled = TRUE AND trim(team) <> ''
            UNION
            SELECT DISTINCT trim(team) AS team
              FROM app_member_accounts
             WHERE status <> 'retired' AND trim(team) <> ''
          ) source
         ORDER BY team
      `),
      pool.query(`SELECT value FROM app_runtime_metadata WHERE key='phase31_member_directory_bootstrap' LIMIT 1`),
      pool.query(`SELECT COUNT(*)::bigint AS count FROM app_member_directory_entries WHERE enabled=TRUE`),
    ]);
    return Object.freeze({
      teams: teamResult.rows.map((row) => row.team).filter(Boolean),
      memberDirectoryVersion: Number(directoryStateResult.rows[0]?.value?.version || 0),
      memberDirectoryEntryCount: Number(directoryCountResult.rows[0]?.count || 0),
    });
  };

  let getDomain;

  const getDocument = async (domainValue, documentKeyValue) => {
    const domain = String(domainValue || '').trim();
    const documentKey = String(documentKeyValue || '').trim();
    if (!domain || !documentKey) return null;
    const result = await pool.query(
      `SELECT document_key, payload, enabled, sort_order, source_updated_at, synced_at
         FROM app_site_content_documents
        WHERE domain = $1 AND document_key = $2
        LIMIT 1`,
      [domain, documentKey],
    );
    return result.rowCount > 0 ? Object.freeze(mapRow(result.rows[0])) : null;
  };

  const getSignupTermContentContext = async (termIdValue) => {
    const termId = String(termIdValue || '').trim();
    if (!termId) return null;
    const termKey = `signupTerms/${termId}`;
    const result = await pool.query(
      `SELECT
         document_key,
         CASE
           WHEN document_key = 'signupTermsPolicy/current' THEN
             jsonb_set(
               payload,
               '{activeTerms}',
               COALESCE(
                 (
                   SELECT jsonb_agg((entry.value - 'contentHtml' - 'contentText') ORDER BY entry.ordinality)
                     FROM jsonb_array_elements(COALESCE(payload->'activeTerms', '[]'::jsonb)) WITH ORDINALITY AS entry(value, ordinality)
                 ),
                 '[]'::jsonb
               ),
               TRUE
             )
           ELSE payload
         END AS payload,
         enabled,
         sort_order,
         source_updated_at,
         synced_at
         FROM app_site_content_documents
        WHERE domain = 'terms'
          AND document_key = ANY($1::text[])`,
      [['signupTermsPolicy/current', termKey]],
    );
    const documents = new Map(
      result.rows.map((row) => [row.document_key, Object.freeze(mapRow(row))]),
    );
    return Object.freeze({
      policy: documents.get('signupTermsPolicy/current') || null,
      term: documents.get(termKey) || null,
    });
  };


  const getSignupTermContentsContext = async (termIdValues = []) => {
    const termIds = [...new Set((Array.isArray(termIdValues) ? termIdValues : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    if (termIds.length === 0) return Object.freeze({ policy: null, terms: [] });
    const termKeys = termIds.map((termId) => `signupTerms/${termId}`);
    const result = await pool.query(
      `SELECT
         document_key,
         CASE
           WHEN document_key = 'signupTermsPolicy/current' THEN
             jsonb_set(
               payload,
               '{activeTerms}',
               COALESCE(
                 (
                   SELECT jsonb_agg((entry.value - 'contentHtml' - 'contentText') ORDER BY entry.ordinality)
                     FROM jsonb_array_elements(COALESCE(payload->'activeTerms', '[]'::jsonb)) WITH ORDINALITY AS entry(value, ordinality)
                 ),
                 '[]'::jsonb
               ),
               TRUE
             )
           ELSE payload
         END AS payload,
         enabled,
         sort_order,
         source_updated_at,
         synced_at
         FROM app_site_content_documents
        WHERE domain = 'terms'
          AND (
            document_key = 'signupTermsPolicy/current'
            OR document_key = ANY($1::text[])
          )`,
      [termKeys],
    );
    const documents = new Map(
      result.rows.map((row) => [row.document_key, Object.freeze(mapRow(row))]),
    );
    return Object.freeze({
      policy: documents.get('signupTermsPolicy/current') || null,
      terms: termIds
        .map((termId) => documents.get(`signupTerms/${termId}`) || null)
        .filter(Boolean),
    });
  };

  const getDomains = async (domainValues = []) => {
    const domains = [...new Set((Array.isArray(domainValues) ? domainValues : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    if (domains.length === 0) return Object.freeze({});
    const result = await pool.query(
      `SELECT
         sync.domain AS sync_domain,
         sync.source_hash,
         sync.document_count,
         sync.source_mode,
         sync.synced_at AS sync_synced_at,
         document.document_key,
         document.payload,
         document.enabled,
         document.sort_order,
         document.source_updated_at,
         document.synced_at AS document_synced_at
       FROM app_site_content_syncs sync
       LEFT JOIN app_site_content_documents document
         ON document.domain = sync.domain
      WHERE sync.domain = ANY($1::text[])
      ORDER BY sync.domain, document.sort_order NULLS LAST, document.document_key`,
      [domains],
    );
    const grouped = new Map();
    for (const row of result.rows) {
      const domain = String(row.sync_domain || '').trim();
      if (!domain) continue;
      if (!grouped.has(domain)) {
        grouped.set(domain, { sync: row, documents: [] });
      }
      if (row.document_key) {
        grouped.get(domain).documents.push(mapRow({
          document_key: row.document_key,
          payload: row.payload,
          enabled: row.enabled,
          sort_order: row.sort_order,
          source_updated_at: row.source_updated_at,
          synced_at: row.document_synced_at,
        }));
      }
    }
    return Object.freeze(Object.fromEntries(domains.map((domain) => {
      const group = grouped.get(domain);
      if (!group) return [domain, null];
      const sync = group.sync;
      return [domain, Object.freeze({
        domain,
        source: 'postgresql',
        authoritative: true,
        synchronized: true,
        sourceMode: sync.source_mode,
        sourceHash: sync.source_hash,
        syncedAt: sync.sync_synced_at,
        documentCount: Number(sync.document_count || 0),
        documents: group.documents,
      })];
    })));
  };

  const getSignupTermsAdminCatalog = async () => {
    const result = await pool.query(
      `SELECT
         document_key,
         CASE
           WHEN document_key = 'signupTermsPolicy/current' THEN
             jsonb_set(
               payload,
               '{activeTerms}',
               COALESCE(
                 (
                   SELECT jsonb_agg((entry.value - 'contentHtml' - 'contentText') ORDER BY entry.ordinality)
                     FROM jsonb_array_elements(COALESCE(payload->'activeTerms', '[]'::jsonb)) WITH ORDINALITY AS entry(value, ordinality)
                 ),
                 '[]'::jsonb
               ),
               TRUE
             )
           ELSE
             (payload - 'contentHtml' - 'contentText')
             || jsonb_build_object('contentPreview', LEFT(COALESCE(payload->>'contentText', ''), 240))
         END AS payload,
         enabled,
         sort_order,
         source_updated_at,
         synced_at
       FROM app_site_content_documents
      WHERE domain = 'terms'
        AND (
          document_key = 'signupTermsPolicy/current'
          OR document_key LIKE 'signupTerms/%'
        )
      ORDER BY sort_order NULLS LAST, document_key`,
    );
    const documents = result.rows.map((row) => Object.freeze(mapRow(row)));
    return Object.freeze({
      policy: documents.find((document) => document.key === 'signupTermsPolicy/current') || null,
      terms: documents.filter((document) => document.key.startsWith('signupTerms/')),
    });
  };


  const getAdminSiteContentCatalog = async (domainValue) => {
    const domain = String(domainValue || '').trim().toLowerCase();
    if (!['popup', 'footer'].includes(domain)) return null;
    const result = await pool.query(
      `SELECT
         sync.domain AS sync_domain,
         sync.source_hash,
         sync.document_count,
         sync.source_mode,
         sync.synced_at AS sync_synced_at,
         document.document_key,
         CASE
           WHEN $1 = 'popup' THEN
             document.payload - 'content' - 'contentText' - 'contentHtml'
           WHEN $1 = 'footer' AND document.document_key LIKE 'footerPages/%' THEN
             document.payload - 'content' - 'contentText' - 'contentHtml'
           ELSE document.payload
         END AS payload,
         document.enabled,
         document.sort_order,
         document.source_updated_at,
         document.synced_at AS document_synced_at
       FROM app_site_content_syncs sync
       LEFT JOIN app_site_content_documents document
         ON document.domain = sync.domain
      WHERE sync.domain = $1
        AND (
          document.document_key IS NULL
          OR ($1 = 'popup' AND document.document_key LIKE 'popupPosts/%')
          OR ($1 = 'footer' AND (document.document_key = 'siteFooter/config' OR document.document_key LIKE 'footerPages/%'))
        )
      ORDER BY document.sort_order NULLS LAST, document.document_key`,
      [domain],
    );
    if (result.rowCount === 0) return null;
    const sync = result.rows[0];
    const documents = result.rows
      .filter((row) => row.document_key)
      .map((row) => Object.freeze(mapRow({
        document_key: row.document_key,
        payload: row.payload,
        enabled: row.enabled,
        sort_order: row.sort_order,
        source_updated_at: row.source_updated_at,
        synced_at: row.document_synced_at,
      })));
    return Object.freeze({
      domain,
      source: 'postgresql',
      authoritative: true,
      synchronized: true,
      sourceMode: sync.source_mode,
      sourceHash: sync.source_hash,
      syncedAt: sync.sync_synced_at,
      documentCount: documents.length,
      documents,
    });
  };

  const replaceDomain = async ({ domain, documents, actorClerkUserId = '', sourceMode = 'postgresql-admin-direct' }) => {
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
      return getDomain(domain);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const patchDomainDocuments = async ({
    domain,
    upserts = [],
    deletes = [],
    addressClaims = [],
    actorClerkUserId = '',
    sourceMode = 'postgresql-admin-patch',
  }) => {
    const normalizedUpserts = (Array.isArray(upserts) ? upserts : []).map((item) => ({
      key: String(item?.key || '').trim(),
      payload: item?.payload && typeof item.payload === 'object' ? item.payload : {},
      enabled: typeof item?.enabled === 'boolean' ? item.enabled : null,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : null,
      sourceUpdatedAt: item?.sourceUpdatedAt || null,
    })).filter((item) => item.key);
    const normalizedDeletes = [...new Set((Array.isArray(deletes) ? deletes : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean))];
    const normalizedAddressClaims = (Array.isArray(addressClaims) ? addressClaims : [])
      .map((claim) => ({
        documentKey: String(claim?.documentKey || '').trim(),
        addressId: String(claim?.addressId || '').trim().toLowerCase(),
      }))
      .filter((claim) => claim.documentKey && claim.addressId);
    const normalizedSourceMode = String(sourceMode || '').trim() || 'postgresql-admin-patch';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`phase24-site-content:${domain}`]);
      if (domain === 'footer' && normalizedAddressClaims.length > 0) {
        const footerRows = await client.query(
          `SELECT document_key, payload->>'addressId' AS address_id
             FROM app_site_content_documents
            WHERE domain = 'footer'
              AND document_key LIKE 'footerPages/%'`,
        );
        const claimedInPatch = new Map();
        for (const claim of normalizedAddressClaims) {
          const previousClaim = claimedInPatch.get(claim.addressId);
          if (previousClaim && previousClaim !== claim.documentKey) {
            throw Object.assign(new Error('Footer page address ID is duplicated in this mutation.'), {
              code: 'footer_page_address_conflict',
              status: 409,
            });
          }
          claimedInPatch.set(claim.addressId, claim.documentKey);
          const conflict = footerRows.rows.find((row) => {
            if (String(row.document_key || '') === claim.documentKey) return false;
            const storedAddressId = String(row.address_id || '').trim().toLowerCase();
            const storedInternalId = String(row.document_key || '').split('/').pop()?.trim().toLowerCase() || '';
            return storedAddressId === claim.addressId || storedInternalId === claim.addressId;
          });
          if (conflict) {
            throw Object.assign(new Error('Footer page address ID is already in use.'), {
              code: 'footer_page_address_conflict',
              status: 409,
            });
          }
        }
      }
      if (normalizedDeletes.length > 0) {
        await client.query(
          `DELETE FROM app_site_content_documents WHERE domain = $1 AND document_key = ANY($2::text[])`,
          [domain, normalizedDeletes],
        );
      }
      for (const item of normalizedUpserts) {
        await client.query(
          `INSERT INTO app_site_content_documents
             (domain, document_key, payload, enabled, sort_order, source_mode, source_updated_at, synced_at, updated_at)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::timestamptz,NOW(),NOW())
           ON CONFLICT (domain, document_key) DO UPDATE SET
             payload=EXCLUDED.payload,
             enabled=EXCLUDED.enabled,
             sort_order=EXCLUDED.sort_order,
             source_mode=EXCLUDED.source_mode,
             source_updated_at=EXCLUDED.source_updated_at,
             synced_at=NOW(),
             updated_at=NOW()`,
          [domain, item.key, JSON.stringify(item.payload), item.enabled, item.sortOrder, normalizedSourceMode, item.sourceUpdatedAt],
        );
      }
      const docsResult = await client.query(
        `SELECT document_key, payload, enabled, sort_order, source_updated_at
           FROM app_site_content_documents
          WHERE domain = $1
          ORDER BY sort_order NULLS LAST, document_key`,
        [domain],
      );
      const normalizedDocuments = docsResult.rows.map((row) => ({
        key: row.document_key,
        payload: row.payload || {},
        enabled: row.enabled,
        sortOrder: row.sort_order,
        sourceUpdatedAt: row.source_updated_at,
      }));
      const sourceHash = hashDocuments(normalizedDocuments);
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
      return getDomain(domain);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  getDomain = async (domain) => {
    const result = await pool.query(
      `SELECT
         sync.domain AS sync_domain,
         sync.source_hash,
         sync.document_count,
         sync.source_mode,
         sync.synced_at AS sync_synced_at,
         document.document_key,
         document.payload,
         document.enabled,
         document.sort_order,
         document.source_updated_at,
         document.synced_at AS document_synced_at
       FROM app_site_content_syncs sync
       LEFT JOIN app_site_content_documents document
         ON document.domain = sync.domain
      WHERE sync.domain = $1
      ORDER BY document.sort_order NULLS LAST, document.document_key`,
      [domain],
    );
    if (result.rowCount === 0) {
      if (domain !== 'rental-config') return null;
      const context = await getRentalConfigBootstrapContext();
      return replaceDomain({
        domain,
        documents: [createRentalConfigBootstrapDocument(context)],
        actorClerkUserId: 'phase34-rental-config-repository-self-heal',
        sourceMode: 'postgresql-self-heal',
      });
    }
    const documentRows = result.rows
      .filter((row) => row.document_key)
      .map((row) => ({
        document_key: row.document_key,
        payload: row.payload,
        enabled: row.enabled,
        sort_order: row.sort_order,
        source_updated_at: row.source_updated_at,
        synced_at: row.document_synced_at,
      }));
    if (domain === 'rental-config' && !documentRows.some((row) => row.document_key === 'rentalSystem/publicConfig')) {
      const context = await getRentalConfigBootstrapContext();
      return replaceDomain({
        domain,
        documents: [createRentalConfigBootstrapDocument(context)],
        actorClerkUserId: 'phase34-rental-config-repository-self-heal',
        sourceMode: 'postgresql-self-heal',
      });
    }
    const sync = result.rows[0];
    return Object.freeze({
      domain,
      source: 'postgresql',
      authoritative: true,
      synchronized: true,
      sourceMode: sync.source_mode,
      sourceHash: sync.source_hash,
      syncedAt: sync.sync_synced_at,
      documentCount: Number(sync.document_count || 0),
      documents: documentRows.map(mapRow),
    });
  };

  return Object.freeze({
    getRentalConfigBootstrapContext,
    getDocument,
    getSignupTermContentContext,
    getSignupTermContentsContext,
    getSignupTermsAdminCatalog,
    getAdminSiteContentCatalog,
    getDomains,
    getDomain,
    replaceDomain,
    patchDomainDocuments,
  });
};
