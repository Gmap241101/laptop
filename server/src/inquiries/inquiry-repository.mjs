const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();

const repositoryError = (code, message, status = 409, details = {}) => {
  const error = new Error(message);
  error.name = 'InquiryRepositoryError';
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
};

const safeJsonArray = (value) => Array.isArray(value) ? value : [];

const mapCategory = (row) => row ? Object.freeze({
  id: row.category_id || '',
  name: row.name || '',
  order: Number(row.sort_order || 0),
  inquiryCount: Number(row.inquiry_count || 0),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
}) : null;

const mapInquiryTerm = (row) => row ? Object.freeze({
  id: row.term_id || '',
  title: row.title || '',
  contentHtml: row.body_html || '',
  contentText: row.body_text || '',
  required: Boolean(row.required),
  revision: Math.max(1, Number(row.revision || 1)),
  contentHash: row.content_hash || '',
  enabled: row.enabled !== false,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
}) : null;

const statusFromCount = (countValue) => {
  const count = Number(countValue || 0);
  if (count >= 2) return 'additional';
  if (count === 1) return 'answered';
  return 'waiting';
};

const mapInquirySummary = (row) => row ? Object.freeze({
  publicId: row.public_id || '',
  authorType: row.author_type || '',
  memberUid: row.member_uid || '',
  categoryId: row.category_id || '',
  categoryName: row.category_name || '',
  title: row.title || '',
  authorName: row.author_name || '',
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  answerCount: Number(row.answer_count || 0),
  latestAnswerAt: row.latest_answer_at || null,
  status: statusFromCount(row.answer_count),
}) : null;

const mapAnswer = (row) => row ? Object.freeze({
  id: row.answer_id || '',
  bodyHtml: row.body_html || '',
  bodyText: row.body_text || '',
  adminIdentityId: row.admin_identity_id || '',
  adminDisplayName: row.admin_display_name || '',
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
}) : null;

const mapInquiryDetail = (row, answers = [], consents = [], navigation = {}) => row ? Object.freeze({
  ...mapInquirySummary(row),
  bodyHtml: row.body_html || '',
  bodyText: row.body_text || '',
  authorEmail: row.author_email || '',
  authorTeam: row.author_team || '',
  authorPhone: row.author_phone || '',
  answers: Object.freeze(answers.map(mapAnswer).filter(Boolean)),
  guestConsents: Object.freeze(consents.map((consent) => Object.freeze({
    source: consent.term_source || '',
    termId: consent.term_id || '',
    revision: Math.max(1, Number(consent.term_revision || 1)),
    versionId: consent.term_version_id || '',
    required: Boolean(consent.required_snapshot),
    title: consent.title_snapshot || '',
    contentHash: consent.content_hash || '',
    consentedAt: consent.consented_at || null,
  }))),
  navigation: Object.freeze({
    previous: navigation?.previous || null,
    next: navigation?.next || null,
  }),
}) : null;

const normalizePage = (value) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
};
const normalizePageSize = (value, fallback = 10) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 5 && parsed <= 50 ? parsed : fallback;
};

const SETTINGS_SELECT = `
  SELECT setting_key, allow_guest, posts_per_page, guest_term_bindings, updated_by, created_at, updated_at
    FROM app_inquiry_settings
   WHERE setting_key='current'
`;

const INQUIRY_WITH_STATUS_SELECT = `
  SELECT i.*,
         c.name AS category_name,
         COALESCE(a.answer_count,0)::int AS answer_count,
         a.latest_answer_at
    FROM app_inquiries i
    JOIN app_inquiry_categories c ON c.category_id=i.category_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS answer_count, MAX(created_at) AS latest_answer_at
        FROM app_inquiry_answers ans
       WHERE ans.inquiry_id=i.inquiry_id AND ans.deleted_at IS NULL
    ) a ON TRUE
`;

export const createInquiryRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required.');

  const getSettings = async (client = pool) => {
    const result = await client.query(SETTINGS_SELECT);
    const row = result.rows[0];
    return Object.freeze({
      allowGuest: Boolean(row?.allow_guest),
      postsPerPage: normalizePageSize(row?.posts_per_page, 10),
      guestTermBindings: Object.freeze(safeJsonArray(row?.guest_term_bindings)),
      updatedAt: row?.updated_at || null,
    });
  };

  const listActiveAnswers = async (client, inquiryId) => {
    const result = await client.query(
      `SELECT answer_id, body_html, body_text, admin_identity_id, admin_display_name, created_at, updated_at
         FROM app_inquiry_answers
        WHERE inquiry_id=$1 AND deleted_at IS NULL
        ORDER BY created_at, answer_id`,
      [trim(inquiryId)],
    );
    return result.rows;
  };

  const listConsents = async (client, inquiryId) => {
    const result = await client.query(
      `SELECT term_source, term_id, term_revision, term_version_id, required_snapshot,
              title_snapshot, content_hash, consented_at
         FROM app_inquiry_guest_consents
        WHERE inquiry_id=$1
        ORDER BY consented_at, consent_id`,
      [trim(inquiryId)],
    );
    return result.rows;
  };

  const getInquiryRow = async (client, whereSql, values = [], { forUpdate = false } = {}) => {
    const result = await client.query(
      `${INQUIRY_WITH_STATUS_SELECT}
       WHERE ${whereSql}
       LIMIT 1
       ${forUpdate ? 'FOR UPDATE OF i' : ''}`,
      values,
    );
    return result.rows[0] || null;
  };

  const getInquiryNavigation = async (client, { ownerType, memberUid = '', publicIds = [], publicId }) => {
    const normalizedPublicId = trim(publicId);
    const isMember = ownerType === 'member';
    const scopedIds = [...new Set((publicIds || []).map(trim).filter(Boolean))];
    if (!isMember && !scopedIds.includes(normalizedPublicId)) {
      return Object.freeze({ previous: null, next: null });
    }

    const values = isMember ? [trim(memberUid), normalizedPublicId] : [scopedIds, normalizedPublicId];
    const ownerClause = isMember
      ? `i.member_uid=$1 AND i.author_type='member' AND i.deleted_at IS NULL`
      : `i.public_id=ANY($1::text[]) AND i.author_type='guest' AND i.deleted_at IS NULL`;
    const result = await client.query(
      `WITH ordered AS (
         SELECT i.public_id,i.title,i.author_name,i.created_at,
                LAG(i.public_id) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS previous_public_id,
                LAG(i.title) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS previous_title,
                LAG(i.author_name) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS previous_author_name,
                LAG(i.created_at) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS previous_created_at,
                LEAD(i.public_id) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS next_public_id,
                LEAD(i.title) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS next_title,
                LEAD(i.author_name) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS next_author_name,
                LEAD(i.created_at) OVER (ORDER BY i.created_at DESC,i.inquiry_id DESC) AS next_created_at
           FROM app_inquiries i
          WHERE ${ownerClause}
       )
       SELECT * FROM ordered WHERE public_id=$2`,
      values,
    );
    const row = result.rows[0];
    const mapNavigationItem = (prefix) => row?.[`${prefix}_public_id`] ? Object.freeze({
      publicId: row[`${prefix}_public_id`],
      title: row[`${prefix}_title`] || '',
      authorName: row[`${prefix}_author_name`] || '',
      createdAt: row[`${prefix}_created_at`] || null,
    }) : null;
    return Object.freeze({
      previous: mapNavigationItem('previous'),
      next: mapNavigationItem('next'),
    });
  };

  return Object.freeze({
    async getSettings() {
      return getSettings();
    },

    async saveSettings({ allowGuest, postsPerPage, guestTermBindings, actorId }) {
      const result = await pool.query(
        `INSERT INTO app_inquiry_settings
           (setting_key,allow_guest,posts_per_page,guest_term_bindings,updated_by,created_at,updated_at)
         VALUES ('current',$1,$2,$3::jsonb,$4,NOW(),NOW())
         ON CONFLICT (setting_key) DO UPDATE SET
           allow_guest=EXCLUDED.allow_guest,
           posts_per_page=EXCLUDED.posts_per_page,
           guest_term_bindings=EXCLUDED.guest_term_bindings,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()
         RETURNING setting_key`,
        [Boolean(allowGuest), normalizePageSize(postsPerPage, 10), JSON.stringify(guestTermBindings || []), trim(actorId)],
      );
      if (!result.rows[0]) throw repositoryError('inquiry_settings_save_failed', 'Inquiry settings could not be saved.', 503);
      return getSettings();
    },

    async listCategories({ includeCounts = false } = {}) {
      const result = await pool.query(
        `SELECT c.category_id,c.name,c.sort_order,c.created_at,c.updated_at,
                ${includeCounts ? `COUNT(i.inquiry_id) FILTER (WHERE i.deleted_at IS NULL)::int` : '0::int'} AS inquiry_count
           FROM app_inquiry_categories c
           ${includeCounts ? 'LEFT JOIN app_inquiries i ON i.category_id=c.category_id' : ''}
          WHERE c.deleted_at IS NULL
          ${includeCounts ? 'GROUP BY c.category_id,c.name,c.sort_order,c.created_at,c.updated_at' : ''}
          ORDER BY c.sort_order,c.created_at,c.category_id`,
      );
      return Object.freeze(result.rows.map(mapCategory));
    },

    async getCategory(categoryId) {
      const result = await pool.query(
        `SELECT category_id,name,sort_order,created_at,updated_at,0::int AS inquiry_count
           FROM app_inquiry_categories
          WHERE category_id=$1 AND deleted_at IS NULL`,
        [trim(categoryId)],
      );
      return mapCategory(result.rows[0]);
    },

    async saveCategory({ id, name, actorId }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query(
          `SELECT category_id FROM app_inquiry_categories WHERE LOWER(name)=LOWER($1) AND deleted_at IS NULL AND category_id<>$2 LIMIT 1`,
          [trim(name), trim(id)],
        );
        if (existing.rows[0]) throw repositoryError('inquiry_category_duplicate_name', 'Inquiry category name already exists.', 409);
        const current = await client.query(`SELECT category_id FROM app_inquiry_categories WHERE category_id=$1 FOR UPDATE`, [trim(id)]);
        if (current.rows[0]) {
          await client.query(
            `UPDATE app_inquiry_categories
                SET name=$2,updated_by=$3,updated_at=NOW(),deleted_at=NULL,deleted_by=''
              WHERE category_id=$1`,
            [trim(id), trim(name), trim(actorId)],
          );
        } else {
          const orderResult = await client.query(`SELECT COALESCE(MAX(sort_order),0)+10 AS next_order FROM app_inquiry_categories WHERE deleted_at IS NULL`);
          await client.query(
            `INSERT INTO app_inquiry_categories
               (category_id,name,sort_order,created_by,updated_by,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$4,NOW(),NOW())`,
            [trim(id), trim(name), Number(orderResult.rows[0]?.next_order || 10), trim(actorId)],
          );
        }
        await client.query('COMMIT');
        return this.getCategory(id);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteCategory({ categoryId, actorId }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM app_inquiries WHERE category_id=$1 AND deleted_at IS NULL`,
          [trim(categoryId)],
        );
        const inquiryCount = Number(countResult.rows[0]?.count || 0);
        if (inquiryCount > 0) throw repositoryError('inquiry_category_in_use', 'Inquiry category is still used by inquiries.', 409, { inquiryCount });
        const result = await client.query(
          `UPDATE app_inquiry_categories SET deleted_at=NOW(),deleted_by=$2,updated_by=$2,updated_at=NOW()
            WHERE category_id=$1 AND deleted_at IS NULL
            RETURNING category_id`,
          [trim(categoryId), trim(actorId)],
        );
        if (!result.rows[0]) throw repositoryError('inquiry_category_not_found', 'Inquiry category was not found.', 404);
        await client.query('COMMIT');
        return Object.freeze({ id: result.rows[0].category_id });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async listInquiryTerms({ includeDisabled = true } = {}) {
      const result = await pool.query(
        `SELECT term_id,title,body_html,body_text,required,revision,content_hash,enabled,created_at,updated_at
           FROM app_inquiry_terms
          WHERE deleted_at IS NULL ${includeDisabled ? '' : 'AND enabled=TRUE'}
          ORDER BY updated_at DESC,term_id`,
      );
      return Object.freeze(result.rows.map(mapInquiryTerm));
    },

    async getInquiryTerm(termId) {
      const result = await pool.query(
        `SELECT term_id,title,body_html,body_text,required,revision,content_hash,enabled,created_at,updated_at
           FROM app_inquiry_terms
          WHERE term_id=$1 AND deleted_at IS NULL`,
        [trim(termId)],
      );
      return mapInquiryTerm(result.rows[0]);
    },

    async saveInquiryTerm({ id, title, bodyHtml, bodyText, required, revision, contentHash, enabled, actorId }) {
      const current = await pool.query(`SELECT term_id FROM app_inquiry_terms WHERE term_id=$1`, [trim(id)]);
      if (current.rows[0]) {
        await pool.query(
          `UPDATE app_inquiry_terms
              SET title=$2,body_html=$3,body_text=$4,required=$5,revision=$6,content_hash=$7,enabled=$8,
                  updated_by=$9,updated_at=NOW(),deleted_at=NULL,deleted_by=''
            WHERE term_id=$1`,
          [trim(id), trim(title), String(bodyHtml || ''), String(bodyText || ''), Boolean(required), Math.max(1, Number(revision || 1)), trim(contentHash), Boolean(enabled), trim(actorId)],
        );
      } else {
        await pool.query(
          `INSERT INTO app_inquiry_terms
             (term_id,title,body_html,body_text,required,revision,content_hash,enabled,created_by,updated_by,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,NOW(),NOW())`,
          [trim(id), trim(title), String(bodyHtml || ''), String(bodyText || ''), Boolean(required), Math.max(1, Number(revision || 1)), trim(contentHash), Boolean(enabled), trim(actorId)],
        );
      }
      return this.getInquiryTerm(id);
    },

    async deleteInquiryTerm({ termId, actorId }) {
      const settings = await getSettings();
      const selected = settings.guestTermBindings.some((binding) => binding?.source === 'inquiry' && trim(binding?.id) === trim(termId));
      if (selected) throw repositoryError('inquiry_term_in_use', 'Selected guest inquiry term cannot be deleted.', 409);
      const result = await pool.query(
        `UPDATE app_inquiry_terms
            SET deleted_at=NOW(),deleted_by=$2,updated_by=$2,enabled=FALSE,updated_at=NOW()
          WHERE term_id=$1 AND deleted_at IS NULL
          RETURNING term_id`,
        [trim(termId), trim(actorId)],
      );
      if (!result.rows[0]) throw repositoryError('inquiry_term_not_found', 'Inquiry term was not found.', 404);
      return Object.freeze({ id: result.rows[0].term_id });
    },

    async getSignupTermsContext() {
      const result = await pool.query(
        `SELECT document_key,payload,enabled,sort_order,updated_at
           FROM app_site_content_documents
          WHERE domain='terms'
            AND (document_key='signupTermsPolicy/current' OR document_key LIKE 'signupTerms/%')`,
      );
      const policy = result.rows.find((row) => row.document_key === 'signupTermsPolicy/current')?.payload || null;
      const terms = result.rows
        .filter((row) => row.document_key.startsWith('signupTerms/'))
        .map((row) => ({ key: row.document_key, payload: row.payload || {}, enabled: row.enabled !== false, sortOrder: row.sort_order, updatedAt: row.updated_at }));
      return Object.freeze({ policy, terms: Object.freeze(terms) });
    },

    async resolveMemberByClerkUserId(clerkUserId) {
      const result = await pool.query(
        `SELECT m.firebase_uid AS member_uid,m.name,m.email,m.team,m.phone,m.status,
                u.clerk_user_id,u.primary_email,l.firebase_email
           FROM app_user_identities u
           JOIN app_user_firebase_links l ON l.app_user_id=u.id
           JOIN app_member_accounts m ON m.firebase_uid=l.firebase_uid
          WHERE u.clerk_user_id=$1
          LIMIT 1`,
        [trim(clerkUserId)],
      );
      const row = result.rows[0];
      if (!row) return null;
      return Object.freeze({
        memberUid: row.member_uid || '',
        name: row.name || '',
        email: row.email || row.firebase_email || row.primary_email || '',
        team: row.team || '',
        phone: row.phone || '',
        status: row.status || '',
      });
    },

    async createMemberInquiry({ inquiryId, publicId, member, categoryId, title, bodyHtml, bodyText }) {
      const result = await pool.query(
        `INSERT INTO app_inquiries
           (inquiry_id,public_id,author_type,member_uid,category_id,title,body_html,body_text,
            author_name,author_email,author_team,author_phone,guest_password_hash,created_at,updated_at)
         SELECT $1,$2,'member',$3,c.category_id,$4,$5,$6,$7,$8,$9,$10,NULL,NOW(),NOW()
           FROM app_inquiry_categories c
          WHERE c.category_id=$11 AND c.deleted_at IS NULL
         RETURNING inquiry_id,public_id`,
        [trim(inquiryId), trim(publicId), trim(member.memberUid), trim(title), String(bodyHtml || ''), String(bodyText || ''), trim(member.name), lower(member.email), trim(member.team), trim(member.phone), trim(categoryId)],
      );
      if (!result.rows[0]) throw repositoryError('inquiry_category_not_found', 'Inquiry category was not found.', 404);
      return this.getMemberInquiry({ memberUid: member.memberUid, publicId });
    },

    async createGuestInquiry({ inquiryId, publicId, categoryId, title, bodyHtml, bodyText, author, passwordHash, consents }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const category = await client.query(`SELECT category_id FROM app_inquiry_categories WHERE category_id=$1 AND deleted_at IS NULL`, [trim(categoryId)]);
        if (!category.rows[0]) throw repositoryError('inquiry_category_not_found', 'Inquiry category was not found.', 404);
        await client.query(
          `INSERT INTO app_inquiries
             (inquiry_id,public_id,author_type,member_uid,category_id,title,body_html,body_text,
              author_name,author_email,author_team,author_phone,guest_password_hash,created_at,updated_at)
           VALUES ($1,$2,'guest',NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
          [trim(inquiryId), trim(publicId), trim(categoryId), trim(title), String(bodyHtml || ''), String(bodyText || ''), trim(author.name), lower(author.email), trim(author.team), trim(author.phone), String(passwordHash || '')],
        );
        for (const consent of consents || []) {
          await client.query(
            `INSERT INTO app_inquiry_guest_consents
               (consent_id,inquiry_id,term_source,term_id,term_revision,term_version_id,required_snapshot,title_snapshot,content_hash,consented_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
            [trim(consent.id), trim(inquiryId), trim(consent.source), trim(consent.termId), Math.max(1, Number(consent.revision || 1)), trim(consent.versionId), Boolean(consent.required), trim(consent.title), trim(consent.contentHash)],
          );
        }
        await client.query('COMMIT');
        return Object.freeze({ publicId: trim(publicId) });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async listMemberInquiries({ memberUid, search = '', page, pageSize }) {
      const safePage = normalizePage(page);
      const requestedPageSize = Math.trunc(Number(pageSize));
      const safeRequestedPageSize = Number.isFinite(requestedPageSize) && requestedPageSize >= 5 && requestedPageSize <= 50
        ? requestedPageSize
        : null;
      const normalizedSearch = lower(search);
      const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : null;
      const result = await pool.query(
        `WITH effective_settings AS (
           SELECT CASE
                    WHEN $3::int IS NOT NULL AND $3::int BETWEEN 5 AND 50 THEN $3::int
                    ELSE COALESCE((SELECT NULLIF(posts_per_page,0) FROM app_inquiry_settings WHERE setting_key='current'),10)
                  END::int AS page_size
         ), filtered AS (
           ${INQUIRY_WITH_STATUS_SELECT}
            WHERE i.member_uid=$1 AND i.author_type='member' AND i.deleted_at IS NULL
              AND ($2::text IS NULL OR LOWER(i.title) LIKE $2 OR LOWER(i.body_text) LIKE $2)
         ), paged AS (
           SELECT *
             FROM filtered
            ORDER BY created_at DESC,inquiry_id DESC
            LIMIT (SELECT page_size FROM effective_settings)
           OFFSET (($4::int - 1) * (SELECT page_size FROM effective_settings))
         )
         SELECT settings.page_size,
                COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,inquiry_id DESC) FROM paged),'[]'::jsonb) AS items,
                (SELECT COUNT(*)::int FROM filtered) AS total_count
           FROM effective_settings settings`,
        [trim(memberUid), searchPattern, safeRequestedPageSize, safePage],
      );
      const row = result.rows[0] || {};
      const safePageSize = normalizePageSize(row.page_size, 10);
      const rows = Array.isArray(row.items) ? row.items : [];
      return Object.freeze({
        items: Object.freeze(rows.map(mapInquirySummary)),
        totalCount: Number(row.total_count || 0),
        page: safePage,
        pageSize: safePageSize,
      });
    },

    async getMemberInquiry({ memberUid, publicId }) {
      const row = await getInquiryRow(pool, `i.public_id=$1 AND i.member_uid=$2 AND i.author_type='member' AND i.deleted_at IS NULL`, [trim(publicId), trim(memberUid)]);
      if (!row) return null;
      const [answers, navigation] = await Promise.all([
        listActiveAnswers(pool, row.inquiry_id),
        getInquiryNavigation(pool, { ownerType: 'member', memberUid, publicId }),
      ]);
      return mapInquiryDetail(row, answers, [], navigation);
    },

    async updateOwnedInquiry({ ownerType, memberUid = '', publicId, categoryId, title, bodyHtml, bodyText }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ownerClause = ownerType === 'member'
          ? `i.public_id=$1 AND i.member_uid=$2 AND i.author_type='member' AND i.deleted_at IS NULL`
          : `i.public_id=$1 AND i.author_type='guest' AND i.deleted_at IS NULL`;
        const ownerValues = ownerType === 'member' ? [trim(publicId), trim(memberUid)] : [trim(publicId)];
        const row = await getInquiryRow(client, ownerClause, ownerValues, { forUpdate: true });
        if (!row) throw repositoryError('inquiry_not_found', 'Inquiry was not found.', 404);
        if (Number(row.answer_count || 0) > 0) throw repositoryError('inquiry_answered_mutation_forbidden', 'Answered inquiries cannot be changed by the author.', 409);
        const category = await client.query(`SELECT category_id FROM app_inquiry_categories WHERE category_id=$1 AND deleted_at IS NULL`, [trim(categoryId)]);
        if (!category.rows[0]) throw repositoryError('inquiry_category_not_found', 'Inquiry category was not found.', 404);
        await client.query(
          `UPDATE app_inquiries SET category_id=$2,title=$3,body_html=$4,body_text=$5,updated_at=NOW()
            WHERE inquiry_id=$1`,
          [row.inquiry_id, trim(categoryId), trim(title), String(bodyHtml || ''), String(bodyText || '')],
        );
        await client.query('COMMIT');
        return ownerType === 'member'
          ? this.getMemberInquiry({ memberUid, publicId })
          : this.getGuestInquiry({ publicIds: [publicId], publicId });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteOwnedInquiry({ ownerType, memberUid = '', publicId, deletedBy }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ownerClause = ownerType === 'member'
          ? `i.public_id=$1 AND i.member_uid=$2 AND i.author_type='member' AND i.deleted_at IS NULL`
          : `i.public_id=$1 AND i.author_type='guest' AND i.deleted_at IS NULL`;
        const ownerValues = ownerType === 'member' ? [trim(publicId), trim(memberUid)] : [trim(publicId)];
        const row = await getInquiryRow(client, ownerClause, ownerValues, { forUpdate: true });
        if (!row) throw repositoryError('inquiry_not_found', 'Inquiry was not found.', 404);
        if (Number(row.answer_count || 0) > 0) throw repositoryError('inquiry_answered_delete_forbidden', 'Answered inquiries cannot be deleted by the author.', 409);
        await client.query(
          `UPDATE app_inquiries SET deleted_at=NOW(),deleted_by=$2,delete_actor_type=$3,updated_at=NOW()
            WHERE inquiry_id=$1`,
          [row.inquiry_id, trim(deletedBy), ownerType],
        );
        await client.query('COMMIT');
        return Object.freeze({ publicId: trim(publicId), deleted: true });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async findGuestCandidates({ name, method, identifier }) {
      const byEmail = method === 'email';
      const result = await pool.query(
        `SELECT inquiry_id,public_id,guest_password_hash
           FROM app_inquiries
          WHERE author_type='guest' AND deleted_at IS NULL
            AND LOWER(author_name)=LOWER($1)
            AND ${byEmail ? 'LOWER(author_email)=LOWER($2)' : 'author_phone=$2'}
          ORDER BY created_at DESC,inquiry_id DESC
          LIMIT 50`,
        [trim(name), byEmail ? lower(identifier) : trim(identifier)],
      );
      return Object.freeze(result.rows.map((row) => Object.freeze({
        inquiryId: row.inquiry_id || '',
        publicId: row.public_id || '',
        passwordHash: row.guest_password_hash || '',
      })));
    },

    async createGuestSession({ tokenHash, publicIds, expiresAt }) {
      await pool.query(`DELETE FROM app_inquiry_guest_sessions WHERE expires_at<=NOW()`);
      await pool.query(
        `INSERT INTO app_inquiry_guest_sessions (token_hash,scope_public_ids,created_at,expires_at)
         VALUES ($1,$2::jsonb,NOW(),$3)`,
        [trim(tokenHash), JSON.stringify(publicIds || []), expiresAt],
      );
      return Object.freeze({ expiresAt });
    },

    async getGuestSession(tokenHash) {
      await pool.query(`DELETE FROM app_inquiry_guest_sessions WHERE expires_at<=NOW()`);
      const result = await pool.query(
        `SELECT token_hash,scope_public_ids,created_at,expires_at
           FROM app_inquiry_guest_sessions
          WHERE token_hash=$1 AND expires_at>NOW()`,
        [trim(tokenHash)],
      );
      const row = result.rows[0];
      if (!row) return null;
      return Object.freeze({
        publicIds: Object.freeze(safeJsonArray(row.scope_public_ids).map((id) => trim(id)).filter(Boolean)),
        createdAt: row.created_at || null,
        expiresAt: row.expires_at || null,
      });
    },

    async revokeGuestSession(tokenHash) {
      await pool.query(`DELETE FROM app_inquiry_guest_sessions WHERE token_hash=$1`, [trim(tokenHash)]);
    },

    async listGuestInquiries({ publicIds, page, pageSize }) {
      const ids = [...new Set((publicIds || []).map(trim).filter(Boolean))];
      const safePage = normalizePage(page);
      const settings = await getSettings();
      const safePageSize = normalizePageSize(pageSize, settings.postsPerPage);
      if (ids.length === 0) return Object.freeze({ items: [], totalCount: 0, page: safePage, pageSize: safePageSize });
      const offset = (safePage - 1) * safePageSize;
      const [rowsResult, countResult] = await Promise.all([
        pool.query(
          `${INQUIRY_WITH_STATUS_SELECT}
            WHERE i.public_id=ANY($1::text[]) AND i.author_type='guest' AND i.deleted_at IS NULL
            ORDER BY i.created_at DESC,i.inquiry_id DESC
            LIMIT $2 OFFSET $3`,
          [ids, safePageSize, offset],
        ),
        pool.query(`SELECT COUNT(*)::int AS count FROM app_inquiries WHERE public_id=ANY($1::text[]) AND author_type='guest' AND deleted_at IS NULL`, [ids]),
      ]);
      return Object.freeze({
        items: Object.freeze(rowsResult.rows.map(mapInquirySummary)),
        totalCount: Number(countResult.rows[0]?.count || 0),
        page: safePage,
        pageSize: safePageSize,
      });
    },

    async getGuestInquiry({ publicIds, publicId }) {
      const ids = [...new Set((publicIds || []).map(trim).filter(Boolean))];
      if (!ids.includes(trim(publicId))) return null;
      const row = await getInquiryRow(pool, `i.public_id=$1 AND i.author_type='guest' AND i.deleted_at IS NULL`, [trim(publicId)]);
      if (!row) return null;
      const [answers, consents, navigation] = await Promise.all([
        listActiveAnswers(pool, row.inquiry_id),
        listConsents(pool, row.inquiry_id),
        getInquiryNavigation(pool, { ownerType: 'guest', publicIds: ids, publicId }),
      ]);
      return mapInquiryDetail(row, answers, consents, navigation);
    },

    async listAdminInquiries({ search = '', status = 'all', categoryId = 'all', page = 1, pageSize = 10 }) {
      const safePage = normalizePage(page);
      const safePageSize = normalizePageSize(pageSize, 10);
      const normalizedSearch = lower(search);
      const normalizedStatus = trim(status).toLowerCase();
      const normalizedCategory = trim(categoryId);
      const offset = (safePage - 1) * safePageSize;
      const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : null;
      const result = await pool.query(
        `WITH scoped AS (
           SELECT i.*,c.name AS category_name,
                  COALESCE(a.answer_count,0)::int AS answer_count,
                  a.latest_answer_at,
                  CASE WHEN COALESCE(a.answer_count,0)>=2 THEN 'additional'
                       WHEN COALESCE(a.answer_count,0)=1 THEN 'answered'
                       ELSE 'waiting' END AS inquiry_status
             FROM app_inquiries i
             JOIN app_inquiry_categories c ON c.category_id=i.category_id
             LEFT JOIN LATERAL (
               SELECT COUNT(*)::int AS answer_count,MAX(created_at) AS latest_answer_at
                 FROM app_inquiry_answers ans
                WHERE ans.inquiry_id=i.inquiry_id AND ans.deleted_at IS NULL
             ) a ON TRUE
            WHERE i.deleted_at IS NULL
              AND ($1::text IS NULL OR LOWER(i.title) LIKE $1 OR LOWER(i.body_text) LIKE $1 OR LOWER(i.author_name) LIKE $1 OR LOWER(i.author_email) LIKE $1 OR LOWER(i.author_phone) LIKE $1)
              AND ($2::text='' OR $2::text='all' OR i.category_id=$2)
         ), filtered AS (
           SELECT * FROM scoped WHERE ($3::text='all' OR inquiry_status=$3)
         )
         SELECT *,COUNT(*) OVER()::int AS total_count
           FROM filtered
          ORDER BY created_at DESC,inquiry_id DESC
          LIMIT $4 OFFSET $5`,
        [searchPattern, normalizedCategory, ['waiting','answered','additional'].includes(normalizedStatus) ? normalizedStatus : 'all', safePageSize, offset],
      );
      return Object.freeze({
        items: Object.freeze(result.rows.map(mapInquirySummary)),
        totalCount: Number(result.rows[0]?.total_count || 0),
        page: safePage,
        pageSize: safePageSize,
      });
    },

    async getAdminInquiry(publicId) {
      const row = await getInquiryRow(pool, `i.public_id=$1 AND i.deleted_at IS NULL`, [trim(publicId)]);
      if (!row) return null;
      const [answers, consents] = await Promise.all([
        listActiveAnswers(pool, row.inquiry_id),
        listConsents(pool, row.inquiry_id),
      ]);
      return mapInquiryDetail(row, answers, consents);
    },

    async addAnswer({ answerId, publicId, bodyHtml, bodyText, adminIdentityId, adminDisplayName }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inquiry = await client.query(`SELECT inquiry_id FROM app_inquiries WHERE public_id=$1 AND deleted_at IS NULL FOR UPDATE`, [trim(publicId)]);
        if (!inquiry.rows[0]) throw repositoryError('inquiry_not_found', 'Inquiry was not found.', 404);
        await client.query(
          `INSERT INTO app_inquiry_answers
             (answer_id,inquiry_id,body_html,body_text,admin_identity_id,admin_display_name,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
          [trim(answerId), inquiry.rows[0].inquiry_id, String(bodyHtml || ''), String(bodyText || ''), trim(adminIdentityId), trim(adminDisplayName)],
        );
        await client.query(`UPDATE app_inquiries SET updated_at=NOW() WHERE inquiry_id=$1`, [inquiry.rows[0].inquiry_id]);
        await client.query('COMMIT');
        return this.getAdminInquiry(publicId);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async updateAnswer({ publicId, answerId, bodyHtml, bodyText, actorId }) {
      const result = await pool.query(
        `UPDATE app_inquiry_answers ans
            SET body_html=$3,body_text=$4,updated_at=NOW()
           FROM app_inquiries i
          WHERE ans.answer_id=$1 AND ans.inquiry_id=i.inquiry_id AND i.public_id=$2
            AND i.deleted_at IS NULL AND ans.deleted_at IS NULL
          RETURNING ans.answer_id`,
        [trim(answerId), trim(publicId), String(bodyHtml || ''), String(bodyText || '')],
      );
      if (!result.rows[0]) throw repositoryError('inquiry_answer_not_found', 'Inquiry answer was not found.', 404);
      return this.getAdminInquiry(publicId);
    },

    async deleteAnswer({ publicId, answerId, actorId }) {
      const result = await pool.query(
        `UPDATE app_inquiry_answers ans
            SET deleted_at=NOW(),deleted_by=$3,delete_actor_type='admin',updated_at=NOW()
           FROM app_inquiries i
          WHERE ans.answer_id=$1 AND ans.inquiry_id=i.inquiry_id AND i.public_id=$2
            AND i.deleted_at IS NULL AND ans.deleted_at IS NULL
          RETURNING ans.answer_id`,
        [trim(answerId), trim(publicId), trim(actorId)],
      );
      if (!result.rows[0]) throw repositoryError('inquiry_answer_not_found', 'Inquiry answer was not found.', 404);
      return this.getAdminInquiry(publicId);
    },

    async deleteAdminInquiry({ publicId, actorId }) {
      const result = await pool.query(
        `UPDATE app_inquiries SET deleted_at=NOW(),deleted_by=$2,delete_actor_type='admin',updated_at=NOW()
          WHERE public_id=$1 AND deleted_at IS NULL
          RETURNING public_id`,
        [trim(publicId), trim(actorId)],
      );
      if (!result.rows[0]) throw repositoryError('inquiry_not_found', 'Inquiry was not found.', 404);
      return Object.freeze({ publicId: result.rows[0].public_id, deleted: true });
    },
  });
};

export { statusFromCount };
