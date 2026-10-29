import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { AdminPageHeader } from '../components/CommonUI.jsx';
import PaginationControls from '../components/PaginationControls.jsx';
import ModalPortal from '../components/ModalPortal.jsx';
import SixDigitVerificationCodeInput from '../components/SixDigitVerificationCodeInput.jsx';
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
  const [activeTab,setActiveTab] = useState('preflight');
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
  const [deliveryControl,setDeliveryControl] = useState(null);
  const [deliveryBusy,setDeliveryBusy] = useState(false);
  const [deliveryMessage,setDeliveryMessage] = useState('');
  const [deliveryVerifyStep,setDeliveryVerifyStep] = useState('idle');
  const [deliveryCode,setDeliveryCode] = useState('');
  const [deliveryAllowQueued,setDeliveryAllowQueued] = useState(false);
  const reloadDelivery=async()=>{
    try{setDeliveryControl(await clerkStagingClient.getAdminMailDeliveryControl());}
    catch{setDeliveryMessage('전체 발송 제어 상태를 불러오지 못했습니다.');}
  };
  useEffect(()=>{if(ctx.authenticatedAdminAccount?.adminRole==='owner')void reloadDelivery();},[ctx.authenticatedAdminAccount?.adminRole]);
  const changeDelivery=async(enabled)=>{
    if(deliveryBusy)return;
    if(enabled&&!deliveryControl?.active&&!deliveryControl?.enabled&&deliveryControl?.blockers?.length){
      setDeliveryMessage('서버 발송 설정이 아직 준비되지 않았습니다. 승인 전에 운영 환경 점검이 필요합니다.');return;
    }
    if(enabled){
      setDeliveryBusy(true);setDeliveryMessage('');
      try{await clerkStagingClient.beginAdminMailReverification();setDeliveryVerifyStep('sent');
        setDeliveryMessage('최고관리자 본인 확인 코드를 보냈습니다.');}
      catch{setDeliveryMessage('본인 확인 코드를 발송하지 못했습니다.');}
      finally{setDeliveryBusy(false);}
      return;
    }
    setDeliveryBusy(true);setDeliveryMessage('');
    try{const next=await clerkStagingClient.changeAdminMailDeliveryControl({enabled:false,expectedRevision:deliveryControl?.revision});
      setDeliveryControl(next);setDeliveryVerifyStep('idle');await reloadDelivery();setDeliveryMessage('전체 이메일 발송을 중지했습니다.');}
    catch{setDeliveryMessage('발송 중지 요청이 실패했습니다. 상태를 다시 조회하고 재시도하십시오.');}
    finally{setDeliveryBusy(false);}
  };
  const completeDeliveryApproval=async()=>{
    if(deliveryBusy||deliveryCode.length!==6)return;
    setDeliveryBusy(true);setDeliveryMessage('');
    try{await clerkStagingClient.completeAdminMailReverification(deliveryCode);
      const next=await clerkStagingClient.changeAdminMailDeliveryControl({enabled:true,
        allowQueued:deliveryAllowQueued,expectedRevision:deliveryControl?.revision});
      setDeliveryControl(next);setDeliveryVerifyStep('idle');setDeliveryCode('');await reloadDelivery();
      setDeliveryMessage('최고관리자가 전체 이메일 발송을 승인했습니다.');
    }catch(e){setDeliveryMessage(e?.code==='mail_delivery_queue_review_required'?
      '대기·오래된 메일 또는 처리 중인 메일이 있습니다. 대기 목록을 확인하고 취소하거나 검토하십시오.':
      e?.code==='mail_delivery_environment_blocked'?'서버 설정이 발송을 허용하지 않습니다.':
      '승인을 저장하지 못했습니다. 인증과 설정 상태를 확인한 뒤 다시 시도하십시오.');
      setDeliveryVerifyStep('idle');setDeliveryCode('');await reloadDelivery();}
    finally{setDeliveryBusy(false);}
  };
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
      setMailPreflightMessage(`점검 확인이 기록되었습니다. (${saved.reviewId}번) 이 점검은 발송을 직접 수행하지 않습니다.`);
      setMailPreflight(await clerkStagingClient.getAdminMailPreflight());
    }catch(error){
      const code=String(error?.code||'');
      setMailPreflightMessage(code==='mail_preflight_reverification_already_used'
        ? '이미 사용된 본인 확인입니다. 새 코드를 요청해 주세요.'
        : code==='mail_preflight_recent_reauthentication_required'||code==='mail_preflight_signed_reverification_required'
          ? '본인 확인이 만료되었거나 유효하지 않습니다. 새 코드를 요청해 주세요.'
          : code==='mail_preflight_owner_required'
            ? '최고관리자 권한이 필요합니다.'
            : code==='mail_preflight_environment_unsupported'
              ? '현재 서버 환경에서는 점검 확인을 기록할 수 없습니다.'
              : code==='mail_preflight_confirmation_required'
                ? '점검 확인에 동의한 후 다시 시도해 주세요.'
                : '점검 기록 저장에 실패했습니다. 새 코드 요청 전 관리자에게 서버 기록 확인을 요청해 주세요.');
      setMailVerifyStep('idle');setMailVerifyCode('');
    }finally{setMailPreflightBusy(false);}
  };
  const [queue,setQueue] = useState(null);
  const [queueBusy,setQueueBusy] = useState(false);
  const [queueMessage,setQueueMessage] = useState('');
  const [queuePage,setQueuePage] = useState(1);
  const [queuePageSize,setQueuePageSize] = useState(10);
  const [queueStatus,setQueueStatus] = useState('all');
  const [queueSearch,setQueueSearch] = useState('');
  const [queueSearchSettled,setQueueSearchSettled] = useState('');
  const queueRequestSeq = useRef(0);
  const [preview,setPreview] = useState(null);
  const [previewBusy,setPreviewBusy] = useState(false);
  const [previewMessage,setPreviewMessage] = useState('');
  const reloadPreview=async()=>{
    setPreviewBusy(true);setPreviewMessage('');
    try{setPreview(await clerkStagingClient.getAdminMailSchedulePreview());}
    catch{setPreviewMessage('반납 알림 대상을 확인하지 못했습니다.');}
    finally{setPreviewBusy(false);}
  };
  const reloadQueue=async({page=queuePage,pageSize=queuePageSize,status=queueStatus,search=queueSearchSettled}={})=>{
    const requestId=++queueRequestSeq.current;
    setQueueBusy(true);setQueueMessage('');
    try{
      const result=await clerkStagingClient.getAdminMailQueue({page,pageSize,status,search});
      if(requestId!==queueRequestSeq.current)return;
      setQueue(result);
      if(page>result.totalPages)setQueuePage(result.totalPages);
    }catch{if(requestId===queueRequestSeq.current)setQueueMessage('발송 내역을 불러오지 못했습니다.');}
    finally{if(requestId===queueRequestSeq.current)setQueueBusy(false);}
  };
  const retryMail=async(id)=>{
    if(!window.confirm('안전하게 재처리할 수 있는 메일만 대기 상태로 전환합니다. 계속하시겠습니까?'))return;
    setQueueBusy(true);setQueueMessage('');
    try{await clerkStagingClient.retryAdminMail(id);
      setQueueMessage('재처리 대기 상태로 변경했습니다.');await reloadQueue();}
    catch{setQueueMessage('이 메일은 안전하게 재처리할 수 없습니다.');}
    finally{setQueueBusy(false);}
  };
  const cancelQueued=async(id)=>{
    if(!window.confirm('선택한 대기 메일을 취소하시겠습니까?'))return;
    setQueueBusy(true);setQueueMessage('');
    try{await clerkStagingClient.cancelAdminQueuedMail(id);
      setQueueMessage('발송이 취소되었습니다.');await reloadQueue();}
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
  useEffect(() => { if (owner && (activeTab==='design'||activeTab==='preflight') && !snapshot) void load(); }, [owner,activeTab]);
  useEffect(() => { if (owner && activeTab==='preflight') void reloadMailPreflight(); }, [owner,activeTab]);
  useEffect(()=>{const id=setTimeout(()=>setQueueSearchSettled(queueSearch.trim()),250);return ()=>clearTimeout(id);},[queueSearch]);
  useEffect(()=>{
    if(!owner||activeTab!=='history')return;
    void reloadQueue({page:queuePage,pageSize:queuePageSize,status:queueStatus,search:queueSearchSettled});
    return ()=>{queueRequestSeq.current++;};
  },[owner,activeTab,queuePage,queuePageSize,queueStatus,queueSearchSettled]);
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
    }catch(error){setDesignMessage(error?.status===409?'다른 관리자가 먼저 변경했습니다. 새로고침 후 다시 저장하세요.':'디자인 설정을 저장하지 못했습니다. 입력 내용을 확인해 주세요.');}
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
    } catch (e) { setMessage(e?.status === 409 ? '다른 관리자가 먼저 변경했습니다. 다시 불러온 후 저장하세요.' : '저장하지 못했습니다. 본문 형식과 변수를 확인해 주세요.'); }
    finally { setBusy(false); }
  };
  const copyVariable = async (name) => {
    try { await navigator.clipboard.writeText(`{{${name}}}`); setMessage('변수를 복사했습니다. 원하는 위치에 붙여넣으세요.'); }
    catch { setMessage('복사할 수 없습니다. 변수 코드를 선택하여 붙여넣으세요.'); }
  };
  const switchTab=(next)=>{
    if(next===activeTab)return;
    if(busy||mailPreflightBusy||queueBusy||g5Busy||g6Busy||mailVerifyStep==='sent')return;
    if((pending||designPending)&&!window.confirm('저장하지 않은 변경사항이 있습니다. 변경사항을 취소하고 이동하시겠습니까?'))return;
    if(pending||designPending){
      setDrafts(Object.fromEntries((snapshot?.events||[]).map(event=>[event.key,fromEvent(event)])));
      setDesignDraft(snapshot?.design||null);
      setMailPreview(null);
    }
    setActiveTab(next);
  };
  if (!owner) return <div className="p-6 text-sm text-slate-700">최고관리자만 이메일 알림을 관리할 수 있습니다.</div>;
  return <section className="space-y-5">
    <AdminPageHeader title="이메일 알림 관리" description="이메일 발송 상태와 내역을 확인하고, 알림 유형 및 이메일 디자인을 관리합니다."
      badge={<span className="inline-flex shrink-0 items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold whitespace-nowrap text-white">최고관리자 기능</span>}/>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="이메일 알림 관리 메뉴">
      {[['preflight','발송 전 점검'],['history','발송 내역 관리'],['design','알림 설정 및 디자인']].map(([key,label])=><button
        key={key} type="button" role="tab" aria-selected={activeTab===key} onClick={()=>switchTab(key)}
        className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${activeTab===key?'border-orange-500 bg-orange-500 text-white shadow-sm':'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'}`}>{label}</button>)}
    </div>
    {activeTab==='preflight'&&<div className="space-y-4" role="tabpanel">
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">전체 이메일 발송 승인</h3>
        <button type="button" disabled={deliveryBusy} onClick={()=>void reloadDelivery()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">상태 새로고침</button>
      </div>
      <p className="text-xs text-slate-600">최고관리자 승인 후에만 발송합니다. 발송 시작은 이메일 본인 확인이 필요하며 중지는 즉시 요청할 수 있습니다.</p>
      <p className="text-xs text-slate-700">현재 전체 발송: <strong>{deliveryControl?.active?'진행 가능':deliveryControl?.enabled?'서버 설정으로 차단':'중지'}</strong>
        {' · '}대기 {deliveryControl?.queued||0}건 · 처리 중 {deliveryControl?.processing||0}건 · 오래된 대기 {deliveryControl?.aged||0}건</p>
      {deliveryControl?.blockers?.length>0&&<p className="text-xs text-amber-700">운영 환경 안전 잠금이 활성화되어 있습니다. 최초 활성화 설정 및 검증 후 승인이 가능합니다.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={deliveryBusy||!deliveryControl||deliveryControl.enabled}
          onClick={()=>void changeDelivery(true)} className="rounded-lg border border-orange-400 px-3 py-2 text-xs font-semibold disabled:opacity-50">본인 확인 후 전체 발송 승인</button>
        <button type="button" disabled={deliveryBusy||!deliveryControl?.enabled}
          onClick={()=>void changeDelivery(false)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">전체 발송 중지</button>
      </div>
      {deliveryVerifyStep==='sent'&&<div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <SixDigitVerificationCodeInput value={deliveryCode} onChange={setDeliveryCode} onSubmit={()=>void completeDeliveryApproval()}
          disabled={deliveryBusy} label="전체 발송 승인용 이메일 인증번호" id="mail-global-approval-code" />
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={deliveryAllowQueued} onChange={e=>setDeliveryAllowQueued(e.target.checked)} />
          최근 24시간 이내 대기 메일을 확인했고 함께 처리하는 데 동의합니다. 오래된 대기·처리 중인 메일은 별도로 정리해야 합니다.
        </label>
        <button type="button" onClick={()=>void completeDeliveryApproval()} disabled={deliveryBusy||deliveryCode.length!==6}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">승인 확정</button>
        <button type="button" onClick={()=>{setDeliveryVerifyStep('idle');setDeliveryCode('');}}
          className="ml-2 rounded-lg border px-3 py-2 text-xs">취소</button>
      </div>}
      {deliveryMessage&&<p role="status" className="text-xs text-slate-700">{deliveryMessage}</p>}
      <p className="text-xs text-slate-500">중지 요청 직전에 이미 Brevo로 전송 중이던 요청은 취소되지 않을 수 있습니다.</p>
    </div>
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
      <p className="text-xs text-slate-600">발송 준비 상태와 대기 메일을 확인합니다. 점검 확인 자체는 이메일을 발송하지 않습니다. 전체 발송 여부는 위의 관리자 승인 상태에 따릅니다.</p>
      {mailPreflight&&<div className="space-y-2 text-xs text-slate-700">
        <p>현재 발송: <strong>{deliveryControl?.active?'승인됨': '중지'}</strong> · 대기 {mailPreflight.counts?.queued||0}건 · 재시도 대기 {mailPreflight.counts?.retry||0}건 · 오래된 대기 {mailPreflight.agedCount||0}건</p>
        {(mailPreflight.samples||[]).length>0&&<p>확인할 메일: {mailPreflight.samples.map(r=>`#${r.id} (${mailStateLabels[r.state]||r.state})`).join(', ')}</p>}
        {mailPreflight.latestReview&&<p>마지막 점검 확인: {new Date(mailPreflight.latestReview.createdAt).toLocaleString('ko-KR')}</p>}
        <p className="text-slate-500">대기 메일 취소는 ‘발송 내역 관리’ 탭에서 처리할 수 있습니다.</p>
      </div>}
      {mailPreflightMessage&&<p role="status" className="text-xs text-slate-700">{mailPreflightMessage}</p>}
      {mailPreflight&&<div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" disabled={mailPreflightBusy||mailVerifyStep==='sent'} onClick={()=>void beginMailReview()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50">본인 확인 후 점검 기록</button>
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
    </div>}
    {activeTab==='history'&&<div className="space-y-4" role="tabpanel">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-black text-slate-900">발송 내역 및 대기 메일</h3>
            <p className="mt-1 text-xs text-slate-500">발송 상태와 이력을 조회하고 허용된 대기 메일을 관리합니다.</p></div>
          <button type="button" disabled={queueBusy} onClick={()=>void reloadQueue()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold disabled:opacity-50">새로고침</button>
        </div>
        {queue&&<div className="flex flex-wrap gap-2 text-xs text-slate-600" aria-label="상태별 전체 건수">
          {Object.entries(mailStateLabels).map(([state,label])=><span key={state} className="rounded-full bg-slate-100 px-3 py-1">{label}: {queue.counts?.[state]||0}건</span>)}
        </div>}
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_160px_140px] md:items-end">
          <label className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">메일 검색</span>
            <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input aria-label="메일 검색" value={queueSearch} maxLength={120} onChange={e=>{setQueueSearch(e.target.value);setQueuePage(1);}}
                placeholder="관리번호, 이메일 유형, 마스킹 주소" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none mk-form-border-focus"/></div>
          </label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">상태</span>
            <select aria-label="발송 상태" value={queueStatus} onChange={e=>{setQueueStatus(e.target.value);setQueuePage(1);}}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus">
              <option value="all">전체</option>{Object.entries(mailStateLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">페이지당 표시</span>
            <select aria-label="페이지당 표시" value={queuePageSize} onChange={e=>{setQueuePageSize(Number(e.target.value));setQueuePage(1);}}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus">
              {[10,30,50].map(size=><option key={size} value={size}>{size}개</option>)}
            </select>
          </label>
        </div>
        {queueMessage&&<p role="status" className="text-xs text-rose-700">{queueMessage}</p>}
        {queueBusy&&!queue&&<p className="py-6 text-center text-xs text-slate-500">발송 내역을 불러오는 중입니다.</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[790px] table-fixed text-left text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr>{[['관리번호','w-[11%]'],['유형','w-[23%]'],['수신자','w-[25%]'],['상태','w-[13%]'],['등록일시','w-[18%]'],['관리','w-[10%]']].map(([label,width])=><th key={label} className={`px-3 py-3 font-semibold ${width}`}>{label}</th>)}</tr></thead>
            <tbody>{(queue?.rows||[]).map(r=><tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="break-all px-3 py-3">#{r.id}</td><td className="break-words px-3 py-3">{r.eventTitle}</td>
              <td className="break-all px-3 py-3">{r.recipientMasked}</td><td className="px-3 py-3">{mailStateLabels[r.state]||r.state}</td>
              <td className="px-3 py-3">{r.createdAt?new Date(r.createdAt).toLocaleString('ko-KR'):'-'}</td>
              <td className="px-3 py-3">{['queued','retry'].includes(r.state)?<button type="button" disabled={queueBusy} onClick={()=>void cancelQueued(r.id)} className="rounded-lg border border-rose-200 px-2 py-1 font-semibold text-rose-700 disabled:opacity-50">취소</button>:r.retryEligible?<button type="button" disabled={queueBusy} onClick={()=>void retryMail(r.id)} className="rounded-lg border border-slate-300 px-2 py-1 font-semibold disabled:opacity-50">재처리</button>:'-'}</td>
            </tr>)}</tbody>
          </table>
          {queue&&!queue.rows?.length&&<p className="p-8 text-center text-xs text-slate-500">검색 조건에 맞는 발송 내역이 없습니다.</p>}
        </div>
        <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <p className="text-[11px] text-slate-500">검색 결과 {queue?.total??0}건 · {queuePage} / {queue?.totalPages||1}페이지</p>
          <PaginationControls currentPage={queuePage} totalPages={queue?.totalPages||1} disabled={queueBusy||!queue}
            onPageChange={setQueuePage} className="sm:justify-self-center"/>
          <button type="button" className="justify-self-end rounded-lg border px-3 py-2 text-xs" onClick={()=>{setQueueSearch('');setQueueStatus('all');setQueuePage(1);}}>검색 초기화</button>
        </div>
      </div>
    </div>}
    {activeTab==='design'&&<div className="space-y-4" role="tabpanel">
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-base font-bold text-slate-900">유형별 이메일 알림 설정 및 디자인</h3>
      <button type="button" disabled={busy} onClick={()=>{if((pending||designPending)&&!window.confirm('저장하지 않은 변경사항을 취소하고 새로고침하시겠습니까?'))return;void load();}} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">새로고침</button>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">실제 이메일 발송은 아직 시작되지 않았습니다.</div>
    {message && <p className="text-sm font-semibold text-slate-700" role="status">{message}</p>}
    {!snapshot ? <p className="py-6 text-sm">{busy ? '불러오는 중...' : '설정을 불러올 수 없습니다.'}</p> :
    <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
      <div className="max-h-[650px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {snapshot.events.map((event) => <button type="button" key={event.key}
          onClick={() => { if (pending) {if(!window.confirm('저장하지 않은 변경사항을 취소하고 이동하시겠습니까?')) return;setDrafts(d=>({...d,[selected]:fromEvent(current)}));} setSelected(event.key);setMailPreview(null);setMessage(''); }}
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
    </div>}
    {activeTab==='preflight'&&mailVerifyStep==='sent'&&<ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="mail-review-modal-title" onKeyDown={e=>{if(e.key==='Escape'&&!mailPreflightBusy){setMailVerifyStep('idle');setMailVerifyCode('');}}} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 id="mail-review-modal-title" className="text-lg font-black text-slate-900">최고관리자 본인 확인</h3>
        <p className="mb-5 mt-2 text-sm leading-6 text-slate-600">등록된 이메일로 발급된 6자리 확인 코드를 입력하세요.</p>
        <SixDigitVerificationCodeInput key="mail-review-otp" id="mail-review-otp" value={mailVerifyCode} onChange={setMailVerifyCode}
          onSubmit={()=>void completeMailReview()} disabled={mailPreflightBusy} label="이메일 인증번호"/>
        {mailPreflightMessage&&<p role="status" className="mt-3 text-xs text-slate-700">{mailPreflightMessage}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={mailPreflightBusy} onClick={()=>{setMailVerifyStep('idle');setMailVerifyCode('');setMailPreflightMessage('');}}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">취소</button>
          <button type="button" disabled={mailPreflightBusy} onClick={()=>void beginMailReview()}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">재발급</button>
          <button type="button" disabled={mailPreflightBusy||mailVerifyCode.length!==6} onClick={()=>void completeMailReview()}
            className="rounded-xl bg-[var(--mk-orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">확인 후 점검 기록</button>
        </div>
      </div>
    </ModalPortal>}
  </section>;
}
