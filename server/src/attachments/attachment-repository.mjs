const trim = (value) => String(value ?? '').trim();

const publicAttachment = (row) => row ? Object.freeze({
  id: row.attachment_id,
  name: row.display_name,
  downloadPath: `/api/attachments/${encodeURIComponent(row.attachment_id)}/download`,
}) : null;

export const createSecureAttachmentRepository = (pool) => Object.freeze({
  async listForOwners(ownerType, ownerIds, client = pool) {
    const ids = [...new Set((Array.isArray(ownerIds) ? ownerIds : []).map(trim).filter(Boolean))];
    if (!ids.length) return new Map();
    const result = await client.query(
      `SELECT attachment_id,owner_type,owner_id,display_name,sort_order,created_at
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
      `SELECT attachment_id,target_url
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
      const targetUrl = trim(attachment?.targetUrl) || trim(existing?.target_url);
      if (!attachmentId || !targetUrl) continue;
      keepIds.push(attachmentId);
      if (existing) {
        await client.query(
          `UPDATE app_secure_attachments
              SET display_name=$4,target_url=$5,sort_order=$6,updated_at=NOW()
            WHERE owner_type=$1 AND owner_id=$2 AND attachment_id=$3 AND deleted_at IS NULL`,
          [normalizedOwnerType, normalizedOwnerId, attachmentId, trim(attachment?.name), targetUrl, index],
        );
      } else {
        await client.query(
          `INSERT INTO app_secure_attachments
             (attachment_id,owner_type,owner_id,display_name,target_url,sort_order,created_by,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
          [attachmentId, normalizedOwnerType, normalizedOwnerId, trim(attachment?.name), targetUrl, index, trim(createdBy)],
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
      inquiryPublicId: row.inquiry_public_id || '',
      publicAccess: ['notice', 'faq'].includes(row.owner_type),
    });
  },
});
