import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
const RichTextEditor = lazy(() => import('../components/RichTextEditor.jsx').then((m) => ({ default: m.RichTextEditor })));
const escapeText = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toEditorBody = ({ body, bodyFormat }) => bodyFormat === 'html' ? body : String(body || '').split(/\r?\n/).map((line) => `<p>${escapeText(line) || '&nbsp;'}</p>`).join('');
const fromEvent = (event) => ({ enabled:event.enabled, subject:event.subject, body:toEditorBody(event), bodyFormat:'html' });
const changed = (original, draft) => original?.enabled !== draft?.enabled || original?.subject !== draft?.subject || toEditorBody(original) !== draft?.body;
const mailStateLabels = {queued:'발송 대기',retry:'재시도 대기',processing:'처리 중',sent:'발송 완료',failed:'발송 실패',cancelled:'취소',uncertain:'확인 필요'};
// Server codes are retained only for diagnostic contracts. The admin UI must
// display actionable messages rather than implementation-specific identifiers.
const g6BlockerLabels = Object.freeze({
  g6_allowlist_1_to_5_required:'Sandbox 시험용으로 승인된 수신자 1~5명을 서버에 등록해 주세요.',
  g6_api_key_missing:'Brevo API 키가 아직 서버에 등록되지 않았습니다.',
  g6_brevo_provider_required:'서버 메일 공급자를 Brevo로 설정해 주세요.',
  g6_domain_verification_claim_missing:'Brevo 도메인 인증 상태를 확인한 뒤 서버에 반영해 주세요.',
  g6_live_mail_must_remain_disabled:'실제 메일 발송은 비활성화 상태여야 합니다.',
  g6_sender_not_configured:'Sandbox 발신 주소를 지정된 이메일 주소로 설정해 주세요.',
  g6_staging_required:'이 사전점검은 Staging 환경에서만 사용할 수 있습니다.',
  g6_live_send_config_must_be_off:'실제 메일 발송 잠금이 유지돼야 합니다.',
  g6_source_delivery_locks_invalid:'발송 차단 설정을 점검해야 합니다.',
  offline_trial_limits_invalid:'Sandbox 시험의 허용 한도 구성을 확인해 주세요.',
  offline_recipient_not_approved:'허용 수신자 주소 형식을 확인해 주세요.',
  offline_sender_review_required:'발신자 및 도메인 인증 정보를 확인해 주세요.',
  offline_brevo_only:'Sandbox 공급자 설정을 확인해 주세요.',
  offline_staging_only:'Staging 환경 설정을 확인해 주세요.',
  offline_live_delivery_lock_required:'실제 발송 차단 설정을 확인해 주세요.',
  offline_source_lock_invalid:'기존 발송 차단 상태를 확인해 주세요.',
  mail_config_unavailable:'서버 메일 설정을 조회할 수 없습니다.',
});
const g6BlockerLabel = code => g6BlockerLabels[code] || 'Sandbox 사전점검 설정을 확인해 주세요.';

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
  const [designDraft,setDesignDraft] = useState(null);
  const [designMessage,setDesignMessage] = useState('');
  const [mailPreview,setMailPreview] = useState(null);
  const [mailPreviewBusy,setMailPreviewBusy] = useState(false);
  const [mailPreviewMessage,setMailPreviewMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [mailPreflight,setMailPreflight] = useState(null);
  const [mailPreflightBusy,setMailPreflightBusy] = useState(false);
  const [mailPreflightMessage,setMailPreflightMessage] = useState('');
  const [g5Available,setG5Available] = useState(false);
  useEffect(()=>{
    if(ctx.authenticatedAdminAccount?.adminRole!=='owner')return undefined;
    let active=true;
    void clerkStagingClient.getAdminG5Availability().then(result=>{
      if(active)setG5Available(result.available===true);
    }).catch(()=>{if(active)setG5Available(false);});
    return ()=>{active=false;};
  },[ctx.authenticatedAdminAccount?.adminRole]);
  const [g5Code,setG5Code] = useState('');
  const [g5Step,setG5Step] = useState('idle');
  const [g5Busy,setG5Busy] = useState(false);
  const [g5Message,setG5Message] = useState('');
  const beginG5Verification=async()=>{
    if(g5Busy||!g5Available)return;
    setG5Busy(true);setG5Message('');setG5Code('');
    try{
      // Recheck capability to prevent sending an unusable verification code.
      const capability=await clerkStagingClient.getAdminG5Availability();
      if(!capability.available){setG5Available(false);return;}
      await clerkStagingClient.beginBackupReverification();
      setG5Step('sent');
      setG5Message('본인 확인 코드를 이메일로 보냈습니다.');
    }catch{
      setG5Message('본인 확인 코드를 발송하지 못했습니다. 다시 시도해 주세요.');
    }finally{setG5Busy(false);}
  };
  const completeG5Verification=async()=>{
    if(g5Busy || !/^\d{6}$/.test(g5Code))return;
    setG5Busy(true);setG5Message('');
    try{
      await clerkStagingClient.completeBackupReverification(g5Code);
      setG5Code('');setG5Step('idle');
      await clerkStagingClient.getAdminG5OwnerCheck();
      setG5Message('최고관리자 본인 확인이 완료되었습니다.');
    }catch(error){
      setG5Code('');setG5Step('idle');
      if(error?.status===404){setG5Available(false);setG5Message('');}
      else setG5Message('본인 확인 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
    }finally{setG5Busy(false);}
  };
  // G6 sandbox inspection is read-only and requires a fresh Clerk code.
  const [g6Available,setG6Available] = useState(false);
  useEffect(()=>{
    if(ctx.authenticatedAdminAccount?.adminRole!=='owner')return undefined;
    let active=true;
    void clerkStagingClient.getAdminG6Availability().then(result=>{
      if(active)setG6Available(result.available===true);
    }).catch(()=>{if(active)setG6Available(false);});
    return ()=>{active=false;};
  },[ctx.authenticatedAdminAccount?.adminRole]);
  const [g6Code,setG6Code] = useState('');
  const [g6Step,setG6Step] = useState('idle');
  const [g6Busy,setG6Busy] = useState(false);
  const [g6Message,setG6Message] = useState('');
  const [g6Readiness,setG6Readiness] = useState(null);
  const beginG6Verification=async()=>{
    if(g6Busy||!g6Available)return;
    setG6Busy(true);setG6Message('');setG6Readiness(null);setG6Code('');
    try{
      const capability=await clerkStagingClient.getAdminG6Availability();
      if(!capability.available){setG6Available(false);return;}
      await clerkStagingClient.beginBackupReverification();
      setG6Step('sent');setG6Message('본인 확인 코드를 이메일로 보냈습니다.');
    }catch{setG6Message('본인 확인 코드를 발송하지 못했습니다.');}
    finally{setG6Busy(false);}
  };
  const completeG6Verification=async()=>{
    if(g6Busy||!/^[0-9]{6}$/.test(g6Code))return;
    setG6Busy(true);setG6Message('');setG6Readiness(null);
    try{
      await clerkStagingClient.completeBackupReverification(g6Code);
      setG6Step('idle');setG6Code('');
      const data=await clerkStagingClient.getAdminG6SandboxReadiness();
      setG6Readiness(data);setG6Message('Sandbox 사전점검 결과를 확인했습니다. 실제 메일은 발송되지 않습니다.');
    }catch(error){
      setG6Step('idle');setG6Code('');
      setG6Message(error?.status===404 ? '현재 Sandbox 사전점검 기능이 비활성화되어 있습니다.' :
        '본인 확인 또는 사전점검에 실패했습니다. 새 코드를 요청해 주세요.');
    }finally{setG6Busy(false);}
  };
  const [mailVerifyCode,setMailVerifyCode] = useState('');
  const [mailVerifyStep,setMailVerifyStep] = useState('idle');
  const reloadMailPreflight=async()=>{
    setMailPreflightBusy(true);setMailPreflightMessage('');
    try{setMailPreflight(await clerkStagingClient.getAdminMailPreflight());}
    catch{setMailPreflightMessage('발송 준비 상태를 확인하지 못했습니다.');}
    finally{setMailPreflightBusy(false);}
  };
  const beginMailReview=async()=>{
    if(mailPreflightBusy)return;
    setMailPreflightBusy(true);setMailPreflightMessage('');setMailVerifyCode('');
    try{await clerkStagingClient.beginAdminMailReverification();setMailVerifyStep('sent');setMailPreflightMessage('이메일로 확인 코드를 보냈습니다.');}
    catch{setMailPreflightMessage('본인 확인 코드를 보낼 수 없습니다. 다시 시도해 주세요.');}
    finally{setMailPreflightBusy(false);}
  };
  const completeMailReview=async()=>{
    if(mailPreflightBusy||!/^\d{6}$/.test(mailVerifyCode))return;
    setMailPreflightBusy(true);setMailPreflightMessage('');
    try{
      await clerkStagingClient.completeAdminMailReverification(mailVerifyCode);
      const saved=await clerkStagingClient.acknowledgeAdminMailPreflight();
      setMailVerifyStep('idle');setMailVerifyCode('');
      setMailPreflightMessage(`점검 확인이 기록되었습니다. (${saved.reviewId}번) 이메일 발송은 계속 중지되어 있습니다.`);
      setMailPreflight(await clerkStagingClient.getAdminMailPreflight());
    }catch(error){
      setMailPreflightMessage(error?.code==='mail_preflight_reverification_already_used'
        ? '이미 사용된 본인 확인입니다. 새 코드를 요청해 주세요.'
        : '본인 확인 또는 점검 기록에 실패했습니다. 새 코드를 요청해 주세요.');
      setMailVerifyStep('idle');setMailVerifyCode('');
    }finally{setMailPreflightBusy(false);}
  };
  const [queue,setQueue] = useState(null);
  const [queueBusy,setQueueBusy] = useState(false);
  const [queueMessage,setQueueMessage] = useState('');
  const [queueOpen,setQueueOpen] = useState(false);
  const [preview,setPreview] = useState(null);
  const [previewBusy,setPreviewBusy] = useState(false);
  const [previewMessage,setPreviewMessage] = useState('');
  const reloadPreview=async()=>{
    setPreviewBusy(true);setPreviewMessage('');
    try{setPreview(await clerkStagingClient.getAdminMailSchedulePreview());}
    catch{setPreviewMessage('반납 알림 대상을 확인하지 못했습니다.');}
    finally{setPreviewBusy(false);}
  };
  const retryMail=async(id)=>{
    if(!window.confirm('발송이 거절된 메일을 다시 대기 상태로 전환하시겠습니까?'))return;
    setQueueBusy(true);setQueueMessage('');
    try{await clerkStagingClient.retryAdminMail(id);
      setQueueMessage('재처리 대기 상태로 변경했습니다.');setQueue(await clerkStagingClient.getAdminMailQueue());}
    catch{setQueueMessage('이 메일은 안전하게 재처리할 수 없습니다.');}
    finally{setQueueBusy(false);}
  };
  const reloadQueue=async()=>{
    setQueueBusy(true);setQueueMessage('');
    try{setQueue(await clerkStagingClient.getAdminMailQueue());}
    catch{setQueueMessage('발송 내역을 불러오지 못했습니다.');}
    finally{setQueueBusy(false);}
  };
  const cancelQueued=async(id)=>{
    if(!window.confirm('선택한 대기 메일을 취소하시겠습니까?'))return;
    setQueueBusy(true);setQueueMessage('');
    try {await clerkStagingClient.cancelAdminQueuedMail(id);
      setQueueMessage('발송이 취소되었습니다.');setQueue(await clerkStagingClient.getAdminMailQueue());}
    catch(e){setQueueMessage(e?.status===409?'이미 처리되어 취소할 수 없습니다.':'메일 취소에 실패했습니다.');}
    finally{setQueueBusy(false);}
  };
  const owner = ctx.authenticatedAdminAccount?.adminRole === 'owner';
  const load = async () => {
    setBusy(true); setMessage('');
    try {
      const data = await clerkStagingClient.getAdminMailNotificationSettings();
      setSnapshot(data);
      setDesignDraft(data.design);
      setMailPreview(null);
      setDrafts(Object.fromEntries(data.events.map((event) => [event.key,fromEvent(event)])));
      setSelected((key) => data.events.some((e) => e.key === key) ? key : data.events[0]?.key || '');
    } catch { setMessage('알림 설정을 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (owner) void load(); }, [owner]);
  const current = useMemo(() => snapshot?.events?.find((event) => event.key === selected), [snapshot,selected]);
  const draft = drafts[selected] || null;
  const pending = Boolean(current && draft && changed(current,draft));
  const designPending = Boolean(snapshot?.design && designDraft &&
    ['senderName','brandTitle','footerText'].some((field) => snapshot.design[field] !== designDraft[field]));
  const saveDesign = async () => {
    if(!designPending || busy)return;
    setBusy(true);setDesignMessage('');setMailPreview(null);
    try{
      const data=await clerkStagingClient.saveAdminMailDesign({...designDraft,expectedRevision:snapshot.revision});
      setSnapshot(data);setDesignDraft(data.design);setDesignMessage('저장되었습니다.');
    }catch(error){setDesignMessage(error?.status===409?'다른 관리자가 먼저 변경했습니다. 새로고침 후 다시 저장하세요.':`디자인 설정을 저장하지 못했습니다. 입력 내용을 확인하세요. 오류 코드: ${error?.code || 'mail_design_save_failed'}`);}
    finally{setBusy(false);}
  };
  const makeMailPreview = async () => {
    if(!draft || !current || !designDraft || busy)return;
    setMailPreviewBusy(true);setMailPreviewMessage('');setMailPreview(null);
    try{const data=await clerkStagingClient.previewAdminMailTemplate({key:selected,template:draft,design:designDraft});setMailPreview(data);}
    catch(error){setMailPreviewMessage('미리보기를 표시할 수 없습니다. 제목·본문과 변수를 확인하세요.');}
    finally{setMailPreviewBusy(false);}
  };
  const setField = (field,value) => {setMailPreview(null);setDrafts((before) => ({ ...before,[selected]:{ ...before[selected],[field]:value } }));};
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
    {g5Available&&<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">최고관리자 본인 확인</h3>
        <button type="button" disabled={g5Busy} onClick={()=>void beginG5Verification()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">인증코드 받기</button>
      </div>
      {g5Step==='sent'&&<div className="flex flex-wrap items-center gap-2">
        <label htmlFor="g5-owner-verification-code" className="text-xs text-slate-700">인증코드</label>
        <input id="g5-owner-verification-code" type="text" inputMode="numeric" autoComplete="one-time-code"
          value={g5Code} maxLength={6} disabled={g5Busy} onChange={(e)=>setG5Code(e.target.value.replace(/\D/g,'').slice(0,6))}
          className="w-32 rounded-lg border border-slate-300 p-2 text-sm" />
        <button type="button" disabled={g5Busy||g5Code.length!==6} onClick={()=>void completeG5Verification()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">확인</button>
        <button type="button" disabled={g5Busy} onClick={()=>{setG5Step('idle');setG5Code('');setG5Message('');}}
          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">취소</button>
      </div>}
      {g5Message&&<p role="status" className="text-xs text-slate-700">{g5Message}</p>}
    </div>}
    {g6Available&&<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Brevo Sandbox 사전점검</h3>
        <button type="button" disabled={g6Busy} onClick={()=>void beginG6Verification()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">본인 확인 후 점검</button>
      </div>
      <p className="text-xs text-slate-600">외부 메일 발송 없이 설정 상태만 확인합니다. 발송 권한은 활성화되지 않습니다.</p>
      {g6Step==='sent'&&<div className="flex flex-wrap items-center gap-2">
        <label htmlFor="g6-sandbox-code" className="text-xs text-slate-700">인증코드</label>
        <input id="g6-sandbox-code" type="text" inputMode="numeric" autoComplete="one-time-code"
          value={g6Code} maxLength={6} disabled={g6Busy} onChange={e=>setG6Code(e.target.value.replace(/\D/g,'').slice(0,6))}
          className="w-32 rounded-lg border border-slate-300 p-2 text-sm" />
        <button type="button" disabled={g6Busy||g6Code.length!==6} onClick={()=>void completeG6Verification()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">점검</button>
        <button type="button" disabled={g6Busy} onClick={()=>{setG6Step('idle');setG6Code('');setG6Message('');}}
          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">취소</button>
      </div>}
      {g6Message&&<p role="status" className="text-xs text-slate-700">{g6Message}</p>}
      {g6Readiness&&<div className="space-y-1 text-xs text-slate-700">
        <p>발신자 설정: {g6Readiness.senderConfigured?'확인':'미설정'} · API 인증정보: {g6Readiness.credentialPresent?'등록됨':'미등록'} · 허용 수신자: {g6Readiness.allowlistCount}개</p>
        <p>합성 Sandbox 요청 구성: {g6Readiness.syntheticPlanReady?'준비됨':'추가 설정 필요'}</p>
        {g6Readiness.blockers?.length>0&&<div className="space-y-1"><p className="font-semibold">추가 확인 사항</p><ul className="list-disc pl-5 space-y-1">{g6Readiness.blockers.map((code,i)=><li key={`${code}-${i}`}>{g6BlockerLabel(code)}</li>)}</ul></div>}
        <p className="font-semibold text-slate-700">실제 공급자 호출 0건 · 실메일 발송 0건 · Sandbox 실행 승인 별도</p>
      </div>}
    </div>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">이메일 발송 전 점검</h3>
        <button type="button" disabled={mailPreflightBusy} onClick={()=>void reloadMailPreflight()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">상태 확인</button>
      </div>
      <p className="text-xs text-slate-600">발송 준비 상태와 대기 메일을 확인합니다. 점검 확인을 기록해도 실제 이메일은 발송되지 않습니다.</p>
      {mailPreflight&&<div className="space-y-2 text-xs text-slate-700">
        <p>현재 발송: <strong>중지</strong> · 대기 {mailPreflight.counts?.queued||0}건 · 재시도 대기 {mailPreflight.counts?.retry||0}건 · 오래된 대기 {mailPreflight.agedCount||0}건</p>
        {(mailPreflight.samples||[]).length>0&&<p>확인할 메일: {mailPreflight.samples.map(r=>`#${r.id} (${mailStateLabels[r.state]||r.state})`).join(', ')}</p>}
        {mailPreflight.latestReview&&<p>마지막 점검 확인: {new Date(mailPreflight.latestReview.createdAt).toLocaleString('ko-KR')}</p>}
        <p className="text-slate-500">대기 메일 취소는 아래 ‘발송 내역 및 대기 메일’에서 처리할 수 있습니다.</p>
      </div>}
      {mailPreflightMessage&&<p role="status" className="text-xs text-slate-700">{mailPreflightMessage}</p>}
      {mailPreflight&&<div className="flex flex-wrap items-center justify-end gap-2">
        {mailVerifyStep==='idle'?<button type="button" disabled={mailPreflightBusy} onClick={()=>void beginMailReview()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">본인 확인 후 점검 기록</button>
        :<><input type="text" inputMode="numeric" autoComplete="one-time-code" value={mailVerifyCode} maxLength={6}
            aria-label="이메일 확인 코드" placeholder="6자리 확인 코드" disabled={mailPreflightBusy}
            onChange={e=>setMailVerifyCode(e.target.value.replace(/\D/g,'').slice(0,6))}
            className="w-40 rounded-lg border px-3 py-2 text-xs"/>
          <button type="button" disabled={mailPreflightBusy||mailVerifyCode.length!==6} onClick={()=>void completeMailReview()}
            className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">확인</button>
          <button type="button" disabled={mailPreflightBusy} onClick={()=>{setMailVerifyStep('idle');setMailVerifyCode('');}}
            className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">취소</button></>}
      </div>}
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">반납 알림 대상 확인</h3>
        <button type="button" onClick={()=>void reloadPreview()} disabled={previewBusy} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">대상 확인</button>
      </div>
      {previewMessage&&<p role="status" className="text-xs text-slate-700">{previewMessage}</p>}
      {preview&&<div className="flex flex-wrap gap-3 text-xs text-slate-700">
        <span>기준일: {preview.referenceDate}</span>
        <span>내일 반납 예정: {preview.dueTomorrow}건</span>
        <span>연체: {preview.overdue}건</span>
        <span>사전 안내 {preview.dueEnabled?'사용':'미사용'}</span>
        <span>연체 안내 {preview.overdueEnabled?'사용':'미사용'}</span>
      </div>}
      <p className="text-xs text-slate-500">대상 확인만 수행하며 이메일을 발송하거나 등록하지 않습니다.</p>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-bold text-slate-900">발송 내역 및 대기 메일</h3>
          <p className="mt-1 text-xs text-slate-500">대기 중인 알림을 확인하고 취소할 수 있습니다.</p></div>
        <div className="flex gap-2">
          {queueOpen&&<button type="button" disabled={queueBusy} onClick={()=>void reloadQueue()} className="rounded-lg border px-3 py-2 text-xs">새로고침</button>}
          <button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={()=>{
            if(queueOpen){setQueueOpen(false);}else{setQueueOpen(true);void reloadQueue();}
          }}>{queueOpen?'닫기':'내역 보기'}</button>
        </div>
      </div>
      {queueOpen&&<div className="mt-4 space-y-3">
        {queueMessage&&<p role="status" className="text-xs text-slate-700">{queueMessage}</p>}
        {queue&&<div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {Object.entries(queue.counts||{}).map(([state,count])=><span key={state} className="rounded-full bg-slate-100 px-2 py-1">{mailStateLabels[state]||state}: {count}</span>)}
        </div>}
        <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[660px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="p-2">유형</th><th className="p-2">수신자</th><th className="p-2">상태</th><th className="p-2">등록일시</th><th className="p-2">관리</th></tr></thead>
            <tbody>{(queue?.rows||[]).map(r=><tr key={r.id} className="border-t border-slate-100">
              <td className="p-2">{r.eventTitle}</td><td className="p-2">{r.recipientMasked}</td>
              <td className="p-2">{mailStateLabels[r.state]||r.state}</td><td className="p-2">{r.createdAt?new Date(r.createdAt).toLocaleString('ko-KR'):'-'}</td>
              <td className="p-2">{['queued','retry'].includes(r.state)?<button type="button" disabled={queueBusy} onClick={()=>void cancelQueued(r.id)} className="rounded-md border border-rose-200 px-2 py-1 font-medium text-rose-700 disabled:opacity-50">취소</button>:r.retryEligible?<button type="button" disabled={queueBusy} onClick={()=>void retryMail(r.id)} className="rounded-md border border-slate-300 px-2 py-1 font-medium disabled:opacity-50">재처리</button>:'-'}</td>
            </tr>)}</tbody>
          </table>
          {queue&&!queue.rows?.length&&<p className="p-4 text-center text-xs text-slate-500">등록된 발송 내역이 없습니다.</p>}
        </div>
      </div>}
    </div>
    {snapshot && designDraft && <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div><h3 className="text-sm font-bold text-slate-900">공통 이메일 디자인</h3>
        <p className="mt-1 text-xs text-slate-500">모든 이메일 유형에 공통으로 적용됩니다. 예시 메일은 아래 미리보기에서 확인할 수 있습니다.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-slate-700">발신자 표시명
          <input className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" maxLength={80} disabled={busy} value={designDraft.senderName}
            onChange={(e)=>(setDesignDraft((old)=>({...old,senderName:e.target.value})),setMailPreview(null))}/>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700">메일 상단 제목
          <input className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" maxLength={80} disabled={busy} value={designDraft.brandTitle}
            onChange={(e)=>(setDesignDraft((old)=>({...old,brandTitle:e.target.value})),setMailPreview(null))}/>
        </label>
      </div>
      <label className="block space-y-1 text-xs font-semibold text-slate-700">메일 하단 안내 문구
        <textarea className="w-full resize-y rounded-lg border border-slate-300 p-2.5 text-sm" rows={2} maxLength={360} disabled={busy} value={designDraft.footerText}
          onChange={(e)=>(setDesignDraft((old)=>({...old,footerText:e.target.value})),setMailPreview(null))}/>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg bg-[var(--mk-orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !designPending} onClick={()=>void saveDesign()}>공통 디자인 저장</button>
        <button type="button" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={busy || !designPending} onClick={()=>setDesignDraft(snapshot.design)}>변경 취소</button>
        {designMessage&&<span role="status" className="text-xs text-slate-700">{designMessage}</span>}
      </div>
      <p className="text-xs text-slate-500">실제 발신 주소와 인증은 별도 설정으로 관리됩니다. 실메일 발송은 비활성 상태입니다.</p>
    </div>}
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
          onClick={() => { if (pending && !window.confirm('저장하지 않은 변경사항을 취소하고 이동하시겠습니까?')) return; setSelected(event.key);setMailPreview(null);setMessage(''); }}
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
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-bold text-slate-900">메일 미리보기</h4>
            <p className="text-xs text-slate-500">저장하지 않은 내용도 예시 데이터로 확인할 수 있습니다.</p></div>
            <button type="button" disabled={busy || mailPreviewBusy} onClick={()=>void makeMailPreview()} className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-xs font-bold text-orange-800 disabled:opacity-50">{mailPreviewBusy?'불러오는 중...':'미리보기'}</button>
          </div>
          {mailPreviewMessage&&<p role="status" className="text-xs text-rose-700">{mailPreviewMessage}</p>}
          {mailPreview?.eventKey===selected&&<div className="space-y-2">
            <p className="break-words text-xs"><strong>보내는 사람:</strong> {mailPreview.senderName}</p>
            <p className="break-words text-xs"><strong>제목:</strong> {mailPreview.subject}</p>
            <iframe title="이메일 미리보기" sandbox="" srcDoc={mailPreview.html} className="h-[440px] w-full rounded-lg border border-slate-200 bg-white"/>
            <p className="text-xs text-slate-500">실제 고객 정보는 표시하지 않으며 이메일도 발송되지 않습니다.</p>
          </div>}
        </div>
        <div className="flex gap-2"><button type="button" onClick={save} disabled={!pending || busy} className="rounded-lg bg-[var(--mk-orange)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">저장</button>
          <button type="button" disabled={busy || !pending} onClick={() => setDrafts((d) => ({ ...d,[selected]:fromEvent(current) }))} className="rounded-lg border px-5 py-2.5 text-sm">변경 취소</button></div>
      </div>}
    </div>}
  </section>;
}
