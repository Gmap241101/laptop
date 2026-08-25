import { getActiveClerkRuntimeClient } from '../../clerk/clerkRuntimeClient.js';

const trim = (value) => String(value ?? '').trim();

const getApiBaseUrl = () => {
  const clerkClient = getActiveClerkRuntimeClient();
  const configured = trim(clerkClient?.config?.apiBaseUrl || import.meta.env?.VITE_API_URL);
  if (!configured) {
    const error = new Error('Attachment API base URL is not configured.');
    error.code = 'attachment_api_not_configured';
    throw error;
  }
  return configured.replace(/\/+$/, '');
};

export const getSecureAttachmentUrl = (attachmentId) =>
  `${getApiBaseUrl()}/api/attachments/${encodeURIComponent(trim(attachmentId))}/download`;

const getClerkToken = async () => {
  const clerkClient = getActiveClerkRuntimeClient();
  const token = typeof clerkClient.getSessionToken === 'function'
    ? await clerkClient.getSessionToken()
    : await (async () => {
        const clerk = await clerkClient.initialize();
        return clerk?.session?.getToken?.();
      })();
  if (!token) {
    const error = new Error('로그인이 필요합니다.');
    error.code = 'attachment_clerk_session_required';
    throw error;
  }
  return token;
};

export const downloadSecureAttachment = async ({ attachment, authMode = 'public', guestToken = '' }) => {
  const id = trim(attachment?.id);
  if (!id) throw Object.assign(new Error('첨부파일 정보가 올바르지 않습니다.'), { code: 'attachment_id_required' });
  const headers = { Accept: '*/*' };
  if (authMode === 'clerk') headers.Authorization = `Bearer ${await getClerkToken()}`;
  if (authMode === 'guest') {
    const token = trim(guestToken);
    if (!token) throw Object.assign(new Error('비회원 문의 확인 인증이 필요합니다.'), { code: 'guest_inquiry_session_required' });
    headers.Authorization = `Guest ${token}`;
  }
  const response = await fetch(getSecureAttachmentUrl(id), { method: 'GET', headers, cache: 'no-store' });
  if (!response.ok) {
    let payload = null;
    try { payload = await response.json(); } catch { /* binary/error body */ }
    const error = new Error('첨부파일 다운로드에 실패했습니다.');
    error.status = response.status;
    error.code = payload?.error || 'attachment_download_failed';
    throw error;
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = trim(attachment?.name) || 'attachment';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
};
