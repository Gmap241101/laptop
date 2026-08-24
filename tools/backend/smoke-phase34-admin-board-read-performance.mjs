import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardRepository } from '../../server/src/boards/board-repository.mjs';

const repositorySource = readFileSync('server/src/boards/board-repository.mjs', 'utf8');
const serviceSource = readFileSync('server/src/boards/board-service.mjs', 'utf8');
const appSource = readFileSync('server/src/app.mjs', 'utf8');

for (const marker of [
  'NOTICE_SUMMARY_PROJECTION',
  'FAQ_SUMMARY_PROJECTION',
  'summaryOnly = false',
  'summaryOnly ? mapPostSummary : mapPost',
  'async getFaqPost(postId)',
  'ordered_meta AS',
]) assert.ok(repositorySource.includes(marker), `missing admin board performance marker: ${marker}`);

assert.ok(serviceSource.includes('async getFaq(postId)'), 'FAQ detail service must exist');
assert.ok(appSource.includes("url.searchParams.get('summary') === '1'"), 'board list API must accept summary=1');
assert.ok(appSource.includes("/^\\/api\\/boards\\/faq\\/([^/]+)$/"), 'FAQ detail API route must exist');

const makeBoardRow = ({ type = 'notice' } = {}) => ({
  board_synced_at: new Date('2026-08-21T00:00:00.000Z'),
  config_posts_per_page: 10,
  config_source_mode: 'postgresql',
  config_synced_at: new Date('2026-08-21T00:00:00.000Z'),
  config_updated_at: new Date('2026-08-21T00:00:00.000Z'),
  effective_page_size: 10,
  categories: type === 'faq' ? [{ category_id: 'c1', name: '일반', sort_order: 0 }] : undefined,
  pinned_posts: [],
  regular_posts: [{
    post_id: `${type}-1`,
    board_type: type,
    category_id: type === 'faq' ? 'c1' : null,
    title: `${type} title`,
    is_pinned: false,
    author_uid: 'admin',
    author_name: '관리자',
    view_count: 0,
    created_at: new Date('2026-08-21T00:00:00.000Z'),
    updated_at: new Date('2026-08-21T00:00:00.000Z'),
    source_mode: 'postgresql',
    mirror_state: 'retired',
  }],
  total_regular_count: 1,
});

let capturedSql = '';
const listPool = {
  async query(sql) {
    capturedSql = String(sql);
    const type = capturedSql.includes("config.board_type='faq'") ? 'faq' : 'notice';
    return { rows: [makeBoardRow({ type })] };
  },
};
const listRepository = createBoardRepository(listPool);
const noticeSummary = await listRepository.listNotice({ summaryOnly: true });
assert.equal(noticeSummary.regularPosts[0].contentHtml, undefined, 'notice summary must not expose contentHtml');
assert.equal(capturedSql.includes('p.*'), false, 'notice summary SQL must not select p.*');
assert.equal(capturedSql.includes("a.owner_type='notice'"), false, 'notice summary SQL must not aggregate attachments');
const faqSummary = await listRepository.listFaq({ summaryOnly: true });
assert.equal(faqSummary.regularPosts[0].contentHtml, undefined, 'FAQ summary must not expose contentHtml');
assert.equal(capturedSql.includes('p.*'), false, 'FAQ summary SQL must not select p.*');
assert.equal(capturedSql.includes("a.owner_type='faq'"), false, 'FAQ summary SQL must not aggregate attachments');

let detailCalls = 0;
const detailPool = {
  async query(sql, params) {
    detailCalls += 1;
    const isFaq = String(sql).includes("p.board_type='faq'");
    return { rows: [{
      board_synced_at: new Date('2026-08-21T00:00:00.000Z'),
      post_id: params?.[0] || (isFaq ? 'faq-1' : 'notice-1'),
      board_type: isFaq ? 'faq' : 'notice',
      category_id: isFaq ? 'c1' : null,
      title: 'detail',
      content_text: 'detail body',
      content_html: '<p style="color:red">detail body</p>',
      content_format: 'rich-html-v1',
      is_pinned: false,
      author_uid: 'admin',
      author_name: '관리자',
      view_count: 1,
      created_at: new Date('2026-08-21T00:00:00.000Z'),
      updated_at: new Date('2026-08-21T00:00:00.000Z'),
      source_mode: 'postgresql',
      mirror_state: 'retired',
      attachments: [],
      previous_post_id: null,
      next_post_id: null,
    }] };
  },
};
const detailRepository = createBoardRepository(detailPool);
detailCalls = 0;
const noticeDetail = await detailRepository.getNoticePost('notice-1');
assert.equal(noticeDetail.contentHtml.includes('color:red'), true);
assert.equal(detailCalls, 1, 'notice detail must use one PostgreSQL query');
detailCalls = 0;
const faqDetail = await detailRepository.getFaqPost('faq-1');
assert.equal(faqDetail.contentHtml.includes('color:red'), true);
assert.equal(detailCalls, 1, 'FAQ detail must use one PostgreSQL query');

const getNoticeBody = repositorySource.slice(
  repositorySource.indexOf('async getNoticePost(postId)'),
  repositorySource.indexOf('async incrementNoticeView(postId)'),
);
assert.equal((getNoticeBody.match(/pool\.query\(/g) || []).length, 1, 'notice detail hot path must contain one pool.query');
assert.equal(getNoticeBody.includes('ensureBootstrapped(pool)'), false, 'notice detail must not perform a separate bootstrap query');
assert.ok(getNoticeBody.includes('ordered_meta AS'), 'notice navigation must use metadata-only window input');

console.log('[phase34-admin-board-read-performance-backend-smoke] PASS (admin notice/FAQ summary payloads + single-query detail reads)');
