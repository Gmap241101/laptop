// Read-only readiness gate. Never creates clouds, storage or paid database resources.
import { timingSafeEqual } from 'node:crypto';
const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
export const getWebBackupConfiguration = (env = process.env) => {
  const environment = env.APP_ENV === 'production' ? 'production' : 'staging';
  const source = env.DATABASE_URL || '';
  const target = env.BACKUP_VERIFY_TARGET_DATABASE_URL || '';
  let sourceUrl, targetUrl;
  try { sourceUrl = new URL(source); targetUrl = new URL(target); } catch {}
  const urlsSafe = sourceUrl && targetUrl &&
    /^postgres(ql)?:$/.test(sourceUrl.protocol) && /^postgres(ql)?:$/.test(targetUrl.protocol) &&
    sourceUrl.href !== targetUrl.href && sourceUrl.username !== targetUrl.username &&
    sourceUrl.hostname !== targetUrl.hostname &&
    sourceUrl.pathname !== targetUrl.pathname;
  const bucket = env.BACKUP_S3_BUCKET || '';
  const endpoint = env.BACKUP_S3_ENDPOINT || '';
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch {}
  const storeSafe = endpointUrl && endpointUrl.protocol === 'https:' && !endpointUrl.username && !endpointUrl.password &&
    !['localhost', '127.0.0.1', '::1'].includes(endpointUrl.hostname) &&
    /^[a-zA-Z0-9._-]{3,63}$/.test(bucket);
  const key = env.BACKUP_ENCRYPTION_KEY_HEX || '';
  const keySafe = /^[a-f0-9]{64}$/i.test(key) && !/^0{64}$/i.test(key);
  const expectedTarget = env.BACKUP_VERIFY_TARGET_MARKER_ID || '';
  const ready = env.BACKUP_VERIFY_ENABLED === 'true' && urlsSafe && storeSafe && keySafe &&
    /^[0-9a-f-]{36}$/i.test(expectedTarget) &&
    ['staging','production'].includes(env.APP_ENV) &&
    nonempty(env.BACKUP_S3_REGION) && nonempty(env.BACKUP_S3_ACCESS_KEY_ID) &&
    nonempty(env.BACKUP_S3_SECRET_ACCESS_KEY) &&
    nonempty(env.BACKUP_SOURCE_RESOURCE_ID) && nonempty(env.BACKUP_TARGET_RESOURCE_ID) &&
    env.BACKUP_SOURCE_RESOURCE_ID !== env.BACKUP_TARGET_RESOURCE_ID &&
    /^\d+$/.test(env.BACKUP_MAX_ARCHIVE_BYTES || '') &&
    Number(env.BACKUP_MAX_ARCHIVE_BYTES) > 0;
  return Object.freeze({ ready: Boolean(ready), environment, source, target,
    sourceResourceId: env.BACKUP_SOURCE_RESOURCE_ID || "",
    targetResourceId: env.BACKUP_TARGET_RESOURCE_ID || "",
    bucket, endpoint, region: env.BACKUP_S3_REGION || '', expectedTarget,
    key, accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID || '', secretKey: env.BACKUP_S3_SECRET_ACCESS_KEY || '',
    maximumBytes: Number(env.BACKUP_MAX_ARCHIVE_BYTES || 0),
    freshnessMinutes: 5,
  });
};
export const safeDigestMatch = (a, b) => {
  if (!/^[0-9a-f]{64}$/.test(a || '') || !/^[0-9a-f]{64}$/.test(b || '')) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};
