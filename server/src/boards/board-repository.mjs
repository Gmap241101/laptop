import { createHash } from 'node:crypto';

const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();

const repositoryError = (code, message, details = {}) => {
  const error = new Error(message);
  error.name = 'BoardRepositoryError';
  error.code = code;
  Object.assign(error, details);
  return error;
};

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};

const sourceHash = (payload) => createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');

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
  const result = await client.query(`SELECT scope, synced_at FROM app_board_syncs WHERE scope='all'`);
  if (!result.rows[0]) throw repositoryError('board_not_bootstrapped', 'Board domain has not been bootstrapped to PostgreSQL.');
  return result.rows[0];
};

const refreshSyncCounts = async (client, actorClerkUserId = '') => {
  const counts = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE board_type='notice')::int AS notice_count,
      COUNT(*) FILTER (WHERE board_type='faq')::int AS faq_count
    FROM app_board_posts
  `);
  const categoryCount = await client.query(`SELECT COUNT(*)::int AS count FROM app_faq_categories`);
  await client.query(
    `UPDATE app_board_syncs
        SET notice_count=$1, faq_count=$2, faq_category_count=$3,
            source_mode='postgresql-authoritative',
            last_actor_clerk_user_id=CASE WHEN $4='' THEN last_actor_clerk_user_id ELSE $4 END,
            synced_at=NOW(), updated_at=NOW()
      WHERE scope='all'`,
    [Number(counts.rows[0]?.notice_count || 0), Number(counts.rows[0]?.faq_count || 0), Number(categoryCount.rows[0]?.count || 0), trim(actorClerkUserId)],
  );
};

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

export const createBoardRepository = (pool) => Object.freeze({
  async bootstrap({ noticeConfig, noticePosts, faqConfig, faqCategories, faqPosts, actorClerkUserId = '' }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('phase26-board-bootstrap'))`);
      await client.query(`DELETE FROM app_board_posts`);
      await client.query(`DELETE FROM app_faq_categories`);
      await client.query(`DELETE FROM app_board_configs`);

      await client.query(
        `INSERT INTO app_board_configs (board_type, posts_per_page, source_mode, source_updated_at, synced_at)
         VALUES ('notice',$1,'firestore-admin-bootstrap',$2::timestamptz,NOW()),
                ('faq',$3,'firestore-admin-bootstrap',$4::timestamptz,NOW())`,
        [
          normalizePageSize(noticeConfig?.postsPerPage, 10), noticeConfig?.updatedAt || null,
          normalizePageSize(faqConfig?.postsPerPage, 10), faqConfig?.updatedAt || null,
        ],
      );

      for (const category of faqCategories || []) {
        const id = trim(category?.id);
        const name = trim(category?.name);
        if (!id || !name) continue;
        await client.query(
          `INSERT INTO app_faq_categories
             (category_id, name, sort_order, source_mode, source_created_at, source_updated_at, synced_at, created_at, updated_at)
           VALUES ($1,$2,$3,'firestore-admin-bootstrap',$4::timestamptz,$5::timestamptz,NOW(),COALESCE($4::timestamptz,NOW()),COALESCE($5::timestamptz,NOW()))`,
          [id, name, Math.trunc(Number(category?.order) || 0), category?.createdAt || null, category?.updatedAt || null],
        );
      }

      const insertPost = async (boardType, post) => {
        const id = trim(post?.id);
        const title = trim(post?.title);
        if (!id || !title) return;
        const categoryId = boardType === 'faq' ? trim(post?.categoryId) : null;
        if (boardType === 'faq' && !categoryId) return;
        await client.query(
          `INSERT INTO app_board_posts
             (post_id, board_type, category_id, title, content_text, content_html, content_format, is_pinned,
              author_uid, author_name, view_count, source_mode, mirror_state, source_created_at, source_updated_at,
              synced_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'firestore-admin-bootstrap','synced',$12::timestamptz,$13::timestamptz,
                   NOW(),COALESCE($12::timestamptz,NOW()),COALESCE($13::timestamptz,COALESCE($12::timestamptz,NOW())))`,
          [
            id, boardType, categoryId, title, trim(post?.contentText || post?.content), trim(post?.contentHtml),
            trim(post?.contentFormat) || 'rich-html-v1', Boolean(post?.isPinned), trim(post?.authorUid), trim(post?.authorName),
            Math.max(0, Math.trunc(Number(post?.viewCount) || 0)), post?.createdAt || null, post?.updatedAt || null,
          ],
        );
      };
      for (const post of noticePosts || []) await insertPost('notice', post);
      for (const post of faqPosts || []) await insertPost('faq', post);

      const hash = sourceHash({ noticeConfig, noticePosts, faqConfig, faqCategories, faqPosts });
      await client.query(
        `INSERT INTO app_board_syncs
           (scope, notice_count, faq_count, faq_category_count, source_hash, source_mode, last_actor_clerk_user_id, synced_at, updated_at)
         VALUES ('all',$1,$2,$3,$4,'firestore-admin-bootstrap',$5,NOW(),NOW())
         ON CONFLICT (scope) DO UPDATE SET
           notice_count=EXCLUDED.notice_count,
           faq_count=EXCLUDED.faq_count,
           faq_category_count=EXCLUDED.faq_category_count,
           source_hash=EXCLUDED.source_hash,
           source_mode=EXCLUDED.source_mode,
           last_actor_clerk_user_id=EXCLUDED.last_actor_clerk_user_id,
           synced_at=NOW(),updated_at=NOW()`,
        [(noticePosts || []).length, (faqPosts || []).length, (faqCategories || []).length, hash, trim(actorClerkUserId)],
      );
      await client.query('COMMIT');
      return {
        noticeCount: (noticePosts || []).length,
        faqCount: (faqPosts || []).length,
        faqCategoryCount: (faqCategories || []).length,
        sourceHash: hash,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  },

  async getStatus() {
    const result = await pool.query(
      `SELECT scope, notice_count, faq_count, faq_category_count, source_hash, source_mode, last_actor_clerk_user_id, synced_at
         FROM app_board_syncs WHERE scope='all'`,
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
         FROM app_board_syncs sync
         LEFT JOIN app_board_configs config ON config.board_type='notice'
         WHERE sync.scope='all'
       ), filtered AS (
         SELECT *
           FROM app_board_posts
          WHERE board_type='notice'
            AND ($3::text IS NULL OR lower(title) LIKE $3 OR lower(content_text) LIKE $3)
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
    const result = await pool.query(`SELECT * FROM app_board_posts WHERE board_type='notice' AND post_id=$1`, [trim(postId)]);
    return mapPost(result.rows[0]);
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
         FROM app_board_syncs sync
         LEFT JOIN app_board_configs config ON config.board_type='faq'
         WHERE sync.scope='all'
       ), filtered AS (
         SELECT *
           FROM app_board_posts
          WHERE board_type='faq'
            AND (
              $3::text='' OR $3::text='all'
              OR ($4::text IS NOT NULL AND NOT $5::boolean)
              OR category_id=$3
            )
            AND ($4::text IS NULL OR lower(title) LIKE $4 OR lower(content_text) LIKE $4)
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

  async saveNoticePostAuthoritative({ post, beforeCommit }) {
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
             author_uid=$7,author_name=$8,source_mode='postgresql-authoritative',mirror_state='pending',updated_at=NOW()
           WHERE post_id=$1`,
          [post.id, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid || previous.authorUid, post.authorName || previous.authorName],
        );
      } else {
        await client.query(
          `INSERT INTO app_board_posts
             (post_id,board_type,category_id,title,content_text,content_html,content_format,is_pinned,author_uid,author_name,view_count,source_mode,mirror_state,created_at,updated_at)
           VALUES ($1,'notice',NULL,$2,$3,$4,$5,$6,$7,$8,0,'postgresql-authoritative','pending',NOW(),NOW())`,
          [post.id, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid, post.authorName],
        );
      }
      const nextResult = await client.query(`SELECT * FROM app_board_posts WHERE post_id=$1`, [post.id]);
      const next = mapPost(nextResult.rows[0]);
      const mirror = await beforeCommit({ previous, post: next });
      const mirrorState = mirror?.retired ? 'retired' : 'synced';
      await client.query(`UPDATE app_board_posts SET mirror_state=$2,synced_at=NOW() WHERE post_id=$1`, [post.id, mirrorState]);
      await refreshSyncCounts(client, post.actorClerkUserId || '');
      await client.query('COMMIT');
      return { post: next, previous, mirror };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  },

  async deleteNoticePostAuthoritative({ postId, beforeCommit }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board:notice:${trim(postId)}`]);
      const result = await client.query(`SELECT * FROM app_board_posts WHERE board_type='notice' AND post_id=$1 FOR UPDATE`, [trim(postId)]);
      const previous = mapPost(result.rows[0]);
      if (!previous) throw repositoryError('notice_post_not_found', 'Notice post was not found.');
      const mirror = await beforeCommit({ previous });
      await client.query(`DELETE FROM app_board_posts WHERE post_id=$1`, [previous.id]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { deletedPost: previous, mirror };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async saveFaqPostAuthoritative({ post, beforeCommit }) {
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
             author_uid=$8,author_name=$9,source_mode='postgresql-authoritative',mirror_state='pending',updated_at=NOW()
           WHERE post_id=$1`,
          [post.id, post.categoryId, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid || previous.authorUid, post.authorName || previous.authorName],
        );
      } else {
        await client.query(
          `INSERT INTO app_board_posts
             (post_id,board_type,category_id,title,content_text,content_html,content_format,is_pinned,author_uid,author_name,view_count,source_mode,mirror_state,created_at,updated_at)
           VALUES ($1,'faq',$2,$3,$4,$5,$6,$7,$8,$9,0,'postgresql-authoritative','pending',NOW(),NOW())`,
          [post.id, post.categoryId, post.title, post.contentText, post.contentHtml, post.contentFormat, post.isPinned, post.authorUid, post.authorName],
        );
      }
      const nextResult = await client.query(`SELECT * FROM app_board_posts WHERE post_id=$1`, [post.id]);
      const next = mapPost(nextResult.rows[0]);
      const mirror = await beforeCommit({ previous, post: next });
      const mirrorState = mirror?.retired ? 'retired' : 'synced';
      await client.query(`UPDATE app_board_posts SET mirror_state=$2,synced_at=NOW() WHERE post_id=$1`, [post.id, mirrorState]);
      await refreshSyncCounts(client, post.actorClerkUserId || '');
      await client.query('COMMIT');
      return { post: next, previous, mirror };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async deleteFaqPostAuthoritative({ postId, beforeCommit }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board:faq:${trim(postId)}`]);
      const result = await client.query(`SELECT * FROM app_board_posts WHERE board_type='faq' AND post_id=$1 FOR UPDATE`, [trim(postId)]);
      const previous = mapPost(result.rows[0]);
      if (!previous) throw repositoryError('faq_post_not_found', 'FAQ post was not found.');
      const mirror = await beforeCommit({ previous });
      await client.query(`DELETE FROM app_board_posts WHERE post_id=$1`, [previous.id]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { deletedPost: previous, mirror };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async saveConfigAuthoritative({ boardType, postsPerPage, beforeCommit }) {
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
      const mirror = await beforeCommit({ config });
      await client.query(`UPDATE app_board_configs SET synced_at=NOW() WHERE board_type=$1`, [boardType]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { config, mirror };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },

  async saveFaqCategoryAuthoritative({ category, beforeCommit }) {
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
      const mirror = await beforeCommit({ previous, category: next });
      await client.query(`UPDATE app_faq_categories SET synced_at=NOW() WHERE category_id=$1`, [category.id]);
      await refreshSyncCounts(client, category.actorClerkUserId || '');
      await client.query('COMMIT');
      return { category: next, previous, mirror };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code === '23505') throw repositoryError('faq_category_duplicate_name', 'FAQ category name already exists.');
      throw error;
    } finally { client.release(); }
  },

  async deleteFaqCategoryAuthoritative({ categoryId, beforeCommit }) {
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
      const mirror = await beforeCommit({ previous });
      await client.query(`DELETE FROM app_faq_categories WHERE category_id=$1`, [previous.id]);
      await refreshSyncCounts(client);
      await client.query('COMMIT');
      return { deletedCategory: previous, mirror };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  },
});
