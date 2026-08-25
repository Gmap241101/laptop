import { useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { downloadSecureAttachment, getSecureAttachmentUrl } from '../features/attachments/secureAttachmentApi.js';

const formatFileSize = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '용량 미확인';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 ** 2)).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
};

const normalizeDownloadCount = (value) => Math.max(0, Math.trunc(Number(value) || 0));

const AttachmentLabel = ({ attachment }) => (
  <span className="min-w-0">
    <span className="block truncate font-semibold text-slate-700">{attachment.name}</span>
    <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
      {formatFileSize(attachment.fileSizeBytes)} · 다운로드 {normalizeDownloadCount(attachment.downloadCount)}회
    </span>
  </span>
);

export default function SecureAttachmentList({ attachments = [], authMode = 'public', guestToken = '' }) {
  const items = Array.isArray(attachments) ? attachments.filter((item) => item?.id && item?.name) : [];
  const [downloadingId, setDownloadingId] = useState('');
  const [errorCode, setErrorCode] = useState('');
  if (!items.length) return null;

  const downloadProtected = async (attachment) => {
    setDownloadingId(attachment.id);
    setErrorCode('');
    try {
      await downloadSecureAttachment({ attachment, authMode, guestToken });
    } catch (error) {
      setErrorCode(error?.code || 'attachment_download_failed');
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><Paperclip size={14} />첨부파일 {items.length}개</div>
      <div className="space-y-2">
        {items.map((attachment) => authMode === 'public' ? (
          <a key={attachment.id} href={getSecureAttachmentUrl(attachment.id)} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs transition hover:border-slate-300 hover:bg-white">
            <AttachmentLabel attachment={attachment} />
            <Download size={14} className="shrink-0 text-slate-500 transition group-hover:text-orange-600" />
          </a>
        ) : (
          <button key={attachment.id} type="button" disabled={downloadingId === attachment.id} onClick={() => void downloadProtected(attachment)} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-xs transition hover:border-slate-300 hover:bg-white disabled:cursor-wait disabled:opacity-60">
            <AttachmentLabel attachment={attachment} />
            <Download size={14} className="shrink-0 text-slate-500 transition group-hover:text-orange-600" />
          </button>
        ))}
      </div>
      {errorCode ? <p className="mt-2 text-[11px] text-rose-600">첨부파일 다운로드에 실패했습니다. 오류 코드: {errorCode}</p> : null}
    </div>
  );
}
