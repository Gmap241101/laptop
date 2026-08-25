import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { TextDecoder } from 'node:util';

const MAX_ATTACHMENTS = 5;
const MAX_NAME_LENGTH = 180;
const MAX_URL_LENGTH = 4096;
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 4;
const trim = (value) => String(value ?? '').trim();

const serviceError = (code, message, status = 400) => {
  const error = new Error(message);
  error.name = 'SecureAttachmentServiceError';
  error.code = code;
  error.status = status;
  return error;
};

const blockedAddresses = new BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([network, prefix]) => blockedAddresses.addSubnet(network, prefix, 'ipv4'));
[
  ['::', 128], ['::1', 128], ['100::', 64], ['2001:2::', 48], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
].forEach(([network, prefix]) => blockedAddresses.addSubnet(network, prefix, 'ipv6'));

const normalizeHostname = (hostname) => trim(hostname).replace(/^\[|\]$/g, '');
const isPrivateAddress = (address) => {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) return blockedAddresses.check(normalized, 'ipv4');
  if (family === 6) return blockedAddresses.check(normalized, 'ipv6');
  return true;
};

const parseTargetUrl = (raw) => {
  const value = trim(raw);
  if (!value || value.length > MAX_URL_LENGTH) throw serviceError('attachment_url_invalid', 'Attachment URL is invalid.');
  let parsed;
  try { parsed = new URL(value); }
  catch { throw serviceError('attachment_url_invalid', 'Attachment URL is invalid.'); }
  if (parsed.protocol !== 'https:') throw serviceError('attachment_url_https_required', 'Attachment URL must use HTTPS.');
  if (parsed.port && parsed.port !== '443') throw serviceError('attachment_url_port_forbidden', 'Attachment URL must use the standard HTTPS port.');
  if (parsed.username || parsed.password) throw serviceError('attachment_url_credentials_forbidden', 'Attachment URL must not contain credentials.');
  if (!parsed.hostname || ['localhost', 'localhost.localdomain'].includes(parsed.hostname.toLowerCase())) {
    throw serviceError('attachment_url_host_forbidden', 'Attachment URL host is not allowed.');
  }
  parsed.hash = '';
  const literalHost = normalizeHostname(parsed.hostname);
  const literalFamily = isIP(literalHost);
  if (literalFamily && isPrivateAddress(literalHost)) throw serviceError('attachment_url_host_forbidden', 'Attachment URL host is not allowed.');
  return parsed;
};

const decodeFilenameValue = (value) => {
  const text = trim(value);
  if (!text) return '';
  try { return decodeURIComponent(text); }
  catch { return text; }
};

const normalizeCharsetLabel = (value) => {
  const label = trim(value).toLowerCase().replace(/_/g, '-');
  if (['utf8', 'utf-8'].includes(label)) return 'utf-8';
  if (['euc-kr', 'euckr', 'ks-c-5601-1987', 'ks-c-5601', 'ksc5601', 'cp949', 'windows-949', 'x-windows-949'].includes(label)) return 'euc-kr';
  if (['iso-8859-1', 'latin1', 'latin-1'].includes(label)) return 'windows-1252';
  return label || 'utf-8';
};

const decodeBytes = (bytes, charset = 'utf-8', { fatal = false } = {}) => {
  try {
    return new TextDecoder(normalizeCharsetLabel(charset), { fatal }).decode(bytes);
  } catch {
    return '';
  }
};

const percentEncodedBytes = (value) => {
  const source = String(value ?? '');
  const bytes = [];
  for (let index = 0; index < source.length;) {
    if (source[index] === '%' && /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
      index += 3;
      continue;
    }
    const encoded = Buffer.from(source[index], 'utf8');
    bytes.push(...encoded);
    index += 1;
  }
  return Uint8Array.from(bytes);
};

const decodeExtendedFilenameValue = (charset, value) => {
  const decoded = decodeBytes(percentEncodedBytes(String(value ?? '').replace(/^\"|\"$/g, '')), charset);
  return trim(decoded);
};

const decodeMimeEncodedWords = (value) => String(value ?? '').replace(
  /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
  (whole, charset, mode, payload) => {
    try {
      let bytes;
      if (String(mode).toLowerCase() === 'b') {
        bytes = Uint8Array.from(Buffer.from(String(payload || ''), 'base64'));
      } else {
        const q = String(payload || '').replace(/_/g, ' ');
        const values = [];
        for (let index = 0; index < q.length;) {
          if (q[index] === '=' && /^[0-9A-Fa-f]{2}$/.test(q.slice(index + 1, index + 3))) {
            values.push(Number.parseInt(q.slice(index + 1, index + 3), 16));
            index += 3;
          } else {
            values.push(...Buffer.from(q[index], 'latin1'));
            index += 1;
          }
        }
        bytes = Uint8Array.from(values);
      }
      return decodeBytes(bytes, charset) || whole;
    } catch {
      return whole;
    }
  },
);

const filenameTextScore = (value) => {
  const text = String(value ?? '');
  const hangul = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  const cjk = (text.match(/[\u3040-\u30FF\u3400-\u9FFF]/g) || []).length;
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const controls = (text.match(/[\u0000-\u001f\u007f]/g) || []).length;
  const questionMarks = (text.match(/\?/g) || []).length;
  const mojibake = (text.match(/[ÃÂÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g) || []).length;
  return (hangul * 8) + (cjk * 4) - (replacement * 12) - (controls * 12) - (questionMarks * 2) - (mojibake * 2);
};

const recoverLegacyHeaderFilename = (value) => {
  const source = trim(value).replace(/^\"|\"$/g, '');
  if (!source) return '';
  const candidates = [source, decodeFilenameValue(source), decodeMimeEncodedWords(source)];
  if (/%[0-9A-Fa-f]{2}/.test(source)) {
    const encodedBytes = percentEncodedBytes(source);
    const utf8Percent = decodeBytes(encodedBytes, 'utf-8', { fatal: true });
    const eucKrPercent = decodeBytes(encodedBytes, 'euc-kr');
    if (utf8Percent) candidates.push(utf8Percent);
    if (eucKrPercent) candidates.push(eucKrPercent);
  }
  if ([...source].every((character) => character.charCodeAt(0) <= 0xFF)) {
    const bytes = Uint8Array.from(Buffer.from(source, 'latin1'));
    const utf8 = decodeBytes(bytes, 'utf-8', { fatal: true });
    const eucKr = decodeBytes(bytes, 'euc-kr');
    if (utf8) candidates.push(utf8);
    if (eucKr) candidates.push(eucKr);
  }
  return candidates
    .map((candidate, index) => ({ candidate: trim(candidate), score: filenameTextScore(candidate), index }))
    .filter(({ candidate }) => candidate)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.candidate || '';
};

const normalizeSourceFilename = (value) => {
  const decoded = recoverLegacyHeaderFilename(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  const leaf = decoded.split(/[\\/]/).pop()?.replace(/^[\"']+|[\"']+$/g, '').trim() || '';
  return leaf.slice(0, MAX_NAME_LENGTH);
};

const filenameFromContentDisposition = (value) => {
  const header = trim(value);
  if (!header) return '';
  const extended = header.match(/filename\*\s*=\s*([^']+)'[^']*'([^;]+)/i);
  if (extended?.[2]) {
    const decoded = decodeExtendedFilenameValue(extended[1], extended[2]);
    const candidate = normalizeSourceFilename(decoded);
    if (candidate) return candidate;
  }
  const regular = header.match(/filename\s*=\s*(?:\"([^\"]*)\"|([^;]+))/i);
  return normalizeSourceFilename(regular?.[1] || regular?.[2] || '');
};

const filenameFromUrl = (value) => {
  try {
    const parsed = parseTargetUrl(value);
    const segment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return normalizeSourceFilename(segment);
  } catch {
    return '';
  }
};

export const inferSecureAttachmentFilename = ({ contentDisposition = '', targetUrl = '' } = {}) => (
  filenameFromContentDisposition(contentDisposition) || filenameFromUrl(targetUrl)
);

export const normalizeSecureAttachmentInputs = (input = []) => {
  const items = Array.isArray(input) ? input : [];
  if (items.length > MAX_ATTACHMENTS) throw serviceError('attachment_count_exceeded', `A maximum of ${MAX_ATTACHMENTS} attachments is allowed.`);
  return Object.freeze(items.map((item) => {
    const id = trim(item?.id);
    const name = trim(item?.name || item?.displayName);
    const rawTargetUrl = trim(item?.targetUrl || item?.url);
    if (name.length > MAX_NAME_LENGTH) throw serviceError('attachment_name_too_long', 'Attachment display name is too long.');
    const targetUrl = rawTargetUrl ? parseTargetUrl(rawTargetUrl).toString() : '';
    if (!id && !targetUrl) throw serviceError('attachment_url_required', 'New attachments require an external HTTPS file URL.');
    return Object.freeze({
      id,
      generatedId: `att-${randomUUID().replaceAll('-', '')}`,
      name,
      targetUrl,
      fileSizeBytes: null,
      metadataChecked: false,
    });
  }));
};

const resolvePublicAddress = async (hostname) => {
  const normalizedHostname = normalizeHostname(hostname);
  const literalFamily = isIP(normalizedHostname);
  const records = literalFamily
    ? [{ address: normalizedHostname, family: literalFamily }]
    : await lookup(normalizedHostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw serviceError('attachment_url_host_forbidden', 'Attachment URL host is not allowed.', 400);
  }
  return records[0];
};

export const createPinnedLookup = (resolved) => (_hostname, options, callback) => {
  const record = { address: resolved.address, family: resolved.family };
  if (options?.all === true) {
    callback(null, [record]);
    return;
  }
  callback(null, record.address, record.family);
};

const validateUpstreamHeaders = (upstream) => {
  const contentType = trim(upstream.headers['content-type']).toLowerCase();
  if (contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml') || contentType.startsWith('text/javascript')) {
    upstream.resume();
    throw serviceError('attachment_direct_file_required', 'Attachment URL must point directly to a downloadable file.', 415);
  }
  const contentLength = Number(upstream.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
    upstream.resume();
    throw serviceError('attachment_file_too_large', 'Attachment exceeds the 50 MB secure-proxy limit.', 413);
  }
};

const openUpstreamRequest = async (targetUrl, { method = 'GET', requestHeaders = {} } = {}, redirects = 0) => {
  if (redirects > MAX_REDIRECTS) throw serviceError('attachment_redirect_limit', 'Attachment source redirected too many times.', 502);
  const parsed = parseTargetUrl(targetUrl);
  const resolved = await resolvePublicAddress(parsed.hostname);

  const upstream = await new Promise((resolve, reject) => {
    const request = httpsRequest(parsed, {
      method,
      headers: {
        Accept: '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36 MK-Rental-Secure-Attachment-Proxy/1.1',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        ...requestHeaders,
      },
      timeout: REQUEST_TIMEOUT_MS,
      lookup: createPinnedLookup(resolved),
    }, resolve);
    request.on('timeout', () => request.destroy(serviceError('attachment_source_timeout', 'Attachment source timed out.', 504)));
    request.on('error', reject);
    request.end();
  });

  if ([301, 302, 303, 307, 308].includes(Number(upstream.statusCode || 0))) {
    const location = trim(upstream.headers.location);
    upstream.resume();
    if (!location) throw serviceError('attachment_redirect_invalid', 'Attachment source returned an invalid redirect.', 502);
    return openUpstreamRequest(new URL(location, parsed).toString(), { method, requestHeaders }, redirects + 1);
  }
  if (Number(upstream.statusCode || 0) < 200 || Number(upstream.statusCode || 0) >= 300) {
    upstream.resume();
    throw serviceError('attachment_source_unavailable', 'Attachment source is unavailable.', 502);
  }
  validateUpstreamHeaders(upstream);
  Object.defineProperty(upstream, 'secureAttachmentFinalUrl', {
    value: parsed.toString(),
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return upstream;
};

const openUpstream = (targetUrl) => openUpstreamRequest(targetUrl, { method: 'GET' });

const parseContentRangeTotal = (value) => {
  const match = trim(value).match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
};

const assertMetadataSizeAllowed = (size) => {
  if (Number.isFinite(size) && size > MAX_DOWNLOAD_BYTES) {
    throw serviceError('attachment_file_too_large', 'Attachment exceeds the 50 MB secure-proxy limit.', 413);
  }
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
};

export const probeSecureAttachmentMetadata = async (targetUrl) => {
  let head = null;
  let detectedFileName = filenameFromUrl(targetUrl);
  try {
    head = await openUpstreamRequest(targetUrl, { method: 'HEAD' });
    detectedFileName = inferSecureAttachmentFilename({
      contentDisposition: head.headers['content-disposition'],
      targetUrl: head.secureAttachmentFinalUrl || targetUrl,
    }) || detectedFileName;
    const rawContentLength = head.headers['content-length'];
    const contentLength = rawContentLength === undefined ? null : Number(rawContentLength);
    head.resume();
    if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
      return Object.freeze({
        fileSizeBytes: assertMetadataSizeAllowed(contentLength),
        fileName: detectedFileName,
        checked: true,
      });
    }
  } catch (error) {
    if (['attachment_url_host_forbidden', 'attachment_direct_file_required', 'attachment_file_too_large'].includes(error?.code)) throw error;
  }

  let ranged = null;
  try {
    ranged = await openUpstreamRequest(targetUrl, { method: 'GET', requestHeaders: { Range: 'bytes=0-0' } });
    detectedFileName = inferSecureAttachmentFilename({
      contentDisposition: ranged.headers['content-disposition'],
      targetUrl: ranged.secureAttachmentFinalUrl || targetUrl,
    }) || detectedFileName;
    const status = Number(ranged.statusCode || 0);
    let size = null;
    if (status === 206) size = parseContentRangeTotal(ranged.headers['content-range']);
    else if (status === 200) {
      const rawContentLength = ranged.headers['content-length'];
      const contentLength = rawContentLength === undefined ? null : Number(rawContentLength);
      if (Number.isSafeInteger(contentLength) && contentLength >= 0) size = contentLength;
    }
    if (ranged && !ranged.destroyed) ranged.destroy();
    return Object.freeze({
      fileSizeBytes: assertMetadataSizeAllowed(size),
      fileName: detectedFileName,
      checked: true,
    });
  } catch (error) {
    if (ranged && !ranged.destroyed) ranged.destroy();
    if (['attachment_url_host_forbidden', 'attachment_direct_file_required', 'attachment_file_too_large'].includes(error?.code)) throw error;
    return Object.freeze({ fileSizeBytes: null, fileName: detectedFileName, checked: false });
  }
};

export const prepareSecureAttachmentInputs = async (input = []) => {
  const normalized = normalizeSecureAttachmentInputs(input);
  return Object.freeze(await Promise.all(normalized.map(async (attachment) => {
    if (!attachment.targetUrl) return attachment;
    const metadata = await probeSecureAttachmentMetadata(attachment.targetUrl);
    const resolvedName = attachment.name || metadata.fileName || filenameFromUrl(attachment.targetUrl) || '첨부파일';
    return Object.freeze({
      ...attachment,
      name: resolvedName.slice(0, MAX_NAME_LENGTH),
      fileSizeBytes: metadata.fileSizeBytes,
      metadataChecked: metadata.checked,
    });
  })));
};

const safeAsciiFilename = (name) => trim(name).replace(/[\r\n"\\/]/g, '_').replace(/[^\x20-\x7E]/g, '_').slice(0, 120) || 'attachment';
const encodeDispositionFilename = (value) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const contentDisposition = (name) => {
  const ascii = safeAsciiFilename(name);
  const encoded = encodeDispositionFilename(trim(name) || 'attachment');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

const finishResponse = (response) => new Promise((resolve, reject) => {
  let settled = false;
  const cleanup = () => {
    response.removeListener?.('finish', onFinish);
    response.removeListener?.('close', onClose);
    response.removeListener?.('error', onError);
  };
  const settle = (handler) => {
    if (settled) return;
    settled = true;
    cleanup();
    handler();
  };
  const onFinish = () => settle(resolve);
  const onClose = () => settle(() => response.writableFinished ? resolve() : reject(serviceError('attachment_client_aborted', 'Attachment download was interrupted.', 499)));
  const onError = (error) => settle(() => reject(error));
  response.once?.('finish', onFinish);
  response.once?.('close', onClose);
  response.once?.('error', onError);
  response.end();
});

export const createSecureAttachmentService = ({ repository }) => {
  if (!repository) throw new TypeError('Secure attachment repository is required.');
  return Object.freeze({
    async prepareInputs(input) {
      return prepareSecureAttachmentInputs(input);
    },

    async backfillMissingMetadata({ limit = 25, concurrency = 3 } = {}) {
      if (typeof repository.claimMissingMetadata !== 'function' || typeof repository.updateProbedMetadata !== 'function') {
        return Object.freeze({ claimed: 0, updated: 0 });
      }
      const claimed = await repository.claimMissingMetadata(limit);
      const queue = [...claimed];
      let updated = 0;
      const workerCount = Math.max(1, Math.min(5, Math.trunc(Number(concurrency) || 3)));
      const workers = Array.from({ length: Math.min(workerCount, queue.length) }, async () => {
        while (queue.length) {
          const attachment = queue.shift();
          if (!attachment?.id || !attachment?.targetUrl) continue;
          try {
            const metadata = await probeSecureAttachmentMetadata(attachment.targetUrl);
            if (metadata.fileSizeBytes !== null) {
              await repository.updateProbedMetadata(attachment.id, metadata.fileSizeBytes);
              updated += 1;
            }
          } catch {
            // Backfill is best-effort. Download-time streaming still records the exact size.
          }
        }
      });
      await Promise.all(workers);
      return Object.freeze({ claimed: claimed.length, updated });
    },

    async getDownloadRecord(attachmentId) {
      const record = await repository.getDownloadRecord(trim(attachmentId));
      if (!record) throw serviceError('attachment_not_found', 'Attachment was not found.', 404);
      return record;
    },

    async streamDownload({ record, response, headers = {} }) {
      const upstream = await openUpstream(record.targetUrl);
      const responseHeaders = {
        ...headers,
        'Content-Type': trim(upstream.headers['content-type']) || 'application/octet-stream',
        'Content-Disposition': contentDisposition(record.name),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      const contentLength = Number(upstream.headers['content-length'] || 0);
      if (Number.isFinite(contentLength) && contentLength > 0) responseHeaders['Content-Length'] = String(contentLength);
      response.writeHead(200, responseHeaders);
      let transferred = 0;
      try {
        for await (const chunk of upstream) {
          if (response.destroyed) throw serviceError('attachment_client_aborted', 'Attachment download was interrupted.', 499);
          transferred += chunk.length;
          if (transferred > MAX_DOWNLOAD_BYTES) {
            upstream.destroy();
            response.destroy();
            return Object.freeze({ completed: false, transferredBytes: transferred });
          }
          if (!response.write(chunk)) {
            await new Promise((resolve, reject) => {
              const onDrain = () => { cleanup(); resolve(); };
              const onClose = () => { cleanup(); reject(serviceError('attachment_client_aborted', 'Attachment download was interrupted.', 499)); };
              const onError = (error) => { cleanup(); reject(error); };
              const cleanup = () => {
                response.removeListener?.('drain', onDrain);
                response.removeListener?.('close', onClose);
                response.removeListener?.('error', onError);
              };
              response.once?.('drain', onDrain);
              response.once?.('close', onClose);
              response.once?.('error', onError);
            });
          }
        }
        await finishResponse(response);
        await repository.recordCompletedDownload(record.id, transferred).catch(() => null);
        return Object.freeze({ completed: true, transferredBytes: transferred });
      } catch {
        if (!response.destroyed) response.destroy();
        return Object.freeze({ completed: false, transferredBytes: transferred });
      }
    },
  });
};
