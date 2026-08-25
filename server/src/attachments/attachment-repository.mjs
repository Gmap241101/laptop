const trim = (value) => String(value ?? '').trim();
const safeMetricNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const publicAttachment = (row) => row ? Object.freeze({
  id: row.attachment_id,
  name: row.display_name,
  fileSizeBytes: safeMetricNumber(row.file_size_bytes),
  downloadCount: safeMetricNumber(row.download_count) || 0,
  downloadPath: `/api/attachments/${encodeURIComponent(row.attachment_id)}/download`,
}) : null;

export const createSecureAttachmentRepository = (pool) => Object.freeze({
  async listForOwners(ownerType, ownerIds, client = pool) {
    const ids = [...new Set((Array.isArray(ownerIds) ? ownerIds : []).map(trim).filter(Boolean))];
    if (!ids.length) return new Map();
    const result = await client.query(
      `SELECT attachment_id,owner_type,owner_id,display_name,file_size_bytes,download_count,sort_order,created_at
         FROM app_secure_attachments
        WHERE owner_type=$1 AND owner_id=ANY($2::text[]) AND deleted_at IS NULL
        ORDER BY owner_id,sort_order,created_at,attachment_id`,
      [trim(ownerType), ids],
    );
    const mapped = new Map(ids.map((id) => [id, []]));
    result.rows.forEach((row) => {
      const list = mapped.get(row.owner_id) || [];
      list.push(publicAttachment(row));
      mapped.set(row.owner_id, list);
    });
    return mapped;
  },

  async listForOwner(ownerType, ownerId, client = pool) {
    const mapped = await this.listForOwners(ownerType, [ownerId], client);
    return Object.freeze(mapped.get(trim(ownerId)) || []);
  },

  async syncOwnerAttachments(client, { ownerType, ownerId, attachments = [], createdBy = '' }) {
    const normalizedOwnerType = trim(ownerType);
    const normalizedOwnerId = trim(ownerId);
    const current = await client.query(
      `SELECT attachment_id,display_name,target_url,file_size_bytes,download_count,metadata_checked_at
         FROM app_secure_attachments
        WHERE owner_type=$1 AND owner_id=$2 AND deleted_at IS NULL
        FOR UPDATE`,
      [normalizedOwnerType, normalizedOwnerId],
    );
    const currentById = new Map(current.rows.map((row) => [row.attachment_id, row]));
    const keepIds = [];

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const requestedId = trim(attachment?.id);
      const existing = requestedId ? currentById.get(requestedId) : null;
      const attachmentId = existing ? requestedId : trim(attachment?.generatedId);
      const suppliedTargetUrl = trim(attachment?.targetUrl);
      const targetUrl = suppliedTargetUrl || trim(existing?.target_url);
      if (!attachmentId || !targetUrl) continue;
      keepIds.push(attachmentId);
      const metadataChecked = Boolean(attachment?.metadataChecked && suppliedTargetUrl);
      const fileSizeBytes = safeMetricNumber(attachment?.fileSizeBytes);
      const displayName = trim(attachment?.name) || (suppliedTargetUrl ? '' : trim(existing?.display_name)) || '첨부파일';
      if (existing) {
        await client.query(
          `UPDATE app_secure_attachments
              SET display_name=$4,
                  target_url=$5,
                  sort_order=$6,
                  file_size_bytes=CASE WHEN $7::boolean THEN $8::bigint ELSE file_size_bytes END,
                  metadata_checked_at=CASE WHEN $7::boolean THEN NOW() ELSE metadata_checked_at END,
                  updated_at=NOW()
            WHERE owner_type=$1 AND owner_id=$2 AND attachment_id=$3 AND deleted_at IS NULL`,
          [normalizedOwnerType, normalizedOwnerId, attachmentId, displayName, targetUrl, index, metadataChecked, fileSizeBytes],
        );
      } else {
        await client.query(
          `INSERT INTO app_secure_attachments
             (attachment_id,owner_type,owner_id,display_name,target_url,file_size_bytes,download_count,metadata_checked_at,sort_order,created_by,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,0,CASE WHEN $7::boolean THEN NOW() ELSE NULL END,$8,$9,NOW(),NOW())`,
          [attachmentId, normalizedOwnerType, normalizedOwnerId, displayName, targetUrl, fileSizeBytes, Boolean(attachment?.metadataChecked), index, trim(createdBy)],
        );
      }
    }

    if (keepIds.length) {
      await client.query(
        `UPDATE app_secure_attachments
            SET deleted_at=NOW(),updated_at=NOW()
          WHERE owner_type=$1 AND owner_id=$2 AND deleted_at IS NULL AND NOT (attachment_id=ANY($3::text[]))`,
        [normalizedOwnerType, normalizedOwnerId, keepIds],
      );
    } else {
      await client.query(
        `UPDATE app_secure_attachments
            SET deleted_at=NOW(),updated_at=NOW()
          WHERE owner_type=$1 AND owner_id=$2 AND deleted_at IS NULL`,
        [normalizedOwnerType, normalizedOwnerId],
      );
    }
  },

  async deleteOwnerAttachments(client, ownerType, ownerId) {
    await client.query(
      `UPDATE app_secure_attachments SET deleted_at=NOW(),updated_at=NOW()
        WHERE owner_type=$1 AND owner_id=$2 AND deleted_at IS NULL`,
      [trim(ownerType), trim(ownerId)],
    );
  },

  async getDownloadRecord(attachmentId) {
    const result = await pool.query(
      `SELECT a.attachment_id,a.owner_type,a.owner_id,a.display_name,a.target_url,
              a.file_size_bytes,a.download_count,
              COALESCE(i.public_id,ia.public_id,'') AS inquiry_public_id
         FROM app_secure_attachments a
         LEFT JOIN app_inquiries i
           ON a.owner_type='inquiry' AND i.inquiry_id=a.owner_id AND i.deleted_at IS NULL
         LEFT JOIN (
           SELECT ans.answer_id,inq.public_id
             FROM app_inquiry_answers ans
             JOIN app_inquiries inq ON inq.inquiry_id=ans.inquiry_id AND inq.deleted_at IS NULL
            WHERE ans.deleted_at IS NULL
         ) ia ON a.owner_type='inquiry_answer' AND ia.answer_id=a.owner_id
        WHERE a.attachment_id=$1 AND a.deleted_at IS NULL
          AND (
            a.owner_type NOT IN ('notice','faq')
            OR EXISTS (
              SELECT 1 FROM app_board_posts p
               WHERE p.post_id=a.owner_id AND p.board_type=a.owner_type
            )
          )
          AND (
            a.owner_type NOT IN ('inquiry','inquiry_answer')
            OR COALESCE(i.public_id,ia.public_id,'')<>''
          )`,
      [trim(attachmentId)],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      id: row.attachment_id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      name: row.display_name,
      targetUrl: row.target_url,
      fileSizeBytes: safeMetricNumber(row.file_size_bytes),
      downloadCount: safeMetricNumber(row.download_count) || 0,
      inquiryPublicId: row.inquiry_public_id || '',
      publicAccess: ['notice', 'faq'].includes(row.owner_type),
    });
  },

  async claimMissingMetadata(limit = 25) {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 25)));
    const result = await pool.query(
      `WITH candidates AS (
         SELECT attachment_id
           FROM app_secure_attachments
          WHERE deleted_at IS NULL
            AND file_size_bytes IS NULL
            AND metadata_checked_at IS NULL
          ORDER BY created_at,attachment_id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE app_secure_attachments a
          SET metadata_checked_at=NOW()
         FROM candidates c
        WHERE a.attachment_id=c.attachment_id
        RETURNING a.attachment_id,a.target_url`,
      [safeLimit],
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      id: row.attachment_id,
      targetUrl: row.target_url,
    })));
  },

  async updateProbedMetadata(attachmentId, fileSizeBytes) {
    const normalizedBytes = safeMetricNumber(fileSizeBytes);
    const result = await pool.query(
      `UPDATE app_secure_attachments
          SET file_size_bytes=$2::bigint,
              metadata_checked_at=NOW()
        WHERE attachment_id=$1 AND deleted_at IS NULL
        RETURNING file_size_bytes,metadata_checked_at`,
      [trim(attachmentId), normalizedBytes],
    );
    const row = result.rows[0];
    return row ? Object.freeze({
      fileSizeBytes: safeMetricNumber(row.file_size_bytes),
      metadataCheckedAt: row.metadata_checked_at || null,
    }) : null;
  },

  async recordCompletedDownload(attachmentId, transferredBytes) {
    const normalizedBytes = safeMetricNumber(transferredBytes);
    const result = await pool.query(
      `UPDATE app_secure_attachments
          SET download_count=download_count+1,
              last_downloaded_at=NOW(),
              file_size_bytes=CASE WHEN $2::bigint IS NOT NULL AND $2::bigint > 0 THEN $2::bigint ELSE file_size_bytes END,
              metadata_checked_at=CASE WHEN $2::bigint IS NOT NULL AND $2::bigint > 0 THEN NOW() ELSE metadata_checked_at END
        WHERE attachment_id=$1 AND deleted_at IS NULL
        RETURNING file_size_bytes,download_count,last_downloaded_at`,
      [trim(attachmentId), normalizedBytes],
    );
    const row = result.rows[0];
    return row ? Object.freeze({
      fileSizeBytes: safeMetricNumber(row.file_size_bytes),
      downloadCount: safeMetricNumber(row.download_count) || 0,
      lastDownloadedAt: row.last_downloaded_at || null,
    }) : null;
  },
});
