import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getOrCreateNoticeViewerId } from '../../src/features/boards/boardContentCutover.js';

const values = new Map();
const storage = {
  getItem(key) { return values.get(key) || null; },
  setItem(key, value) { values.set(key, value); },
};
const cryptoApi = { randomUUID: () => '12345678-1234-1234-1234-123456789abc' };
const first = getOrCreateNoticeViewerId({ storage, cryptoApi });
const second = getOrCreateNoticeViewerId({ storage, cryptoApi });
assert.equal(first, 'notice-viewer-v1-12345678123412341234123456789abc');
assert.equal(second, first, 'the same browser profile must reuse the same opaque notice viewer ID');

const cutover = readFileSync('src/features/boards/boardContentCutover.js', 'utf8');
assert.match(cutover, /NOTICE_VIEWER_STORAGE_KEY = 'mk_notice_viewer_id_v1'/);
assert.match(cutover, /body: \{ viewerId \}/);
assert.match(cutover, /'Content-Type': 'application\/json'/);
assert.doesNotMatch(cutover, /viewerId:\s*(?:user|email|clerk)/i, 'notice viewer ID must not contain account PII');
console.log('[phase34-notice-unique-views-frontend-smoke] PASS');
