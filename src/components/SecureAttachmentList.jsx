import { useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { downloadSecureAttachment, getSecureAttachmentUrl } from '../features/attachments/secureAttachmentApi.js';

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
          <a key={attachment.id} href={getSecureAttachmentUrl(attachment.id)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-orange-600">
            <span className="min-w-0 truncate font-semibold">{attachment.name}</span><Download size={14} className="shrink-0" />
          </a>
        ) : (
          <button key={attachment.id} type="button" disabled={downloadingId === attachment.id} onClick={() => void downloadProtected(attachment)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-xs text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-orange-600 disabled:cursor-wait disabled:opacity-60">
            <span className="min-w-0 truncate font-semibold">{attachment.name}</span><Download size={14} className="shrink-0" />
          </button>
        ))}
      </div>
      {errorCode ? <p className="mt-2 text-[11px] text-rose-600">첨부파일 다운로드에 실패했습니다. 오류 코드: {errorCode}</p> : null}
    </div>
  );
}
