import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { createPinnedLookup, normalizeSecureAttachmentInputs } from '../../server/src/attachments/attachment-service.mjs';

const read = (path) => readFileSync(path, 'utf8');

const created = normalizeSecureAttachmentInputs([
  { name: '대여안내.pdf', targetUrl: 'https://files.example.com/download/manual.pdf?token=test' },
]);
assert.equal(created.length, 1);
assert.match(created[0].generatedId, /^att-[a-f0-9]{32}$/);
assert.equal(created[0].id, '');
assert.equal(created[0].name, '대여안내.pdf');
assert.equal(created[0].targetUrl, 'https://files.example.com/download/manual.pdf?token=test');

const retained = normalizeSecureAttachmentInputs([{ id: 'att-existing', name: '기존.pdf', targetUrl: '' }]);
assert.equal(retained[0].id, 'att-existing');
assert.equal(retained[0].targetUrl, '');

for (const [targetUrl, code] of [
  ['http://files.example.com/a.pdf', 'attachment_url_https_required'],
  ['https://127.0.0.1/a.pdf', 'attachment_url_host_forbidden'],
  ['https://[::1]/a.pdf', 'attachment_url_host_forbidden'],
  ['https://[fc00::1]/a.pdf', 'attachment_url_host_forbidden'],
  ['https://user:pass@files.example.com/a.pdf', 'attachment_url_credentials_forbidden'],
  ['https://files.example.com:8443/a.pdf', 'attachment_url_port_forbidden'],
]) {
  assert.throws(
    () => normalizeSecureAttachmentInputs([{ name: 'x.pdf', targetUrl }]),
    (error) => error?.code === code,
    `${targetUrl} must be rejected with ${code}`,
  );
}
assert.throws(
  () => normalizeSecureAttachmentInputs(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.pdf`, targetUrl: `https://files.example.com/${index}.pdf` }))),
  (error) => error?.code === 'attachment_count_exceeded',
);

const migration = read('server/migrations/035_phase34_secure_external_attachments.sql');
const repository = read('server/src/attachments/attachment-repository.mjs');
const service = read('server/src/attachments/attachment-service.mjs');
const app = read('server/src/app.mjs');
const index = read('server/src/index.mjs');
const boardRepository = read('server/src/boards/board-repository.mjs');
const boardService = read('server/src/boards/board-service.mjs');
const inquiryRepository = read('server/src/inquiries/inquiry-repository.mjs');
const inquiryService = read('server/src/inquiries/inquiry-service.mjs');

assert.match(migration, /CREATE TABLE IF NOT EXISTS app_secure_attachments/);
assert.match(migration, /target_url TEXT NOT NULL/);
assert.doesNotMatch(migration, /BYTEA|BLOB/i);
assert.match(repository, /const publicAttachment = [\s\S]*downloadPath/);
const publicMapper = repository.slice(repository.indexOf('const publicAttachment'), repository.indexOf('export const createSecureAttachmentRepository'));
assert.doesNotMatch(publicMapper, /target_url|targetUrl/, 'public attachment metadata must never include the external target URL');
assert.match(repository, /targetUrl: row\.target_url/);
assert.match(service, /httpsRequest/);
assert.match(service, /lookup: createPinnedLookup\(resolved\)/);

// Node 22 invokes custom lookup with { all: true } for https.request().
// Returning a scalar address in that mode raises ERR_INVALID_IP_ADDRESS before the upstream request is sent.
const pinnedLookup = createPinnedLookup({ address: '93.184.216.34', family: 4 });
await new Promise((resolve, reject) => pinnedLookup('files.example.com', { all: true }, (error, records) => {
  if (error) return reject(error);
  assert.deepEqual(records, [{ address: '93.184.216.34', family: 4 }]);
  resolve();
}));
await new Promise((resolve, reject) => pinnedLookup('files.example.com', {}, (error, address, family) => {
  if (error) return reject(error);
  assert.equal(address, '93.184.216.34');
  assert.equal(family, 4);
  resolve();
}));
assert.match(service, /BlockList/);
assert.match(service, /attachment_direct_file_required/);
assert.match(service, /MAX_DOWNLOAD_BYTES = 50 \* 1024 \* 1024/);
assert.match(service, /Content-Disposition/);
assert.match(service, /Cache-Control': 'private, no-store, max-age=0'/);
assert.match(service, /Content-Security-Policy': "sandbox; default-src 'none'"/);
assert.doesNotMatch(service, /['"]Location['"]\s*:/, 'secure download proxy must never redirect the browser to the external URL');
assert.match(app, /\/api\\\/attachments\\\/\(\[\^\/\]\+\)\\\/download/);
assert.match(app, /readGuestInquiryToken/);
assert.match(app, /inquiryService\.getMember/);
assert.match(app, /inquiryService\.getAdmin/);
assert.match(index, /createSecureAttachmentRepository/);
assert.match(index, /createSecureAttachmentService/);
assert.match(boardRepository, /app_secure_attachments/);
assert.match(boardRepository, /jsonb_build_object\([\s\S]*'downloadPath'/);
assert.match(boardService, /normalizeSecureAttachmentInputs\(input\?\.attachments\)/);
assert.match(inquiryRepository, /ownerType: 'inquiry_answer'/);
assert.match(inquiryRepository, /ownerType: 'inquiry'/);
assert.match(inquiryService, /attachments: normalizeSecureAttachmentInputs\(input\?\.attachments\)/);

console.log('[phase34-secure-external-attachments-backend-smoke] PASS');
