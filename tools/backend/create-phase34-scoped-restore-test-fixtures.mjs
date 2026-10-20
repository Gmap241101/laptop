#!/usr/bin/env node
// Phase 34 P0: Generate a narrowly scoped, PII-free, one-row FAQ restore test.
// This tool ONLY reads a JSON export and writes two local JSON fixture files.
// It does not connect to any database or make HTTP requests.
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const printUsage = () => {
  console.error('Usage: node tools/backend/create-phase34-scoped-restore-test-fixtures.mjs <staging-export.json> [output-directory]');
  console.error('Default output: ../backups/restore-test (when run from test_new)');
};
const sourceArg = process.argv[2];
if (!sourceArg || ['-h','--help'].includes(sourceArg)) {
  printUsage();
  process.exit(sourceArg ? 0 : 2);
}
const sourcePath = resolve(sourceArg);
const outputDir = resolve(process.argv[3] || join(dirname(process.cwd()), 'backups', 'restore-test'));
const fail = (reason) => { console.error(`FIXTURE_CREATE=FAIL reason=${reason}`); process.exit(1); };
let source;
try { source = JSON.parse(readFileSync(sourcePath, 'utf8')); }
catch { fail('source_file_not_valid_json_or_missing'); }
if (source?.format !== 'mk-rental-postgresql-backup-v1' ||
    source?.authority !== 'postgresql' ||
    !Number.isFinite(Date.parse(source?.exportedAt || '')) ||
    !Array.isArray(source?.schemaMigrations) ||
    !Array.isArray(source?.content?.faqCategories)) {
  fail('source_is_not_a_supported_postgresql_export');
}
const migrationNames = new Set();
const migrations = source.schemaMigrations.map((row) => {
  const name = String(row?.name || '');
  const checksum = String(row?.checksum || '');
  if (!/^[a-z0-9_.-]+\.sql$/i.test(name) || !/^[a-f0-9]{64}$/.test(checksum) || migrationNames.has(name)) {
    fail('source_migration_metadata_invalid');
  }
  migrationNames.add(name);
  return { name, checksum };
});
for (const prefix of ['038_', '039_', '041_']) {
  if (![...migrationNames].some(name => name.startsWith(prefix))) fail(`source_migration_${prefix.replace('_','')}_missing`);
}
if (migrations.length > 256) fail('source_migration_list_unexpectedly_large');
const marker = randomBytes(8).toString('hex');
const id = `p34_scoped_restore_test_${marker}`;
const originalName = `[복원시험] FAQ 추가 ${marker}`;
const updatedName = `[복원시험] FAQ 덮어쓰기 ${marker}`;
const existingIdSet = new Set(source.content.faqCategories.map(row => String(row.category_id)));
const existingNameSet = new Set(source.content.faqCategories.map(row => String(row.name || '').trim().toLowerCase()));
if (existingIdSet.has(id) || existingNameSet.has(originalName.toLowerCase()) || existingNameSet.has(updatedName.toLowerCase())) {
  fail('unexpected_test_key_collision');
}
const timestamp = new Date().toISOString();
const fixture = (categoryName) => ({
  format: 'mk-rental-postgresql-backup-v1',
  authority: 'postgresql',
  exportedAt: timestamp,
  schemaMigrations: migrations,
  // Deliberately exclude all original rows and any personally identifiable data.
  content: {
    site: [],
    boardConfigs: [],
    boardPosts: [],
    faqCategories: [{ category_id: id, name: categoryName, sort_order: 9999, source_mode: 'postgresql' }],
  },
});
try { mkdirSync(outputDir, {recursive:true}); } catch { fail('output_directory_unavailable'); }
const files = [
  { kind:'ADD', name:`phase34-json-add-${marker}.json`, data:fixture(originalName) },
  { kind:'OVERWRITE', name:`phase34-json-overwrite-${marker}.json`, data:fixture(updatedName) },
];
for (const file of files) {
  const filepath = join(outputDir, file.name);
  if (existsSync(filepath)) fail('destination_file_already_exists');
  const bytes = JSON.stringify(file.data, null, 2) + '\n';
  try { writeFileSync(filepath, bytes, {encoding:'utf8', flag:'wx', mode:0o600}); }
  catch { fail('could_not_write_fixture'); }
  console.log(`${file.kind}_FILE=${filepath}`);
  console.log(`${file.kind}_SHA256=${createHash('sha256').update(bytes).digest('hex')}`);
}
console.log(`TEST_CATEGORY_ID=${id}`);
console.log(`TEST_CATEGORY_NAME_BEFORE=${originalName}`);
console.log(`TEST_CATEGORY_NAME_AFTER=${updatedName}`);
console.log('EXPECTED_ADD_PREVIEW=insert:1 update:0 skip:0');
console.log('EXPECTED_OVERWRITE_PREVIEW=insert:0 update:1 skip:0');
console.log('FIXTURE_CREATE=PASS');
console.log('WARNING: staging only; select only the FAQ/notice scope; verify exactly 1 affected row before execution.');
