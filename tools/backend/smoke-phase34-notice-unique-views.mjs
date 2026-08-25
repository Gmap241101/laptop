import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardRepository } from '../../server/src/boards/board-repository.mjs';
import { createBoardService } from '../../server/src/boards/board-service.mjs';

const calls = [];
const pool = {
  async query(sql, params = []) {
    calls.push({ sql: String(sql), params });
    return { rows: [{ view_count: 41, counted: true }] };
  },
};
const repository = createBoardRepository(pool);
const first = await repository.incrementNoticeView('notice-1', 'a'.repeat(64));
assert.deepEqual(first, { viewCount: 41, counted: true });
assert.match(calls[0].sql, /INSERT INTO app_board_notice_unique_views/);
assert.match(calls[0].sql, /ON CONFLICT \(post_id, viewer_hash\) DO NOTHING/);
assert.match(calls[0].sql, /view_count = p\.view_count \+ \(SELECT COUNT\(\*\)::int FROM inserted\)/);
assert.deepEqual(calls[0].params, ['notice-1', 'a'.repeat(64)]);

let repositoryViewerHash = '';
const service = createBoardService({
  repository: {
    async incrementNoticeView(_postId, viewerHash) {
      repositoryViewerHash = viewerHash;
      return { viewCount: 9, counted: false };
    },
  },
});
const result = await service.incrementNoticeView('notice-1', 'notice-viewer-v1-0123456789abcdef0123456789abcdef');
assert.equal(result.viewCount, 9);
assert.equal(result.counted, false);
assert.match(repositoryViewerHash, /^[0-9a-f]{64}$/);
assert.notEqual(repositoryViewerHash, 'notice-viewer-v1-0123456789abcdef0123456789abcdef');
await assert.rejects(
  () => service.incrementNoticeView('notice-1', 'invalid'),
  (error) => error?.code === 'notice_viewer_id_invalid',
);

const migration = readFileSync('server/migrations/037_phase34_notice_unique_viewers.sql', 'utf8');
assert.match(migration, /PRIMARY KEY \(post_id, viewer_hash\)/);
assert.match(migration, /ON DELETE CASCADE/);
const app = readFileSync('server/src/app.mjs', 'utf8');
assert.match(app, /body\?\.viewerId/);
assert.match(app, /noticeView:[\s\S]*counted:/);
console.log('[phase34-notice-unique-views-backend-smoke] PASS');
