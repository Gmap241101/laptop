import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const hash = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, input) => createHmac('sha256', key).update(input).digest();
export const sha256File = async (file) => {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
};
// AES-256-GCM: 12-byte unique nonce | ciphertext | 16-byte authentication tag.
export const encryptArchive = async (source, destination, keyHex) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const out = await open(destination, 'wx', 0o600);
  try { await out.write(iv); } finally { await out.close(); }
  await pipeline(createReadStream(source), cipher, createWriteStream(destination, { flags: 'a', mode: 0o600 }));
  const handle = await open(destination, 'a');
  try { await handle.write(cipher.getAuthTag()); } finally { await handle.close(); }
  return { sha256: await sha256File(destination), size: (await stat(destination)).size };
};
export const decryptArchive = async (source, destination, keyHex) => {
  const handle = await open(source, 'r');
  let iv, tag;
  try {
    const size = (await handle.stat()).size;
    if (size < 29) throw new Error('archive_ciphertext_invalid');
    iv = Buffer.alloc(12); tag = Buffer.alloc(16);
    await handle.read(iv, 0, 12, 0);
    await handle.read(tag, 0, 16, size - 16);
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(source, { start: 12, end: size - 17 }), decipher,
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  } finally { await handle.close(); }
  return sha256File(destination);
};

export const createEncryptedS3ArchiveStore = (config, { fetchImpl = fetch } = {}) => {
  if (!config.ready) throw new Error('backup_verification_infrastructure_not_ready');
  const endpoint = new URL(config.endpoint);
  const access = config.accessKeyId;
  const secret = config.secretKey;
  const scopeRegion = config.region;
  const bucket = config.bucket;
  const request = async (method, key, { file, expectedSha256, byteLength, metadata } = {}) => {
    if (!/^phase34\/(production|staging)\/[0-9a-f-]{36}\.pgdump\.aesgcm$/.test(key)) throw new Error('backup_store_invalid_key');
    const path = `${endpoint.pathname.replace(/\/$/, '')}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const url = new URL(endpoint.href); url.pathname = path;
    const when = new Date();
    const date = when.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const shortDate = date.slice(0, 8);
    const signed = { host: url.host, 'x-amz-content-sha256': file && method === 'PUT' ? expectedSha256 : hash(''), 'x-amz-date': date };
    if (method === 'HEAD') signed['x-amz-checksum-mode'] = 'ENABLED';
    if (method === 'PUT') {
      signed['x-amz-server-side-encryption'] = 'AES256';
      signed['x-amz-checksum-sha256'] = Buffer.from(metadata.sha256, 'hex').toString('base64');
      signed['x-amz-meta-archive-sha256'] = metadata.sha256;
      signed['x-amz-meta-plain-sha256'] = metadata.plainSha256;
      signed['x-amz-meta-backup-environment'] = config.environment;
    }
    const sorted = Object.entries(signed).sort(([a], [b]) => a.localeCompare(b));
    const canonicalHeaders = sorted.map(([k, v]) => `${k}:${String(v).trim()}\n`).join('');
    const names = sorted.map(([k]) => k).join(';');
    const canonicalRequest = [method, url.pathname, '', canonicalHeaders, names, signed['x-amz-content-sha256']].join('\n');
    const scope = `${shortDate}/${scopeRegion}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', date, scope, hash(canonicalRequest)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, shortDate), scopeRegion), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const headers = { ...signed, authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${names}, Signature=${signature}` };
    if (file && method === 'PUT') headers['content-length'] = String(byteLength);
    const response = await fetchImpl(url, { method, headers, redirect: 'error', signal: AbortSignal.timeout(method === 'HEAD' ? 8000 : 120000),
      ...(file ? { body: Readable.toWeb(createReadStream(file)), duplex: 'half' } : {}) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`backup_store_${method.toLowerCase()}_failed`);
    }
    return response;
  };
  return Object.freeze({
    async upload(key, file, plainSha256) {
      const sha256 = await sha256File(file);
      const size = (await stat(file)).size;
      if (size < 29 || size > config.maximumBytes) throw new Error('backup_store_size_invalid');
      const r = await request('PUT', key, { file, expectedSha256: sha256, byteLength: size,
        metadata: { sha256, plainSha256 } });
      await r.body?.cancel().catch(() => {});
      return { sha256, size };
    },
    async verifyPresence(key, expectedSha256) {
      const r = await request('HEAD', key);
      const reported = r.headers.get('x-amz-meta-archive-sha256');
      const env = r.headers.get('x-amz-meta-backup-environment');
      const providerChecksum = r.headers.get('x-amz-checksum-sha256');
      await r.body?.cancel().catch(() => {});
      if (reported !== expectedSha256 || env !== config.environment ||
          providerChecksum !== Buffer.from(expectedSha256, 'hex').toString('base64')) {
        throw new Error('backup_store_object_changed');
      }
      return true;
    },
    async download(key, file, expectedSha256) {
      const r = await request('GET', key);
      if (!r.body) throw new Error('backup_store_empty_response');
      await pipeline(Readable.fromWeb(r.body), createWriteStream(file, { flags: 'wx', mode: 0o600 }));
      if (await sha256File(file) !== expectedSha256) throw new Error('backup_store_integrity_failed');
      return true;
    },
  });
};
