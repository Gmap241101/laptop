import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
const RichTextEditor = lazy(() => import('../components/RichTextEditor.jsx').then((m) => ({ default: m.RichTextEditor })));
const escapeText = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toEditorBody = ({ body, bodyFormat }) => bodyFormat === 'html' ? body : String(body || '').split(/\r?\n/).map((line) => `<p>${escapeText(line) || '&nbsp;'}</p>`).join('');
const fromEvent = (event) => ({ enabled:event.enabled, subject:event.subject, body:toEditorBody(event), bodyFormat:'html' });
const changed = (original, draft) => original?.enabled !== draft?.enabled || original?.subject !== draft?.subject || toEditorBody(original) !== draft?.body;
const variableLabels = {
  name:'성명', siteUrl:'사이트 주소', teamName:'부서(팀)',
  signupRequestedAt:'가입 신청 일시', signupReviewedAt:'가입 심사 일시', signupDecisionAt:'가입 결과 일시', withdrawnAt:'탈퇴 완료 일시',
  restrictedAt:'계정 제한 일시', unrestrictedAt:'계정 제한 해제 일시', restrictionReason:'제한 사유',
  rentalRequestedAt:'대여 신청 일시', rentalApprovedAt:'대여 승인 일시', rentalRejectedAt:'대여 거절 일시',
  rentalStartAt:'대여 시작일시', rentalDueAt:'반납 예정일', rentalReturnedAt:'실제 반납일시',
  assetName:'기기 명칭', assetCode:'기기 관리번호', requestNumber:'신청번호', rentalRejectionReason:'대여 거절 사유',
  extensionRequestedAt:'연장 신청 일시', extensionDecisionAt:'연장 승인·거절 일시',
  previousRentalDueAt:'기존 반납 예정일', newRentalDueAt:'변경된 반납 예정일', extensionRejectionReason:'연장 거절 사유',
  inquirySubmittedAt:'문의 등록 일시', answerCreatedAt:'답변 등록 일시', inquiryTitle:'문의 제목', inquiryNumber:'문의번호',
  rentalCancelledAt:'대여 취소 일시',
};
export default function AdminMailNotificationsPanel({ ctx }) {
  const [snapshot,setSnapshot] = useState(null);
  const [drafts,setDrafts] = useState({});
  const [selected,setSelected] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const owner = ctx.authenticatedAdminAccount?.adminRole === 'owner';
  const load = async () => {
    setBusy(true); setMessage('');
    try {
      const data = await clerkStagingClient.getAdminMailNotificationSettings();
      setSnapshot(data);
      setDrafts(Object.fromEntries(data.events.map((event) => [event.key,fromEvent(event)])));
      setSelected((key) => data.events.some((e) => e.key === key) ? key : data.events[0]?.key || '');
    } catch { setMessage('알림 설정을 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (owner) void load(); }, [owner]);
  const current = useMemo(() => snapshot?.events?.find((event) => event.key === selected), [snapshot,selected]);
  const draft = drafts[selected] || null;
  const pending = Boolean(current && draft && changed(current,draft));
  const setField = (field,value) => setDrafts((before) => ({ ...before,[selected]:{ ...before[selected],[field]:value } }));
  const save = async () => {
    if (!current || !draft || !pending || busy) return;
    setBusy(true); setMessage('');
    try {
      const data = await clerkStagingClient.saveAdminMailNotificationEvent(selected,{ ...draft,expectedRevision: snapshot.revision });
      setSnapshot(data);
      setDrafts(Object.fromEntries(data.events.map((event) => [event.key,fromEvent(event)])));
      setMessage('저장되었습니다.');
    } catch (e) { setMessage(e?.status === 409 ? '다른 관리자가 먼저 변경했습니다. 다시 불러온 후 저장하세요.' : `저장하지 못했습니다. 본문 형식과 변수를 확인해 주세요. 오류 코드: ${e?.code || 'mail_settings_save_failed'}`); }
    finally { setBusy(false); }
  };
  const copyVariable = async (name) => {
    try { await navigator.clipboard.writeText(`{{${name}}}`); setMessage('변수를 복사했습니다. 원하는 위치에 붙여넣으세요.'); }
    catch { setMessage('복사할 수 없습니다. 변수 코드를 선택하여 붙여넣으세요.'); }
  };
  if (!owner) return <div className="p-6 text-sm text-slate-700">최고관리자만 이메일 알림을 관리할 수 있습니다.</div>;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-black text-slate-900">이메일 알림 관리</h2><p className="mt-1 text-sm text-slate-500">발송 유형별 설정과 메일 내용을 관리합니다.</p></div>
      <button type="button" disabled={busy} onClick={load} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">새로고침</button>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">실제 이메일 발송은 아직 시작되지 않았습니다.</div>
    {message && <p className="text-sm font-semibold text-slate-700" role="status">{message}</p>}
    {!snapshot ? <p className="py-6 text-sm">{busy ? '불러오는 중...' : '설정을 불러올 수 없습니다.'}</p> :
    <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
      <div className="max-h-[650px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {snapshot.events.map((event) => <button type="button" key={event.key}
          onClick={() => { if (pending && !window.confirm('저장하지 않은 변경사항을 취소하고 이동하시겠습니까?')) return; setSelected(event.key);setMessage(''); }}
          className={`w-full rounded-lg px-3 py-3 text-left text-sm ${selected === event.key ? 'bg-orange-50 font-bold text-orange-800' : 'hover:bg-slate-50'}`}>
          <span className="block text-xs text-slate-500">{event.category} · {event.recipient === 'admin' ? '관리자' : '사용자'}</span>
          {event.title}<span className={`ml-2 text-xs ${drafts[event.key]?.enabled ? 'text-green-700' : 'text-slate-400'}`}>{drafts[event.key]?.enabled ? 'ON' : 'OFF'}</span>
        </button>)}
      </div>
      {current && draft && <div className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">{current.title}</h3>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold text-slate-800">이 유형의 알림 발송 사용</span>
          <button type="button" role="switch" aria-label="이 유형의 알림 발송 사용" aria-checked={draft.enabled}
            disabled={busy} onClick={() => setField('enabled',!draft.enabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${draft.enabled ? 'bg-[var(--mk-orange)]' : 'bg-slate-300'} disabled:opacity-50`}>
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${draft.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="space-y-2"><label htmlFor="mail-subject" className="text-sm font-bold">메일 제목</label>
          <input id="mail-subject" className="w-full rounded-lg border border-slate-300 p-3 text-sm" maxLength={150} value={draft.subject} disabled={busy} onChange={(e) => setField('subject',e.target.value)}/></div>
        <div className="space-y-2">
          <h4 className="text-sm font-bold">사용 가능한 변수 ({current.variables.length}개)</h4>
          <p className="text-xs text-slate-500">변수를 선택하면 코드가 복사됩니다. 메일 제목이나 본문에 붙여넣으세요.</p>
          <div className="flex max-h-[170px] flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {current.variables.map((variable) => <button key={variable} type="button" title={`{{${variable}}}`} onClick={() => copyVariable(variable)}
              className="rounded-md border border-orange-200 bg-white px-2 py-1.5 text-left text-xs hover:bg-orange-50">
              <span className="font-semibold">{variableLabels[variable] || variable}</span><span className="ml-1 text-slate-500">{`{{${variable}}}`}</span>
            </button>)}
          </div>
        </div>
        <Suspense fallback={<p className="text-sm">에디터를 불러오는 중...</p>}>
          <RichTextEditor key={selected} label="메일 본문" value={draft.body} onChange={(body) => setField('body',body)}
            minHeight={300} disabled={busy} allowVideos={false} allowImages={false}/>
        </Suspense>
        <p className="text-xs text-slate-500">메일에서는 이미지·동영상 등 외부 콘텐츠를 사용할 수 없습니다. 안전한 서식과 링크만 저장됩니다.</p>
        <div className="flex gap-2"><button type="button" onClick={save} disabled={!pending || busy} className="rounded-lg bg-[var(--mk-orange)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">저장</button>
          <button type="button" disabled={busy || !pending} onClick={() => setDrafts((d) => ({ ...d,[selected]:fromEvent(current) }))} className="rounded-lg border px-5 py-2.5 text-sm">변경 취소</button></div>
      </div>}
    </div>}
  </section>;
}
