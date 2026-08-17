import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, LockKeyhole, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

import { Button, Input, Select } from '../components/CommonUI.jsx';
import RichTextContent from '../components/RichTextContent.jsx';
import { inquiryApi } from '../features/inquiries/inquiryApi.js';

const GUEST_ACCESS_SESSION_KEY = 'mk_laptop_guest_inquiry_access';
const PAGE_SIZE_FALLBACK = 10;

const STATUS_LABELS = Object.freeze({
  waiting: '답변대기',
  answered: '답변완료',
  additional: '추가답변',
});

const STATUS_CLASSES = Object.freeze({
  waiting: 'border-amber-200 bg-amber-50 text-amber-700',
  answered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  additional: 'border-violet-200 bg-violet-50 text-violet-700',
});

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
};

const emptyForm = () => ({ categoryId: '', title: '', bodyText: '' });
const emptyGuestForm = () => ({
  name: '', team: '', email: '', phone: '', password: '', passwordConfirm: '',
  categoryId: '', title: '', bodyText: '', termDecisions: {},
});

const readGuestAccess = () => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(GUEST_ACCESS_SESSION_KEY) || 'null');
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(GUEST_ACCESS_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeGuestAccess = (access) => {
  if (typeof window === 'undefined') return;
  if (!access?.token || !access?.expiresAt) {
    window.sessionStorage.removeItem(GUEST_ACCESS_SESSION_KEY);
    return;
  }
  window.sessionStorage.setItem(GUEST_ACCESS_SESSION_KEY, JSON.stringify({ token: access.token, expiresAt: access.expiresAt }));
};

const InquiryStatusBadge = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${STATUS_CLASSES[status] || STATUS_CLASSES.waiting}`}>
    {STATUS_LABELS[status] || STATUS_LABELS.waiting}
  </span>
);

const Field = ({ label, children }) => (
  <div>
    <div className="mb-1.5 text-[11px] font-semibold text-slate-600">{label}</div>
    {children}
  </div>
);

const ModalShell = ({ title, description = '', children, onClose }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-3 sm:p-5">
    <div className="mk-modal-scroll-shell max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="닫기">
          <X size={17} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export default function UserInquiryPanel({ ctx }) {
  const { hasFirebaseAuthSession, goToUserLogin, triggerToast } = ctx;
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPublicId, setEditingPublicId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [guestMode, setGuestMode] = useState('verify');
  const [guestForm, setGuestForm] = useState(emptyGuestForm);
  const [guestVerify, setGuestVerify] = useState({ name: '', method: 'email', identifier: '', password: '' });
  const [guestAccess, setGuestAccess] = useState(readGuestAccess);
  const [guestVerifyLoading, setGuestVerifyLoading] = useState(false);

  const pageSize = Number(config?.postsPerPage || PAGE_SIZE_FALLBACK);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const categories = Array.isArray(config?.categories) ? config.categories : [];
  const guestTerms = Array.isArray(config?.guestTerms) ? config.guestTerms : [];

  const notify = useCallback((message, type = 'success') => {
    if (typeof triggerToast === 'function') triggerToast(message, type);
  }, [triggerToast]);

  const loadConfig = useCallback(async () => {
    try {
      const next = await inquiryApi.getPublicConfig();
      setConfig(next);
      setConfigError('');
      setForm((current) => ({ ...current, categoryId: current.categoryId || next.categories?.[0]?.id || '' }));
      setGuestForm((current) => ({ ...current, categoryId: current.categoryId || next.categories?.[0]?.id || '' }));
      return next;
    } catch (error) {
      setConfigError('문의하기 설정을 불러오지 못했습니다.');
      return null;
    }
  }, []);

  const clearGuestSession = useCallback(() => {
    writeGuestAccess(null);
    setGuestAccess(null);
    setItems([]);
    setTotalCount(0);
    setDetail(null);
    setPage(1);
  }, []);

  const loadList = useCallback(async ({ targetPage = page, access = guestAccess, currentConfig = config } = {}) => {
    if (!currentConfig) return;
    setLoading(true);
    try {
      const result = hasFirebaseAuthSession
        ? await inquiryApi.listMember({ page: targetPage, pageSize: currentConfig.postsPerPage })
        : access?.token
          ? await inquiryApi.listGuest({ token: access.token, page: targetPage, pageSize: currentConfig.postsPerPage })
          : { items: [], totalCount: 0, page: 1 };
      setItems(Array.isArray(result.items) ? result.items : []);
      setTotalCount(Number(result.totalCount || 0));
      setPage(Number(result.page || targetPage || 1));
    } catch (error) {
      if (!hasFirebaseAuthSession && ['guest_inquiry_session_required', 'guest_inquiry_session_invalid'].includes(error?.code)) {
        clearGuestSession();
      } else {
        notify('문의 내역을 불러오지 못했습니다.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [clearGuestSession, config, guestAccess, hasFirebaseAuthSession, notify, page]);

  useEffect(() => {
    let active = true;
    (async () => {
      const next = await loadConfig();
      if (!active) return;
      if (next && (hasFirebaseAuthSession || guestAccess?.token)) {
        await loadList({ targetPage: 1, access: guestAccess, currentConfig: next });
      } else {
        setLoading(false);
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFirebaseAuthSession]);

  const openDetail = async (publicId) => {
    setDetailLoading(true);
    try {
      const next = hasFirebaseAuthSession
        ? await inquiryApi.getMember(publicId)
        : await inquiryApi.getGuest(publicId, guestAccess?.token);
      setDetail(next);
    } catch (error) {
      notify('문의 상세를 불러오지 못했습니다.', 'error');
      if (!hasFirebaseAuthSession && error?.status === 401) clearGuestSession();
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setEditingPublicId('');
    setForm({ ...emptyForm(), categoryId: categories[0]?.id || '' });
    setFormOpen(true);
  };

  const openEdit = () => {
    if (!detail || Number(detail.answerCount || 0) > 0) return;
    setEditingPublicId(detail.publicId);
    setForm({ categoryId: detail.categoryId || '', title: detail.title || '', bodyText: detail.bodyText || '' });
    setFormOpen(true);
  };

  const saveMemberOrGuestInquiry = async () => {
    if (!form.categoryId || !form.title.trim() || !form.bodyText.trim()) {
      notify('문의 카테고리, 제목, 본문을 모두 입력해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      let next;
      if (editingPublicId) {
        next = hasFirebaseAuthSession
          ? await inquiryApi.updateMember(editingPublicId, form)
          : await inquiryApi.updateGuest(editingPublicId, form, guestAccess?.token);
      } else {
        next = await inquiryApi.createMember(form);
      }
      notify(editingPublicId ? '문의가 수정되었습니다.' : '문의가 등록되었습니다.');
      setFormOpen(false);
      await loadList({ targetPage: editingPublicId ? page : 1 });
      if (next?.publicId) await openDetail(next.publicId);
    } catch (error) {
      const answered = error?.code === 'inquiry_answered_mutation_forbidden';
      notify(answered ? '관리자 답변이 등록된 문의는 수정할 수 없습니다.' : `문의 저장에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrent = async () => {
    if (!detail || Number(detail.answerCount || 0) > 0) return;
    if (typeof window !== 'undefined' && !window.confirm('이 문의를 삭제하시겠습니까? 삭제 후에는 목록에서 확인할 수 없습니다.')) return;
    try {
      if (hasFirebaseAuthSession) await inquiryApi.deleteMember(detail.publicId);
      else await inquiryApi.deleteGuest(detail.publicId, guestAccess?.token);
      notify('문의가 삭제되었습니다.');
      setDetail(null);
      await loadList({ targetPage: 1 });
    } catch (error) {
      const answered = ['inquiry_answered_mutation_forbidden', 'inquiry_answered_delete_forbidden'].includes(error?.code);
      notify(answered ? '관리자 답변이 등록된 문의는 삭제할 수 없습니다.' : `문의 삭제에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    }
  };

  const createGuest = async () => {
    const requiredMissing = guestTerms.some((term) => term.required && !guestForm.termDecisions?.[`${term.source}:${term.id}`]);
    if (requiredMissing) {
      notify('필수 약관에 모두 동의해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const termDecisions = guestTerms.map((term) => ({
        source: term.source, id: term.id, accepted: Boolean(guestForm.termDecisions?.[`${term.source}:${term.id}`]),
      }));
      await inquiryApi.createGuest({ ...guestForm, author: guestForm, termDecisions });
      const access = await inquiryApi.verifyGuest({
        name: guestForm.name,
        method: 'email',
        identifier: guestForm.email,
        password: guestForm.password,
      });
      writeGuestAccess(access);
      setGuestAccess(access);
      setGuestForm({ ...emptyGuestForm(), categoryId: categories[0]?.id || '' });
      setGuestMode('verify');
      notify('비회원 문의가 등록되었습니다. 현재 브라우저에서 바로 확인할 수 있습니다.');
      await loadList({ targetPage: 1, access });
    } catch (error) {
      const message = error?.code === 'guest_inquiry_disabled'
        ? '현재 비회원 문의를 접수하지 않습니다.'
        : error?.code === 'guest_inquiry_required_terms_missing'
          ? '필수 약관에 모두 동의해 주세요.'
          : `비회원 문의 등록에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`;
      notify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const verifyGuest = async () => {
    setGuestVerifyLoading(true);
    try {
      const access = await inquiryApi.verifyGuest(guestVerify);
      writeGuestAccess(access);
      setGuestAccess(access);
      setDetail(null);
      await loadList({ targetPage: 1, access });
      notify('비회원 문의 확인 인증이 완료되었습니다.');
    } catch (error) {
      notify('입력한 정보와 일치하는 문의를 확인할 수 없습니다.', 'error');
    } finally {
      setGuestVerifyLoading(false);
    }
  };

  const listNumber = useMemo(() => {
    const map = new Map();
    items.forEach((item, index) => map.set(item.publicId, Math.max(1, totalCount - ((page - 1) * pageSize) - index)));
    return map;
  }, [items, page, pageSize, totalCount]);

  if (configError) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-800">{configError}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-950">문의하기</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">기기 대여 시스템 이용 중 궁금한 사항을 1:1로 문의할 수 있습니다.</p>
      </div>

      {!hasFirebaseAuthSession ? (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          {config?.allowGuest ? (
            <>
              <Button type="button" variant={guestMode === 'verify' ? 'primary' : 'outline'} onClick={() => setGuestMode('verify')}>비회원 문의 확인</Button>
              <Button type="button" variant={guestMode === 'create' ? 'primary' : 'outline'} onClick={() => setGuestMode('create')}>비회원 문의 작성</Button>
            </>
          ) : null}
          <Button type="button" variant="outline" onClick={goToUserLogin}>회원 로그인</Button>
        </div>
      ) : null}

      {!hasFirebaseAuthSession && !config?.allowGuest ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <LockKeyhole className="mx-auto text-slate-400" size={28} />
          <div className="mt-3 text-sm font-bold text-slate-900">현재 문의는 회원만 등록할 수 있습니다.</div>
          <p className="mt-2 text-xs text-slate-500">로그인한 회원은 본인 문의만 확인할 수 있습니다.</p>
          <Button type="button" variant="primary" className="mt-5" onClick={goToUserLogin}>로그인</Button>
        </div>
      ) : null}

      {!hasFirebaseAuthSession && config?.allowGuest && guestMode === 'create' ? (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900">비회원 문의 작성</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">이메일과 연락처는 모두 필수입니다. 문의 확인 비밀번호는 재설정할 수 없으므로 분실하지 않도록 보관해 주세요.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="성명"><Input value={guestForm.name} onChange={(e) => setGuestForm((c) => ({ ...c, name: e.target.value }))} /></Field>
            <Field label="부서/팀"><Input value={guestForm.team} onChange={(e) => setGuestForm((c) => ({ ...c, team: e.target.value }))} /></Field>
            <Field label="이메일"><Input type="email" value={guestForm.email} onChange={(e) => setGuestForm((c) => ({ ...c, email: e.target.value }))} /></Field>
            <Field label="연락처"><Input value={guestForm.phone} onChange={(e) => setGuestForm((c) => ({ ...c, phone: e.target.value }))} placeholder="010-0000-0000" /></Field>
            <Field label="문의 확인 비밀번호"><Input type="password" value={guestForm.password} onChange={(e) => setGuestForm((c) => ({ ...c, password: e.target.value }))} autoComplete="new-password" /></Field>
            <Field label="문의 확인 비밀번호 확인"><Input type="password" value={guestForm.passwordConfirm} onChange={(e) => setGuestForm((c) => ({ ...c, passwordConfirm: e.target.value }))} autoComplete="new-password" /></Field>
          </div>
          <Field label="문의 카테고리">
            <Select value={guestForm.categoryId} onChange={(e) => setGuestForm((c) => ({ ...c, categoryId: e.target.value }))}>
              <option value="">선택</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label="제목"><Input value={guestForm.title} onChange={(e) => setGuestForm((c) => ({ ...c, title: e.target.value }))} maxLength={200} /></Field>
          <Field label="문의 본문"><textarea value={guestForm.bodyText} onChange={(e) => setGuestForm((c) => ({ ...c, bodyText: e.target.value }))} rows={9} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none mk-form-focus" /></Field>

          {guestTerms.length > 0 ? (
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-900">비회원 문의 약관 동의</div>
              {guestTerms.map((term) => {
                const key = `${term.source}:${term.id}`;
                return (
                  <label key={key} className="block rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={Boolean(guestForm.termDecisions?.[key])} onChange={(e) => setGuestForm((c) => ({ ...c, termDecisions: { ...c.termDecisions, [key]: e.target.checked } }))} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800">{term.required ? '[필수]' : '[선택]'} {term.title}</div>
                        <RichTextContent html={term.contentHtml} text={term.contentText} className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white p-3 text-xs leading-5 text-slate-600" />
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : null}
          <div className="flex justify-end"><Button type="button" variant="primary" disabled={saving} onClick={createGuest}>{saving ? '등록 중' : '문의 등록'}</Button></div>
        </div>
      ) : null}

      {!hasFirebaseAuthSession && config?.allowGuest && guestMode === 'verify' && !guestAccess?.token ? (
        <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900">비회원 문의 확인</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">작성 시 입력한 성명, 이메일 또는 연락처, 문의 확인 비밀번호가 모두 일치해야 합니다.</p>
          </div>
          <Field label="성명"><Input value={guestVerify.name} onChange={(e) => setGuestVerify((c) => ({ ...c, name: e.target.value }))} /></Field>
          <div>
            <div className="mb-2 text-[11px] font-semibold text-slate-600">조회 방법</div>
            <div className="flex gap-5 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="guestInquiryLookupMethod" value="email" checked={guestVerify.method === 'email'} onChange={() => setGuestVerify((c) => ({ ...c, method: 'email', identifier: '' }))} /> 이메일</label>
              <label className="flex items-center gap-2"><input type="radio" name="guestInquiryLookupMethod" value="phone" checked={guestVerify.method === 'phone'} onChange={() => setGuestVerify((c) => ({ ...c, method: 'phone', identifier: '' }))} /> 연락처</label>
            </div>
          </div>
          <Field label={guestVerify.method === 'phone' ? '연락처' : '이메일'}><Input value={guestVerify.identifier} onChange={(e) => setGuestVerify((c) => ({ ...c, identifier: e.target.value }))} /></Field>
          <Field label="문의 확인 비밀번호"><Input type="password" value={guestVerify.password} onChange={(e) => setGuestVerify((c) => ({ ...c, password: e.target.value }))} /></Field>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">비회원 문의 확인 비밀번호는 재설정할 수 없습니다. 비밀번호를 분실한 경우 기존 문의를 조회할 수 없습니다.</div>
          <div className="flex justify-end"><Button type="button" variant="primary" disabled={guestVerifyLoading} onClick={verifyGuest}>{guestVerifyLoading ? '확인 중' : '문의 확인'}</Button></div>
        </div>
      ) : null}

      {(hasFirebaseAuthSession || guestAccess?.token) && detail ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setDetail(null)}><ArrowLeft size={14} /> 목록으로</Button>
            {Number(detail.answerCount || 0) === 0 ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={openEdit}><Pencil size={14} /> 수정</Button>
                <Button type="button" variant="dangerOutline" onClick={deleteCurrent}><Trash2 size={14} /> 삭제</Button>
              </div>
            ) : null}
          </div>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2"><InquiryStatusBadge status={detail.status} /><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{detail.categoryName || '카테고리'}</span></div>
              <h3 className="mt-3 text-lg font-bold text-slate-950">{detail.title}</h3>
              <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                <div><span className="text-slate-400">회원 구분</span><div className="mt-1 font-semibold text-slate-800">{detail.authorType === 'member' ? '회원' : '비회원'}</div></div>
                <div><span className="text-slate-400">성명</span><div className="mt-1 font-semibold text-slate-800">{detail.authorName || '-'}</div></div>
                <div><span className="text-slate-400">부서/팀</span><div className="mt-1 font-semibold text-slate-800">{detail.authorTeam || '-'}</div></div>
                <div><span className="text-slate-400">이메일</span><div className="mt-1 font-semibold text-slate-800">{detail.authorEmail || '-'}</div></div>
                <div><span className="text-slate-400">연락처</span><div className="mt-1 font-semibold text-slate-800">{detail.authorPhone || '-'}</div></div>
                <div><span className="text-slate-400">작성일시</span><div className="mt-1 font-semibold text-slate-800">{formatDateTime(detail.createdAt)}</div></div>
              </div>
            </div>
            <div className="min-h-[220px] px-5 py-6"><RichTextContent html={detail.bodyHtml} text={detail.bodyText} className="text-sm leading-7 text-slate-700" /></div>
          </article>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900">관리자 답변 {Number(detail.answerCount || 0)}건</h4>
            {Array.isArray(detail.answers) && detail.answers.length > 0 ? detail.answers.map((answer, index) => (
              <article key={answer.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-bold text-slate-900">관리자 답변 {index + 1}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{answer.adminDisplayName || '관리자'} · {formatDateTime(answer.createdAt)}{answer.updatedAt && answer.updatedAt !== answer.createdAt ? ' · 수정됨' : ''}</div>
                </div>
                <div className="px-5 py-5"><RichTextContent html={answer.bodyHtml} text={answer.bodyText} className="text-sm leading-7 text-slate-700" /></div>
              </article>
            )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-xs text-slate-500">아직 등록된 관리자 답변이 없습니다.</div>}
          </div>
        </div>
      ) : null}

      {(hasFirebaseAuthSession || guestAccess?.token) && !detail ? (
        <div className="space-y-4">
          {loading || detailLoading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">문의 내역을 불러오는 중입니다.</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">등록된 문의가 없습니다.</div> : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600"><tr><th className="w-20 border-b border-slate-200 px-4 py-3 text-center">번호</th><th className="w-32 border-b border-slate-200 px-4 py-3 text-center">카테고리</th><th className="border-b border-slate-200 px-4 py-3">제목</th><th className="w-28 border-b border-slate-200 px-4 py-3 text-center">상태</th><th className="w-40 border-b border-slate-200 px-4 py-3 text-center">작성일시</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.publicId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"><td className="px-4 py-3 text-center text-xs text-slate-500">{listNumber.get(item.publicId)}</td><td className="px-4 py-3 text-center text-xs text-slate-600">{item.categoryName || '-'}</td><td className="px-4 py-3"><button type="button" className="max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline" onClick={() => openDetail(item.publicId)}>{item.title}</button></td><td className="px-4 py-3 text-center"><InquiryStatusBadge status={item.status} /></td><td className="px-4 py-3 text-center text-xs text-slate-500">{formatDateTime(item.createdAt)}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="text-[11px] text-slate-500 sm:justify-self-start">전체 문의 {totalCount}건 · {page} / {totalPages}페이지</div>
            <div className="flex items-center justify-center gap-2 sm:justify-self-center"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => loadList({ targetPage: page - 1 })}>이전</Button><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{page} / {totalPages}</div><Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => loadList({ targetPage: page + 1 })}>다음</Button></div>
            <div className="flex flex-wrap gap-2 sm:justify-self-end">
              {!hasFirebaseAuthSession ? <Button type="button" variant="outline" onClick={clearGuestSession}>인증 종료</Button> : null}
              {hasFirebaseAuthSession ? <Button type="button" variant="primary" onClick={openCreate}><Plus size={14} /> 문의 등록</Button> : null}
            </div>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <ModalShell title={editingPublicId ? '문의 수정' : '문의 등록'} description={editingPublicId ? '관리자 답변이 등록되기 전 문의만 수정할 수 있습니다.' : '문의 카테고리, 제목, 본문을 입력해 주세요.'} onClose={() => !saving && setFormOpen(false)}>
          <div className="space-y-4 p-5">
            <Field label="문의 카테고리"><Select value={form.categoryId} onChange={(e) => setForm((c) => ({ ...c, categoryId: e.target.value }))}><option value="">선택</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
            <Field label="제목"><Input value={form.title} maxLength={200} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} /></Field>
            <Field label="문의 본문"><textarea rows={11} value={form.bodyText} onChange={(e) => setForm((c) => ({ ...c, bodyText: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none mk-form-focus" /></Field>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><Button type="button" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>취소</Button><Button type="button" variant="primary" disabled={saving} onClick={saveMemberOrGuestInquiry}>{saving ? '저장 중' : '저장'}</Button></div>
        </ModalShell>
      ) : null}
    </div>
  );
}
