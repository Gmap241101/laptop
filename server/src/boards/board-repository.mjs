const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();

const repositoryError = (code, message, details = {}) => {
  const error = new Error(message);
  error.name = 'BoardRepositoryError';
  error.code = code;
  Object.assign(error, details);
  return error;
};

const assertStoredRichTextHtml = ({ expectedHtml = '', actualHtml = '', code } = {}) => {
  const expected = String(expectedHtml || '');
  const actual = String(actualHtml || '');
  if (actual === expected) return;
  const error = repositoryError(code || 'board_rich_text_storage_roundtrip_mismatch', 'Stored board rich-text HTML did not match the submitted HTML.');
  error.status = 500;
  error.expectedLength = expected.length;
  error.actualLength = actual.length;
  throw error;
};

const mapPost = (row) => row ? Object.freeze({
  id: row.post_id,
  boardType: row.board_type,
  categoryId: row.category_id || '',
  title: row.title,
  content: row.content_text || '',
  contentText: row.content_text || '',
  contentHtml: row.content_html || '',
  contentFormat: row.content_format || 'rich-html-v1',
  isPinned: Boolean(row.is_pinned),
  authorUid: row.author_uid || '',
  authorName: row.author_name || '',
  viewCount: Number(row.view_count || 0),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  sourceMode: row.source_mode || '',
  mirrorState: row.mirror_state || '',
  attachments: Object.freeze((Array.isArray(row.attachments) ? row.attachments : []).map((attachment) => Object.freeze({
    id: attachment?.id || attachment?.attachment_id || '',
    name: attachment?.name || attachment?.display_name || '',
    downloadPath: attachment?.downloadPath || attachment?.download_path || '',
  })).filter((attachment) => attachment.id && attachment.name)),
}) : null;

const mapCategory = (row) => row ? Object.freeze({
  id: row.category_id,
  name: row.name,
  order: Number(row.sort_order || 0),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  sourceMode: row.source_mode || '',
}) : null;

const normalizePage = (value) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
};
const normalizePageSize = (value, fallback = 10, maximum = 50) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 5 && parsed <= maximum ? parsed : fallback;
};

const ensureBootstrapped = async (client) => {
  const result = await client.query(`SELECT scope, synced_at FROM app_board_status WHERE scope='all'`);
  if (!result.rows[0]) throw repositoryError('board_not_bootstrapped', 'Board domain has not been bootstrapped to PostgreSQL.');
  return result.rows[0];
};

const refreshSyncCounts = async () => {};

const mapConfig = (row, boardType, fallback) => Object.freeze({
  boardType,
  postsPerPage: normalizePageSize(row?.posts_per_page, fallback),
  sourceMode: row?.source_mode || 'postgresql-default',
  syncedAt: row?.synced_at || null,
  updatedAt: row?.updated_at || null,
});

const getConfig = async (client, boardType, fallback) => {
  const result = await client.query(
    `SELECT board_type, posts_per_page, source_mode, synced_at, updated_at
       FROM app_board_configs
      WHERE board_type=$1`,
    [boardType],
  );
  return mapConfig(result.rows[0], boardType, fallback);
};

const searchClause = (search, startIndex) => {
  const normalized = trim(search);
  if (!normalized) return { sql: '', values: [] };
  return {
    sql: ` AND (lower(title) LIKE $${startIndex} OR lower(content_text) LIKE $${startIndex})`,
    values: [`%${lower(normalized)}%`],
  };
};

export const createBoardRepository = (pool, { attachmentRepository = null } = {}) => {
  const attachmentStore = attachmentRepository || Object.freeze({
    async syncOwnerAttachments() {},
    async deleteOwnerAttachments() {},
    async listForOwner() { return Object.freeze([]); },
  });

  return Object.freeze({
  async getStatus() {
    const result = await pool.query(
      `SELECT scope, notice_count, faq_count, faq_category_count, source_hash, source_mode, last_actor_clerk_user_id, synced_at
         FROM app_board_status WHERE scope='all'`,
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      source: 'postgresql',
      synchronized: true,
      noticeCount: Number(row.notice_count || 0),
      faqCount: Number(row.faq_count || 0),
      faqCategoryCount: Number(row.faq_category_count || 0),
      sourceHash: row.source_hash || '',
      sourceMode: row.source_mode || '',
      syncedAt: row.synced_at || null,
    });
  },

  async listNotice({ search = '', page = 1, pageSize = null, pinnedLimit = 20 } = {}) {
    const safePage = normalizePage(page);
    const safePinnedLimit = Math.max(1, Math.min(20, Math.trunc(Number(pinnedLimit) || 20)));
    const normalizedSearch = trim(search);
    const maximumPageSize = normalizedSearch ? 500 : 50;
    const requestedPageSize = Math.trunc(Number(pageSize));
    const safeRequestedPageSize = Number.isFinite(requestedPageSize) && requestedPageSize >= 5 && requestedPageSize <= maximumPageSize
      ? requestedPageSize
      : null;
    const searchPattern = normalizedSearch ? `%${lower(normalizedSearch)}%` : null;

    const result = await pool.query(
      `WITH board_meta AS (
         SELECT
           sync.synced_at AS board_synced_at,
           config.posts_per_page,
           config.source_mode,
           config.synced_at AS config_synced_at,
           config.updated_at AS config_updated_at,
           CASE
             WHEN $1::int IS NOT NULL AND $1::int BETWEEN 5 AND $5::int THEN $1::int
             ELSE COALESCE(NULLIF(config.posts_per_page, 0), 10)
           END AS effective_page_size
         FROM app_board_status sync
         LEFT JOIN app_board_configs config ON config.board_type='notice'
         WHERE sync.scope='all'
       ), filtered AS (
         SELECT p.*,
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',a.attachment_id,
                      'name',a.display_name,
                      'downloadPath','/api/attachments/' || a.attachment_id || '/download'
                    ) ORDER BY a.sort_order,a.created_at,a.attachment_id
                  )
                    FROM app_secure_attachments a
                   WHERE a.owner_type='notice' AND a.owner_id=p.post_id AND a.deleted_at IS NULL
                ), '[]'::jsonb) AS attachments
           FROM app_board_posts p
          WHERE p.board_type='notice'
            AND ($3::text IS NULL OR lower(p.title) LIKE $3 OR lower(p.content_text) LIKE $3)
       ), pinned_posts AS (
         SELECT *
           FROM filtered
          WHERE is_pinned=TRUE
          ORDER BY created_at DESC, post_id
          LIMIT $4::int
       ), regular_posts AS (
         SELECT *
           FROM filtered
          WHERE is_pinned=FALSE
          ORDER BY created_at DESC, post_id
          LIMIT (SELECT effective_page_size FROM board_meta)
          OFFSET (($2::int - 1) * (SELECT effective_page_size FROM board_meta))
       )
       SELECT
         meta.board_synced_at,
         meta.posts_per_page AS config_posts_per_page,
         meta.source_mode AS config_source_mode,
         meta.config_synced_at,
         meta.config_updated_at,
         meta.effective_page_size,
         COALESCE((SELECT jsonb_agg(to_jsonb(pinned_posts) ORDER BY created_at DESC, post_id) FROM pinned_posts), '[]'::jsonb) AS pinned_posts,
         COALESCE((SELECT jsonb_agg(to_jsonb(regular_posts) ORDER BY created_at DESC, post_id) FROM regular_posts), '[]'::jsonb) AS regular_posts,
         (SELECT COUNT(*)::int FROM filtered WHERE is_pinned=FALSE) AS total_regular_count
       FROM board_meta meta`,
      [safeRequestedPageSize, safePage, searchPattern, safePinnedLimit, maximumPageSize],
    );
    const row = result.rows[0];
    if (!row?.board_synced_at) {
      throw repositoryError('board_not_bootstrapped', 'Board domain has not been bootstrapped to PostgreSQL.');
    }
    const config = mapConfig({
      posts_per_page: row.config_posts_per_page,
      source_mode: row.config_source_mode,
      synced_at: row.config_synced_at,
      updated_at: row.config_updated_at,
    }, 'notice', 10);
    const safePageSize = normalizePageSize(row.effective_page_size, config.postsPerPage, maximumPageSize);
    const offset = (safePage - 1) * safePageSize;
    const pinnedRows = Array.isArray(row.pinned_posts) ? row.pinned_posts : [];
    const regularRows = Array.isArray(row.regular_posts) ? row.regular_posts : [];
    const totalCount = Number(row.total_regular_count || 0);
    return Object.freeze({
      source: 'postgresql', authoritative: true, boardType: 'notice', config,
      pinnedPosts: pinnedRows.map(mapPost), regularPosts: regularRows.map(mapPost),
      totalRegularCount: totalCount, page: safePage, pageSize: safePageSize,
      hasNextPage: offset + regularRows.length < totalCount,
      syncedAt: row.board_synced_at || null,
    });
  },

  async getNoticePost(postId) {
    await ensureBootstrapped(pool);
    const result = await pool.query(
      `WITH ordered AS (
         SELECT *,
                LAG(post_id) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS previous_post_id,
                LAG(title) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS previous_title,
                LAG(author_name) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS previous_author_name,
                LAG(created_at) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS previous_created_at,
                LAG(view_count) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS previous_view_count,
                LEAD(post_id) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS next_post_id,
                LEAD(title) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS next_title,
                LEAD(author_name) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS next_author_name,
                LEAD(created_at) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS next_created_at,
                LEAD(view_count) OVER (ORDER BY is_pinned DESC, created_at DESC, post_id) AS next_view_count
           FROM app_board_posts
          WHERE board_type='notice'
       )
       SELECT ordered.*,
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id',a.attachment_id,
                    'name',a.display_name,
                    'downloadPath','/api/attachments/' || a.attachment_id || '/download'
                  ) ORDER BY a.sort_order,a.created_at,a.attachment_id
                )
                  FROM app_secure_attachments a
                 WHERE a.owner_type='notice' AND a.owner_id=ordered.post_id AND a.deleted_at IS NULL
              ), '[]'::jsonb) AS attachments
         FROM ordered
        WHERE post_id=$1`,
      [trim(postId)],
    );
    const row = result.rows[0];
    const post = mapPost(row);
    if (!post) return null;
    const mapNavigationItem = (prefix) => row?.[`${prefix}_post_id`] ? Object.freeze({
      id: row[`${prefix}_post_id`],
      title: row[`${prefix}_title`] || '',
      authorName: row[`${prefix}_author_name`] || '',
      createdAt: row[`${prefix}_created_at`] || null,
      viewCount: Number(row[`${prefix}_view_count`] || 0),
    }) : null;
    return Object.freeze({
      ...post,
      navigation: Object.freeze({
        previous: mapNavigationItem('previous'),
        next: mapNavigationItem('next'),
      }),
    });
  },

  async incrementNoticeView(postId) {
    const result = await pool.query(
      `UPDATE app_board_posts
          SET view_count=view_count+1, updated_at=updated_at
        WHERE board_type='notice' AND post_id=$1
        RETURNING view_count`,
      [trim(postId)],
    );
    if (!result.rows[0]) throw repositoryError('notice_post_not_found', 'Notice post was not found.');
    return Number(result.rows[0].view_count || 0);
  },

  async listFaq({ search = '', page = 1, pageSize = null, categoryId = '', searchWithinCategory = false, pinnedLimit = 20 } = {}) {
    const safePage = normalizePage(page);
    const safePinnedLimit = Math.max(1, Math.min(20, Math.trunc(Number(pinnedLimit) || 20)));
    const normalizedCategory = trim(categoryId);
    const normalizedSearch = trim(search);
    const maximumPageSize = normalizedSearch ? 500 : 50;
    const requestedPageSize = Math.trunc(Number(pageSize));
    const safeRequestedPageSize = Number.isFinite(requestedPageSize) && requestedPageSize >= 5 && requestedPageSize <= maximumPageSize
      ? requestedPageSize
      : null;
    const searchPattern = normalizedSearch ? `%${lower(normalizedSearch)}%` : null;

    const result = await pool.query(
      `WITH board_meta AS (
         SELECT
           sync.synced_at AS board_synced_at,
           config.posts_per_page,
           config.source_mode,
           config.synced_at AS config_synced_at,
           config.updated_at AS config_updated_at,
           CASE
             WHEN $1::int IS NOT NULL AND $1::int BETWEEN 5 AND $7::int THEN $1::int
             ELSE COALESCE(NULLIF(config.posts_per_page, 0), 10)
           END AS effective_page_size
         FROM app_board_status sync
         LEFT JOIN app_board_configs config ON config.board_type='faq'
         WHERE sync.scope='all'
       ), filtered AS (
         SELECT p.*,
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',a.attachment_id,
                      'name',a.display_name,
                      'downloadPath','/api/attachments/' || a.attachment_id || '/download'
                    ) ORDER BY a.sort_order,a.created_at,a.attachment_id
                  )
                    FROM app_secure_attachments a
                   WHERE a.owner_type='faq' AND a.owner_id=p.post_id AND a.deleted_at IS NULL
                ), '[]'::jsonb) AS attachments
           FROM app_board_posts p
          WHERE p.board_type='faq'
            AND (
              $3::text='' OR $3::text='all'
              OR ($4::text IS NOT NULL AND NOT $5::boolean)
              OR p.category_id=$3
            )
            AND ($4::text IS NULL OR lower(p.title) LIKE $4 OR lower(p.content_text) LIKE $4)
       ), pinned_posts AS (
         SELECT *
           FROM filtered
          WHERE is_pinned=TRUE
          ORDER BY created_at DESC, post_id
          LIMIT $6::int
       ), regular_posts AS (
         SELECT *
           FROM filtered
          WHERE is_pinned=FALSE
          ORDER BY created_at DESC, post_id
          LIMIT (SELECT effective_page_size FROM board_meta)
          OFFSET (($2::int - 1) * (SELECT effective_page_size FROM board_meta))
       ), categories AS (
         SELECT COALESCE(
           jsonb_agg(to_jsonb(category_rows) ORDER BY sort_order, lower(name), category_id),
           '[]'::jsonb
         ) AS rows
         FROM (
           SELECT * FROM app_faq_categories ORDER BY sort_order, lower(name), category_id
         ) AS category_rows
       )
       SELECT
         meta.board_synced_at,
         meta.posts_per_page AS config_posts_per_page,
         meta.source_mode AS config_source_mode,
         meta.config_synced_at,
         meta.config_updated_at,
         meta.effective_page_size,
         categories.rows AS categories,
         COALESCE((SELECT jsonb_agg(to_jsonb(pinned_posts) ORDER BY created_at DESC, post_id) FROM pinned_posts), '[]'::jsonb) AS pinned_posts,
         COALESCE((SELECT jsonb_agg(to_jsonb(regular_posts) ORDER BY created_at DESC, post_id) FROM regular_posts), '[]'::jsonb) AS regular_posts,
         (SELECT COUNT(*)::int FROM filtered WHERE is_pinned=FALSE) AS total_regular_count
       FROM board_meta meta
       CROSS JOIN categories`,
      [safeRequestedPageSize, safePage, normalizedCategory, searchPattern, Boolean(searchWithinCategory), safePinnedLimit, maximumPageSize],
    );
    const row = result.rows[0];
    if (!row?.board_synced_at) {
      throw repositoryError('board_not_bootstrapped', 'Board domain has not been bootstrapped to PostgreSQL.');
    }
    const config = mapConfig({
      posts_per_page: row.config_posts_per_page,
      source_mode: row.config_source_mode,
      synced_at: row.config_synced_at,
      updated_at: row.config_updated_at,
    }, 'faq', 10);
    const safePageSize = normalizePageSize(row.effective_page_size, config.postsPerPage, maximumPageSize);
    const offset = (safePage - 1) * safePageSize;
    const pinnedRows = Array.isArray(row.pinned_posts) ? row.pinned_posts : [];
    const regularRows = Array.isArray(row.regular_posts) ? row.regular_posts : [];
    const categoryRows = Array.isArray(row.categories) ? row.categories : [];
    const totalCount = Number(row.total_regular_count || 0);
    return Object.freeze({
      source: 'postgresql', authoritative: true, boardType: 'faq', config,
      categories: categoryRows.map(mapCategory),
      pinnedPosts: pinnedRows.map(mapPost), regularPosts: regularRows.map(mapPost),
      totalRegularCount: totalCount, page: safePage, pageSize: safePageSize,
      hasNextPage: offset + regularRows.length < totalCount,
      syncedAt: row.board_synced_at || null,
    });
  },

  async saveNoticePostAuthoritative({ post }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board:notice:${post.id}`]);
      const currentResult = await client.query(`SELECT * FROM app_board_posts WHERE board_type='notice' AND post_id=$1 FOR UPDATE`, [post.id]);
      const previous = mapPost(currentResult.rows[0]);
      if (post.isEditing && !previous) throw repositoryError('notice_post_not_found', 'Notice post was not found.');
      if (!post.isEditing && previous) throw repositoryError('notice_post_already_exists', 'Notice post already exists.');
      if (previous) {
        await client.query(
          `UPDATE app_board_posts SET title=$2,content_text=$3,content_html=$4,content_format=$5,is_pinned=$6,
             author_uid=$7,author_name=$8,source_mode='postgresql-authoritative',mirror_state='retired',updated_at=NOW()
           WHERE post_id=$1`,
          [post.id, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid || previous.authorUid, post.authorName || previous.authorName],
        );
      } else {
        await client.query(
          `INSERT INTO app_board_posts
             (post_id,board_type,category_id,title,content_text,content_html,content_format,is_pinned,author_uid,author_name,view_count,source_mode,mirror_state,created_at,updated_at)
           VALUES ($1,'notice',NULL,$2,$3,$4,$5,$6,$7,$8,0,'postgresql-authoritative','retired',NOW(),NOW())`,
          [post.id, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid, post.authorName],
        );
      }
      if (Array.isArray(post.attachments)) {
        await attachmentStore.syncOwnerAttachments(client, { ownerType: 'notice', ownerId: post.id, attachments: post.attachments, createdBy: post.actorClerkUserId });
      }
      const nextResult = await client.query(`SELECT * FROM app_board_posts WHERE post_id=$1`, [post.id]);
      const nextBase = mapPost(nextResult.rows[0]);
      assertStoredRichTextHtml({ expectedHtml: post.contentHtml, actualHtml: nextBase?.contentHtml, code: 'notice_content_storage_roundtrip_mismatch' });
      const next = Object.freeze({ ...nextBase, attachments: await attachmentStore.listForOwner('notice', post.id, client) });
      await client.query(`UPDATE app_board_posts SET mirror_state='retired',synced_at=NOW() WHERE post_id=$1`, [post.id]);
      await refreshSyncCounts(client, post.actorClerkUserId || '');
      await client.query('COMMIT');
      return { post: next, previous };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  },

  async deleteNoticePostAuthoritative({ postId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board:notice:${trim(postId)}`]);
      const result = await client.query(`SELECT * FROM app_board_posts WHERE board_type='notice' AND post_id=$1 FOR UPDATE`, [trim(postId)]);
      const previous = mapPost(result.rows[0]);
      if (!previous) throw repositoryError('notice_post_not_found', 'Notice post was not found.');
      await attachmentStore.deleteOwnerAttachments(client, 'notice', previous.id);
      await client.query(`DELETE FROM app_board_posts WHERE post_id=$1`, [previous.id]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { deletedPost: previous };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async saveFaqPostAuthoritative({ post }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board:faq:${post.id}`]);
      const categoryResult = await client.query(`SELECT category_id FROM app_faq_categories WHERE category_id=$1`, [post.categoryId]);
      if (!categoryResult.rows[0]) throw repositoryError('faq_category_not_found', 'FAQ category was not found.');
      const currentResult = await client.query(`SELECT * FROM app_board_posts WHERE board_type='faq' AND post_id=$1 FOR UPDATE`, [post.id]);
      const previous = mapPost(currentResult.rows[0]);
      if (post.isEditing && !previous) throw repositoryError('faq_post_not_found', 'FAQ post was not found.');
      if (!post.isEditing && previous) throw repositoryError('faq_post_already_exists', 'FAQ post already exists.');
      if (previous) {
        await client.query(
          `UPDATE app_board_posts SET category_id=$2,title=$3,content_text=$4,content_html=$5,content_format=$6,is_pinned=$7,
             author_uid=$8,author_name=$9,source_mode='postgresql-authoritative',mirror_state='retired',updated_at=NOW()
           WHERE post_id=$1`,
          [post.id, post.categoryId, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid || previous.authorUid, post.authorName || previous.authorName],
        );
      } else {
        await client.query(
          `INSERT INTO app_board_posts
             (post_id,board_type,category_id,title,content_text,content_html,content_format,is_pinned,author_uid,author_name,view_count,source_mode,mirror_state,created_at,updated_at)
           VALUES ($1,'faq',$2,$3,$4,$5,$6,$7,$8,$9,0,'postgresql-authoritative','retired',NOW(),NOW())`,
          [post.id, post.categoryId, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid, post.authorName],
        );
      }
      if (Array.isArray(post.attachments)) {
        await attachmentStore.syncOwnerAttachments(client, { ownerType: 'faq', ownerId: post.id, attachments: post.attachments, createdBy: post.actorClerkUserId });
      }
      const nextResult = await client.query(`SELECT * FROM app_board_posts WHERE post_id=$1`, [post.id]);
      const nextBase = mapPost(nextResult.rows[0]);
      assertStoredRichTextHtml({ expectedHtml: post.contentHtml, actualHtml: nextBase?.contentHtml, code: 'faq_content_storage_roundtrip_mismatch' });
      const next = Object.freeze({ ...nextBase, attachments: await attachmentStore.listForOwner('faq', post.id, client) });
      await client.query(`UPDATE app_board_posts SET mirror_state='retired',synced_at=NOW() WHERE post_id=$1`, [post.id]);
      await refreshSyncCounts(client, post.actorClerkUserId || '');
      await client.query('COMMIT');
      return { post: next, previous };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async deleteFaqPostAuthoritative({ postId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board:faq:${trim(postId)}`]);
      const result = await client.query(`SELECT * FROM app_board_posts WHERE board_type='faq' AND post_id=$1 FOR UPDATE`, [trim(postId)]);
      const previous = mapPost(result.rows[0]);
      if (!previous) throw repositoryError('faq_post_not_found', 'FAQ post was not found.');
      await attachmentStore.deleteOwnerAttachments(client, 'faq', previous.id);
      await client.query(`DELETE FROM app_board_posts WHERE post_id=$1`, [previous.id]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { deletedPost: previous };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async saveConfigAuthoritative({ boardType, postsPerPage }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board-config:${boardType}`]);
      const safePageSize = normalizePageSize(postsPerPage, 10);
      await client.query(
        `INSERT INTO app_board_configs (board_type,posts_per_page,source_mode,synced_at,updated_at)
         VALUES ($1,$2,'postgresql-authoritative',NOW(),NOW())
         ON CONFLICT (board_type) DO UPDATE SET posts_per_page=EXCLUDED.posts_per_page,source_mode='postgresql-authoritative',updated_at=NOW()`,
        [boardType, safePageSize],
      );
      const config = await getConfig(client, boardType, safePageSize);
      await client.query(`UPDATE app_board_configs SET synced_at=NOW() WHERE board_type=$1`, [boardType]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { config };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async saveFaqCategoryAuthoritative({ category }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`faq-category:${category.id}`]);
      const currentResult = await client.query(`SELECT * FROM app_faq_categories WHERE category_id=$1 FOR UPDATE`, [category.id]);
      const previous = mapCategory(currentResult.rows[0]);
      if (category.isEditing && !previous) throw repositoryError('faq_category_not_found', 'FAQ category was not found.');
      if (!category.isEditing && previous) throw repositoryError('faq_category_already_exists', 'FAQ category already exists.');
      if (previous) {
        await client.query(
          `UPDATE app_faq_categories SET name=$2,source_mode='postgresql-authoritative',updated_at=NOW() WHERE category_id=$1`,
          [category.id, category.name],
        );
      } else {
        const maxResult = await client.query(`SELECT COALESCE(MAX(sort_order),0)::int AS max_order FROM app_faq_categories`);
        const sortOrder = Number(maxResult.rows[0]?.max_order || 0) + 1;
        await client.query(
          `INSERT INTO app_faq_categories (category_id,name,sort_order,source_mode,created_at,updated_at)
           VALUES ($1,$2,$3,'postgresql-authoritative',NOW(),NOW())`,
          [category.id, category.name, sortOrder],
        );
      }
      const nextResult = await client.query(`SELECT * FROM app_faq_categories WHERE category_id=$1`, [category.id]);
      const next = mapCategory(nextResult.rows[0]);
      await client.query(`UPDATE app_faq_categories SET synced_at=NOW() WHERE category_id=$1`, [category.id]);
      await refreshSyncCounts(client, category.actorClerkUserId || '');
      await client.query('COMMIT');
      return { category: next, previous };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code === '23505') throw repositoryError('faq_category_duplicate_name', 'FAQ category name already exists.');
      throw error;
    } finally { client.release(); }
  },

  async deleteFaqCategoryAuthoritative({ categoryId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`faq-category:${trim(categoryId)}`]);
      const currentResult = await client.query(`SELECT * FROM app_faq_categories WHERE category_id=$1 FOR UPDATE`, [trim(categoryId)]);
      const previous = mapCategory(currentResult.rows[0]);
      if (!previous) throw repositoryError('faq_category_not_found', 'FAQ category was not found.');
      const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM app_board_posts WHERE board_type='faq' AND category_id=$1`, [previous.id]);
      const postCount = Number(countResult.rows[0]?.count || 0);
      if (postCount > 0) throw repositoryError('faq_category_in_use', 'FAQ category is still in use.', { postCount });
      await client.query(`DELETE FROM app_faq_categories WHERE category_id=$1`, [previous.id]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { deletedCategory: previous };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },
  });
};
