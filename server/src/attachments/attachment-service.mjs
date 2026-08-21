import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

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

export const normalizeSecureAttachmentInputs = (input = []) => {
  const items = Array.isArray(input) ? input : [];
  if (items.length > MAX_ATTACHMENTS) throw serviceError('attachment_count_exceeded', `A maximum of ${MAX_ATTACHMENTS} attachments is allowed.`);
  return Object.freeze(items.map((item) => {
    const id = trim(item?.id);
    const name = trim(item?.name || item?.displayName);
    const rawTargetUrl = trim(item?.targetUrl || item?.url);
    if (!name) throw serviceError('attachment_name_required', 'Attachment display name is required.');
    if (name.length > MAX_NAME_LENGTH) throw serviceError('attachment_name_too_long', 'Attachment display name is too long.');
    const targetUrl = rawTargetUrl ? parseTargetUrl(rawTargetUrl).toString() : '';
    if (!id && !targetUrl) throw serviceError('attachment_url_required', 'New attachments require an external HTTPS file URL.');
    return Object.freeze({
      id,
      generatedId: `att-${randomUUID().replaceAll('-', '')}`,
      name,
      targetUrl,
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

const openUpstream = async (targetUrl, redirects = 0) => {
  if (redirects > MAX_REDIRECTS) throw serviceError('attachment_redirect_limit', 'Attachment source redirected too many times.', 502);
  const parsed = parseTargetUrl(targetUrl);
  const resolved = await resolvePublicAddress(parsed.hostname);

  const upstream = await new Promise((resolve, reject) => {
    const request = httpsRequest(parsed, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent': 'MK-Rental-Secure-Attachment-Proxy/1.0',
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
    return openUpstream(new URL(location, parsed).toString(), redirects + 1);
  }
  if (Number(upstream.statusCode || 0) < 200 || Number(upstream.statusCode || 0) >= 300) {
    upstream.resume();
    throw serviceError('attachment_source_unavailable', 'Attachment source is unavailable.', 502);
  }
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
  return upstream;
};

const safeAsciiFilename = (name) => trim(name).replace(/[\r\n"\\/]/g, '_').replace(/[^\x20-\x7E]/g, '_').slice(0, 120) || 'attachment';
const encodeDispositionFilename = (value) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const contentDisposition = (name) => {
  const ascii = safeAsciiFilename(name);
  const encoded = encodeDispositionFilename(trim(name) || 'attachment');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

export const createSecureAttachmentService = ({ repository }) => {
  if (!repository) throw new TypeError('Secure attachment repository is required.');
  return Object.freeze({
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
          transferred += chunk.length;
          if (transferred > MAX_DOWNLOAD_BYTES) {
            upstream.destroy();
            response.destroy();
            return;
          }
          if (!response.write(chunk)) await new Promise((resolve) => response.once('drain', resolve));
        }
        response.end();
      } catch {
        if (!response.destroyed) response.destroy();
      }
    },
  });
};
