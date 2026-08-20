import { Paperclip, Plus, Trash2 } from 'lucide-react';

const MAX_ATTACHMENTS = 5;
const trim = (value) => String(value ?? '').trim();
const newKey = () => `attachment-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function SecureAttachmentEditor({ value = [], onChange, disabled = false, label = '첨부파일' }) {
  const attachments = Array.isArray(value) ? value : [];
  const updateAt = (index, patch) => {
    onChange?.(attachments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const removeAt = (index) => onChange?.(attachments.filter((_, itemIndex) => itemIndex !== index));
  const add = () => {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    onChange?.([...attachments, { clientKey: newKey(), id: '', name: '', targetUrl: '' }]);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Paperclip size={16} />{label}</div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">외부 HTTPS 직접 다운로드 주소를 등록합니다. 원본 주소는 등록 요청 시 서버로 전송된 뒤, 저장 이후 조회 화면/API 응답에는 다시 노출되지 않고 보안 다운로드 주소만 사용됩니다. 최대 {MAX_ATTACHMENTS}개.</p>
        </div>
        <button type="button" disabled={disabled || attachments.length >= MAX_ATTACHMENTS} onClick={add} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} />첨부파일 추가</button>
      </div>

      {attachments.length ? (
        <div className="space-y-3">
          {attachments.map((attachment, index) => {
            const existing = Boolean(trim(attachment?.id));
            return (
              <div key={attachment?.id || attachment?.clientKey || index} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_auto]">
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-slate-500">표시 파일명</div>
                  <input type="text" value={attachment?.name || ''} disabled={disabled} maxLength={180} onChange={(event) => updateAt(index, { name: event.target.value })} placeholder="예: 신청서.pdf" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus disabled:bg-slate-100" />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold text-slate-500">외부 HTTPS 파일 주소{existing ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">등록됨</span> : null}</div>
                  <input type="url" value={attachment?.targetUrl || ''} disabled={disabled} onChange={(event) => updateAt(index, { targetUrl: event.target.value })} placeholder={existing ? '기존 보안 링크 유지 · 변경할 때만 새 URL 입력' : 'https://... 직접 다운로드 파일 주소'} autoComplete="off" spellCheck={false} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-focus disabled:bg-slate-100" />
                </div>
                <div className="flex items-end justify-end">
                  <button type="button" disabled={disabled} onClick={() => removeAt(index)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-50" aria-label="첨부파일 삭제" title="첨부파일 삭제"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-400">등록된 첨부파일이 없습니다. 첨부하지 않으면 본문에도 표시되지 않습니다.</div>}
    </div>
  );
}
