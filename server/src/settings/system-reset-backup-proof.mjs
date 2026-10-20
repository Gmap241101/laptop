// Read-only proof parser; the proof is written only by the operator-side
// full pg_dump + isolated pg_restore verification script.
export const RESET_BACKUP_PROOF_KEY = 'phase34_verified_full_db_backup';
export const RESET_BACKUP_PROOF_MAX_AGE_MS = 60 * 60 * 1000;

export const describeResetBackupProof = (raw, databaseName, now = Date.now()) => {
  const proof = raw && typeof raw === 'object' ? raw : {};
  const checkedAt = Date.parse(proof.verifiedAt || '');
  const age = now - checkedAt;
  const typeValid = proof.type === 'full-pg-dump-isolated-restore-v1' ||
    (proof.type === 'full-pg-dump-isolated-restore-v2' &&
      /^[0-9a-f-]{36}$/i.test(proof.jobId || '') &&
      /^phase34\/(staging|production)\/[0-9a-f-]{36}\.pgdump\.aesgcm$/.test(proof.objectKey || '') &&
      /^[a-f0-9]{64}$/.test(proof.objectSha256 || '') &&
      ['staging','production'].includes(proof.environment));
  const valid = typeValid &&
    proof.databaseName === databaseName &&
    typeof proof.dumpSha256 === 'string' && /^[a-f0-9]{64}$/.test(proof.dumpSha256) &&
    typeof proof.tableCountsSha256 === 'string' && /^[a-f0-9]{64}$/.test(proof.tableCountsSha256) &&
    Number.isFinite(checkedAt) && age >= 0 && age <= RESET_BACKUP_PROOF_MAX_AGE_MS &&
    Number.isInteger(proof.verifiedTableCount) && proof.verifiedTableCount > 0;
  return Object.freeze({ valid, verifiedAt: valid ? proof.verifiedAt : null,
    expiresAt: valid ? new Date(checkedAt + RESET_BACKUP_PROOF_MAX_AGE_MS).toISOString() : null,
    verifiedTableCount: valid ? proof.verifiedTableCount : 0 });
};
