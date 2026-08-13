import assert from 'node:assert/strict';
import { createRentalRestrictionService } from '../../server/src/restrictions/rental-restriction-service.mjs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';
import { createSiteContentRepository } from '../../server/src/content/site-content-repository.mjs';
import { createBoardRepository } from '../../server/src/boards/board-repository.mjs';
import fs from 'node:fs';

const rentalRestrictionRepository = {
  async findByFirebaseUid() { return null; },
  async findByAppUserId(appUserId) {
    assert.equal(String(appUserId), '55');
    return null;
  },
  async upsert(value) { return value; },
};
const firebaseLinkRepository = {
  async findByFirebaseUid() { return null; },
};
const service = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
  firestoreRentalRestrictionClient: null,
  firebaseCompatibilityRequired: false,
});
const current = await service.getCurrentForAppUser({ appUserId: 55, legacyMemberKey: 'clerk-native:test' });
assert.equal(current.exists, false);
assert.equal(current.restriction, null);
assert.equal(current.authorityMode, 'postgresql-authoritative');
assert.equal(current.mirrorState, 'retired');
assert.equal(current.appUserId, '55');
assert.equal(current.firebaseUid, 'clerk-native:test');



let currentRentalConfig = {
  domain: 'rental-config',
  source: 'postgresql',
  authoritative: true,
  synchronized: true,
  sourceMode: 'postgresql-admin-direct',
  sourceHash: 'before',
  syncedAt: new Date().toISOString(),
  documentCount: 1,
  documents: [{
    key: 'rentalSystem/publicConfig',
    payload: {
      storageVersion: 4,
      assetCategories: ['노트북'],
      settings: { maxRentalDays: 10, holidays: [] },
    },
    enabled: null,
    sortOrder: null,
    sourceUpdatedAt: null,
  }],
};
let replaceArgs = null;
const siteContentService = createSiteContentService({
  repository: {
    async getDomain(domain) {
      assert.equal(domain, 'rental-config');
      return currentRentalConfig;
    },
    async replaceDomain(args) {
      replaceArgs = args;
      currentRentalConfig = {
        ...currentRentalConfig,
        sourceMode: args.sourceMode,
        documents: args.documents,
        documentCount: args.documents.length,
      };
      return currentRentalConfig;
    },
  },
});
const patchedRentalConfig = await siteContentService.patchRentalConfigSettings({
  settingsPatch: { holidays: [{ date: '2026-08-15', enabled: true }] },
  actorClerkUserId: 'clerk-admin-1',
});
assert.equal(replaceArgs.domain, 'rental-config');
assert.equal(replaceArgs.sourceMode, 'postgresql-admin-settings-patch');
assert.equal(replaceArgs.actorClerkUserId, 'clerk-admin-1');
const canonical = patchedRentalConfig.documents.find((document) => document.key === 'rentalSystem/publicConfig');
assert.deepEqual(canonical.payload.assetCategories, ['노트북'], 'settings patch must preserve top-level rental configuration data');
assert.equal(canonical.payload.settings.maxRentalDays, 10, 'holiday patch must preserve other rental policy settings');
assert.deepEqual(canonical.payload.settings.holidays, [{ date: '2026-08-15', enabled: true }]);

const appSource = fs.readFileSync(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
assert.match(appSource, /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'/);
assert.match(appSource, /'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'/, 'browser CORS preflight must allow PATCH for administrator rental-config writes');
assert.match(
  appSource,
  /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'[\s\S]*?readJsonBody\(request, \{ maxBytes: 512 \* 1024 \}\)/,
  'administrator rental-config settings writes must accept accumulated holiday payloads above the former 32KB request limit'
);
assert.match(
  appSource,
  /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'[\s\S]*?readJsonBody\(request, \{ maxBytes: 512 \* 1024 \}\)/,
  'administrator rental-config settings writes must accept accumulated holiday payloads above the former 32KB request limit'
);
assert.match(appSource, /phase34AdminNavigationHolidayRevision/);



const boardSqlCalls = [];
const boardPool = {
  async query(sql, params = []) {
    const text = String(sql);
    boardSqlCalls.push({ text, params });
    if (text.includes('WITH sync_meta AS')) {
      return {
        rowCount: 1,
        rows: [{
          board_synced_at: '2026-08-13T01:00:00.000Z',
          config_row: {
            board_type: params?.[0] || 'faq',
            posts_per_page: 10,
            source_mode: 'postgresql-authoritative',
            synced_at: '2026-08-13T01:00:00.000Z',
            updated_at: '2026-08-13T01:00:00.000Z',
          },
          categories: text.includes('app_faq_categories')
            ? [{ category_id: 'general', name: '일반', sort_order: 0, source_mode: 'postgresql-authoritative' }]
            : undefined,
        }],
      };
    }
    if (text.includes('WITH filtered AS')) {
      const boardType = params?.[0] || '';
      return {
        rowCount: 1,
        rows: [{
          pinned_posts: [],
          regular_posts: [{
            post_id: `${boardType}-1`,
            board_type: boardType,
            category_id: boardType === 'faq' ? 'general' : null,
            title: `${boardType} smoke`,
            content_text: 'body',
            content_html: '<p>body</p>',
            content_format: 'rich-html-v1',
            is_pinned: false,
            author_uid: '',
            author_name: '관리자',
            view_count: 0,
            source_mode: 'postgresql-authoritative',
            mirror_state: 'retired',
            created_at: '2026-08-13T01:00:00.000Z',
            updated_at: '2026-08-13T01:00:00.000Z',
          }],
          total_regular_count: 1,
        }],
      };
    }
    throw new Error(`Unexpected board SQL in Phase 34 regression smoke: ${text}`);
  },
};
const boardRepository = createBoardRepository(boardPool);
const noticeQueryStart = boardSqlCalls.length;
const noticeBoard = await boardRepository.listNotice({ page: 1, pageSize: 10 });
assert.equal(boardSqlCalls.length - noticeQueryStart, 2, 'notice list entry must use two PostgreSQL round trips instead of the migration-era five-query sequence');
assert.equal(noticeBoard.regularPosts[0]?.id, 'notice-1');
const faqQueryStart = boardSqlCalls.length;
const faqBoard = await boardRepository.listFaq({ page: 1, pageSize: 10, categoryId: 'all' });
assert.equal(boardSqlCalls.length - faqQueryStart, 2, 'FAQ list entry must use two PostgreSQL round trips instead of the migration-era six-query sequence');
assert.equal(faqBoard.categories[0]?.id, 'general');
assert.equal(faqBoard.regularPosts[0]?.id, 'faq-1');
const boardRepositorySource = fs.readFileSync(new URL('../../server/src/boards/board-repository.mjs', import.meta.url), 'utf8');
const listNoticeStart = boardRepositorySource.indexOf('async listNotice(');
const listNoticeEnd = boardRepositorySource.indexOf('async getNoticePost', listNoticeStart);
const listNoticeBlock = boardRepositorySource.slice(listNoticeStart, listNoticeEnd);
const listFaqStart = boardRepositorySource.indexOf('async listFaq(');
const listFaqEnd = boardRepositorySource.indexOf('async saveNoticePostAuthoritative', listFaqStart);
const listFaqBlock = boardRepositorySource.slice(listFaqStart, listFaqEnd);
assert.equal(listNoticeBlock.includes('pool.connect()'), false, 'public notice list reads must not hold a dedicated client across sequential metadata/count/page queries');
assert.equal(listFaqBlock.includes('pool.connect()'), false, 'public FAQ list reads must not hold a dedicated client across sequential metadata/category/count/page queries');
assert.match(listNoticeBlock, /jsonb_agg\(to_jsonb\(pinned_posts\)/, 'notice list must aggregate pinned/page rows in one PostgreSQL statement');
assert.match(listFaqBlock, /jsonb_agg\(to_jsonb\(regular_posts\)/, 'FAQ list must aggregate page rows in one PostgreSQL statement');


const repositoryState = {
  sync: null,
  documents: [],
};
const fakePool = {
  async connect() {
    return {
      async query(sql, params = []) {
        const text = String(sql);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('DELETE FROM app_site_content_documents')) {
          repositoryState.documents = [];
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO app_site_content_documents')) {
          repositoryState.documents.push({
            document_key: params[1],
            payload: JSON.parse(params[2]),
            enabled: params[3],
            sort_order: params[4],
            source_updated_at: params[6],
            synced_at: '2026-08-12T09:00:00.000Z',
          });
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO app_site_content_syncs')) {
          repositoryState.sync = {
            domain: params[0],
            source_hash: params[1],
            document_count: params[2],
            source_mode: params[3],
            synced_at: '2026-08-12T09:00:00.000Z',
          };
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected transactional SQL in site content repository smoke: ${text}`);
      },
      release() {},
    };
  },
  async query(sql, params = []) {
    const text = String(sql);
    if (text.includes('FROM app_site_content_syncs')) {
      return repositoryState.sync
        ? { rowCount: 1, rows: [repositoryState.sync] }
        : { rowCount: 0, rows: [] };
    }
    if (text.includes('FROM app_site_content_documents')) {
      return { rowCount: repositoryState.documents.length, rows: repositoryState.documents };
    }
    throw new Error(`Unexpected pool SQL in site content repository smoke: ${text}`);
  },
};
const realRepository = createSiteContentRepository(fakePool);
const realReplaceResult = await realRepository.replaceDomain({
  domain: 'rental-config',
  documents: [{
    key: 'rentalSystem/publicConfig',
    payload: { settings: { maxRentalDays: 12 } },
    enabled: true,
    sortOrder: 0,
    sourceUpdatedAt: '2026-08-12T08:55:00.000Z',
  }],
  actorClerkUserId: 'clerk-admin-repository-smoke',
  sourceMode: 'postgresql-admin-settings-patch',
});
assert.equal(realReplaceResult.source, 'postgresql');
assert.equal(realReplaceResult.documents[0].payload.settings.maxRentalDays, 12);
assert.equal(realReplaceResult.sourceMode, 'postgresql-admin-settings-patch');
const repositorySource = fs.readFileSync(new URL('../../server/src/content/site-content-repository.mjs', import.meta.url), 'utf8');
assert.equal(repositorySource.includes('this.getDomain('), false, 'site-content repository arrow functions must not call this.getDomain');
assert.equal(repositorySource.includes('this.getRentalConfigBootstrapContext('), false, 'site-content repository arrow functions must not call this.getRentalConfigBootstrapContext');


const memberAuthoritySource = fs.readFileSync(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8');
const profileProjectionBlock = memberAuthoritySource.match(/const profileFromAccount = \(account = \{\}, firebaseUid = ''\) => \(\{[\s\S]*?\}\);/)?.[0] || '';
assert.match(profileProjectionBlock, /createdAt:\s*account\.createdAt \|\| null/, 'PostgreSQL member edit response must preserve signup timestamp');
assert.match(profileProjectionBlock, /updatedAt:\s*account\.updatedAt \|\| null/, 'PostgreSQL member edit response must preserve update timestamp');

console.log('[phase34-runtime-regressions-backend-smoke] PASS');
