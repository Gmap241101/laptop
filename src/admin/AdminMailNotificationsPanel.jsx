import { useEffect, useMemo, useState } from 'react';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';

const changed = (left, right) => left?.enabled !== right?.enabled || left?.subject !== right?.subject || left?.body !== right?.body;
export default function AdminMailNotificationsPanel({ ctx }) {
  const [snapshot, setSnapshot] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const role = ctx.authenticatedAdminAccount?.adminRole;
  const owner = role === 'owner';
  const load = async () => {
    setBusy(true); setMessage('');
    try {
      const data = await clerkStagingClient.getAdminMailNotificationSettings();
      setSnapshot(data);
      setDrafts(Object.fromEntries(data.events.map(({ key, enabled, subject, body }) => [key, { enabled, subject, body }])));
      setSelected((key) => data.events.some((e) => e.key === key) ? key : data.events[0]?.key || '');
    } catch { setMessage('알림 설정을 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (owner) void load(); }, [owner]);
  const current = useMemo(() => snapshot?.events?.find((event) => event.key === selected), [snapshot, selected]);
  const draft = drafts[selected] || null;
  const pending = current && draft && changed(current, draft);
  const setField = (field, value) => setDrafts((previous) => ({ ...previous, [selected]: { ...previous[selected], [field]: value } }));
  const save = async () => {
    if (!current || !draft || !pending || busy) return;
    setBusy(true); setMessage('');
    try {
      const data = await clerkStagingClient.saveAdminMailNotificationEvent(selected, { ...draft, expectedRevision: snapshot.revision });
      setSnapshot(data);
      setDrafts(Object.fromEntries(data.events.map(({ key, enabled, subject, body }) => [key, { enabled, subject, body }])));
      setMessage('저장되었습니다. 실제 이메일 발송은 아직 비활성화되어 있습니다.');
    } catch (error) { setMessage(error?.status === 409 ? '다른 관리자가 먼저 변경했습니다. 다시 불러온 후 저장하세요.' : `저장하지 못했습니다. 입력값을 확인해 주세요. 오류 코드: ${error?.code || 'mail_settings_save_failed'}`); }
    finally { setBusy(false); }
  };
  if (!owner) return <div className="p-6 text-sm text-slate-700">최고관리자만 이메일 발송 정책을 관리할 수 있습니다.</div>;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-black text-slate-900">이메일 알림 관리</h2><p className="mt-1 text-sm text-slate-500">발송 유형별 설정과 안내 문구를 관리합니다.</p></div>
      <button type="button" disabled={busy} onClick={load} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">새로고침</button>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      실메일 발송 준비 중입니다. 여기서 ON으로 설정해도 이메일은 발송되지 않습니다.
    </div>
    {message && <p className="text-sm font-semibold text-slate-700" role="status">{message}</p>}
    {!snapshot ? <p className="py-6 text-sm">{busy ? '불러오는 중...' : '설정을 불러올 수 없습니다.'}</p> :
    <div className="grid gap-4 lg:grid-cols-[270px_1fr]">
      <div className="max-h-[580px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {snapshot.events.map((event) => <button type="button" key={event.key}
          onClick={() => { if (pending && !window.confirm('저장하지 않은 변경사항을 취소하고 이동하시겠습니까?')) return; setSelected(event.key); setMessage(''); }}
          className={`w-full rounded-lg px-3 py-3 text-left text-sm ${selected === event.key ? 'bg-orange-50 font-bold text-orange-800' : 'hover:bg-slate-50'}`}>
          <span className="block text-xs text-slate-500">{event.category} · {event.recipient === 'admin' ? '관리자' : '사용자'}</span>
          {event.title}<span className={`ml-2 text-xs ${drafts[event.key]?.enabled ? 'text-green-700' : 'text-slate-400'}`}>{drafts[event.key]?.enabled ? 'ON' : 'OFF'}</span>
        </button>)}
      </div>
      {current && draft && <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">{current.title}</h3>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => setField('enabled', e.target.checked)} className="h-5 w-5 accent-orange-600" />이 유형의 알림 발송 사용</label>
        <div className="space-y-2"><label htmlFor="mail-subject" className="text-sm font-bold">메일 제목</label>
          <input id="mail-subject" className="w-full rounded-lg border border-slate-300 p-3 text-sm" maxLength={150} value={draft.subject} onChange={(e) => setField('subject', e.target.value)}/></div>
        <div className="space-y-2"><label htmlFor="mail-body" className="text-sm font-bold">메일 본문</label>
          <textarea id="mail-body" rows={11} maxLength={6000} className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-6" value={draft.body} onChange={(e) => setField('body', e.target.value)}/>
          <p className="text-xs text-slate-500">사용 가능한 변수: {current.variables.map((x) => `{{${x}}}`).join(', ')}</p></div>
        <div className="flex gap-2"><button type="button" onClick={save} disabled={!pending || busy} className="rounded-lg bg-[var(--mk-orange)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">저장</button>
          <button type="button" disabled={busy || !pending} onClick={() => setDrafts((d) => ({ ...d, [selected]: { enabled: current.enabled, subject: current.subject, body: current.body } }))} className="rounded-lg border px-5 py-2.5 text-sm">변경 취소</button></div>
      </div>}
    </div>}
  </section>;
}
