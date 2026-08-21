import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Pencil, Search, Trash2 } from 'lucide-react';

import { Button, Card, CardContent, Input, Select } from '../components/CommonUI.jsx';
import PaginationControls from '../components/PaginationControls.jsx';
import DomesticPhoneInput from '../components/DomesticPhoneInput.jsx';
import RichTextContent from '../components/RichTextContent.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { isRichTextEmpty, richTextHtmlToText, sanitizeRichTextHtml } from '../utils/richTextCore.js';
import SecureAttachmentEditor from '../components/SecureAttachmentEditor.jsx';
import SecureAttachmentList from '../components/SecureAttachmentList.jsx';
import { inquiryApi } from '../features/inquiries/inquiryApi.js';
import {
  backUserCommunityHistoryState,
  pushUserCommunityHistoryState,
  readUserCommunityHistoryState,
  replaceUserCommunityHistoryState,
} from '../routing/userCommunityHistory.js';
import {
  DOMESTIC_PHONE_PREFIXES,
  buildDomesticPhoneNumber,
  isValidDomesticPhoneNumber,
  normalizePhoneDigits,
  normalizePhoneMiddleDigits,
} from '../utils/memberPolicy.js';

const GUEST_ACCESS_SESSION_KEY = 'mk_laptop_guest_inquiry_access';
const PAGE_SIZE_FALLBACK = 10;
const PAGE_SIZE_OPTIONS = Object.freeze([10, 30, 50]);
const normalizeListPageSize = (value) => {
  const parsed = Math.trunc(Number(value));
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : PAGE_SIZE_FALLBACK;
};

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

const trim = (value) => String(value ?? '').trim();

const parseDomesticPhoneDraft = (value) => {
  const [rawPrefix = '', rawMiddle = '', rawLast = ''] = String(value || '').trim().split('-', 3);
  return {
    prefix: DOMESTIC_PHONE_PREFIXES.includes(rawPrefix) ? rawPrefix : '010',
    middle: normalizePhoneMiddleDigits(rawMiddle),
    last: normalizePhoneDigits(rawLast, 4),
  };
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).format(date);
};

const emptyForm = () => ({ categoryId: '', title: '', bodyHtml: '', attachments: [] });
const emptyGuestForm = () => ({
  name: '', team: '', email: '', phone: '', password: '', passwordConfirm: '',
  categoryId: '', title: '', bodyHtml: '', attachments: [], termDecisions: {},
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
    <div className="mb-1.5 text-xs font-semibold text-slate-600">{label}</div>
    {children}
  </div>
);

const IdentityText = ({ label, value }) => (
  <div className="min-w-0 border-b border-slate-100 pb-2">
    <div className="text-xs font-semibold text-slate-500">{label}</div>
    <div className="mt-1 break-words text-sm font-semibold text-slate-900">{value || '-'}</div>
  </div>
);

const PasswordInput = ({ value, onChange, autoComplete = 'current-password', disabled = false }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-11 text-sm outline-none transition mk-form-focus disabled:bg-slate-50 disabled:text-slate-500"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        title={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
};

export default function UserInquiryPanel({ ctx }) {
  const { hasFirebaseAuthSession, goToUserLogin, triggerToast } = ctx;
  const redirectingToLoginRef = useRef(false);
  const cachedSummaryConfig = inquiryApi.peekPublicConfig({
    includeGuestTerms: false,
    includeCategories: hasFirebaseAuthSession,
  });
  const cachedMemberList = hasFirebaseAuthSession
    ? inquiryApi.peekMemberList({ page: 1, search: '', pageSize: PAGE_SIZE_FALLBACK })
    : null;

  const [config, setConfig] = useState(() => cachedSummaryConfig);
  const [configError, setConfigError] = useState('');
  const [configLoading, setConfigLoading] = useState(() => !cachedSummaryConfig);
  const [guestTermsReady, setGuestTermsReady] = useState(false);
  const [guestTermsLoading, setGuestTermsLoading] = useState(false);

  const [listLoading, setListLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(() => Boolean(cachedMemberList));
  const [items, setItems] = useState(() => Array.isArray(cachedMemberList?.items) ? cachedMemberList.items : []);
  const [totalCount, setTotalCount] = useState(() => Number(cachedMemberList?.totalCount || 0));
  const [page, setPage] = useState(() => Number(cachedMemberList?.page || 1));
  const [listPageSize, setListPageSize] = useState(() => normalizeListPageSize(cachedMemberList?.pageSize));

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [memberView, setMemberView] = useState('list');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const memberSearchTimerRef = useRef(null);
  const [editingPublicId, setEditingPublicId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [guestEntry, setGuestEntry] = useState('intro');
  const [guestMode, setGuestMode] = useState('verify');
  const [guestForm, setGuestForm] = useState(emptyGuestForm);
  const [guestVerify, setGuestVerify] = useState({ name: '', email: '', phone: '', password: '' });
  const [guestPreparedPassword, setGuestPreparedPassword] = useState('');
  const [guestAccess, setGuestAccess] = useState(readGuestAccess);
  const [guestVerifyLoading, setGuestVerifyLoading] = useState(false);
  const [guestPrepareLoading, setGuestPrepareLoading] = useState(false);

  const pageSize = normalizeListPageSize(listPageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const categories = Array.isArray(config?.categories) ? config.categories : [];
  const guestTerms = Array.isArray(config?.guestTerms) ? config.guestTerms : [];

  const notify = useCallback((message, type = 'success') => {
    if (typeof triggerToast === 'function') triggerToast(message, type);
  }, [triggerToast]);

  const applyConfig = useCallback((next, { includeGuestTerms = false } = {}) => {
    setConfig((current) => includeGuestTerms ? { ...(current || {}), ...next } : next);
    setConfigError('');
    if (includeGuestTerms) setGuestTermsReady(true);
  }, []);

  const loadSummaryConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const next = await inquiryApi.getPublicConfig({
        includeGuestTerms: false,
        includeCategories: hasFirebaseAuthSession || Boolean(guestAccess?.token),
      });
      applyConfig(next);
      return next;
    } catch (error) {
      setConfigError('문의하기 설정을 불러오지 못했습니다.');
      return null;
    } finally {
      setConfigLoading(false);
    }
  }, [applyConfig, guestAccess?.token, hasFirebaseAuthSession]);

  const ensureGuestTerms = useCallback(async () => {
    if (guestTermsReady) return config;
    setGuestTermsLoading(true);
    try {
      const next = await inquiryApi.getPublicConfig({ includeGuestTerms: true, includeCategories: true });
      applyConfig(next, { includeGuestTerms: true });
      return next;
    } catch (error) {
      notify('비회원 문의 설정을 불러오지 못했습니다.', 'error');
      return null;
    } finally {
      setGuestTermsLoading(false);
    }
  }, [applyConfig, config, guestTermsReady, notify]);

  const applyListResult = useCallback((result, targetPage = 1) => {
    const safeResult = result || {};
    setItems(Array.isArray(safeResult.items) ? safeResult.items : []);
    setTotalCount(Number(safeResult.totalCount || 0));
    setPage(Number(safeResult.page || targetPage || 1));
    setListPageSize(normalizeListPageSize(safeResult.pageSize));
    setListLoaded(true);
  }, []);

  const clearGuestSession = useCallback(() => {
    writeGuestAccess(null);
    setGuestAccess(null);
    setItems([]);
    setTotalCount(0);
    setDetail(null);
    setPage(1);
    setListPageSize(PAGE_SIZE_FALLBACK);
    setMemberSearchQuery('');
    setListLoaded(false);
    setGuestEntry('intro');
    setGuestMode('verify');
    setEditingPublicId('');
    replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'intro' });
  }, []);

  const loadList = useCallback(async ({ targetPage = page, access = guestAccess, search = memberSearchQuery, targetPageSize = listPageSize } = {}) => {
    const requestedPageSize = normalizeListPageSize(targetPageSize);
    setListLoading(true);
    try {
      const result = hasFirebaseAuthSession
        ? await inquiryApi.listMember({ page: targetPage, search, pageSize: requestedPageSize })
        : access?.token
          ? await inquiryApi.listGuest({ token: access.token, page: targetPage, search, pageSize: requestedPageSize })
          : { items: [], totalCount: 0, page: 1, pageSize: requestedPageSize };
      applyListResult(result, targetPage);
      return result;
    } catch (error) {
      if (!hasFirebaseAuthSession && ['guest_inquiry_session_required', 'guest_inquiry_session_invalid'].includes(error?.code)) {
        clearGuestSession();
      } else {
        notify('문의 내역을 불러오지 못했습니다.', 'error');
      }
      return null;
    } finally {
      setListLoading(false);
    }
  }, [applyListResult, clearGuestSession, guestAccess, hasFirebaseAuthSession, listPageSize, memberSearchQuery, notify, page]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (hasFirebaseAuthSession) {
        const warmConfig = inquiryApi.peekPublicConfig({
          includeGuestTerms: false,
          includeCategories: true,
        });
        const warmList = inquiryApi.peekMemberList({ page: 1, search: '', pageSize: PAGE_SIZE_FALLBACK });
        if (warmConfig) applyConfig(warmConfig);
        if (warmList) applyListResult(warmList, 1);
        if (!warmConfig && !warmList) {
          await Promise.all([
            loadSummaryConfig(),
            loadList({ targetPage: 1, search: '', targetPageSize: PAGE_SIZE_FALLBACK }),
          ]);
        } else if (!warmConfig) {
          await loadSummaryConfig();
        } else if (!warmList) {
          await loadList({ targetPage: 1, search: '', targetPageSize: PAGE_SIZE_FALLBACK });
        }
        return;
      }

      const next = await loadSummaryConfig();
      if (!active || !next) return;
      if (guestAccess?.token) {
        await loadList({ targetPage: 1, access: guestAccess, search: '', targetPageSize: PAGE_SIZE_FALLBACK });
      }
    })();
    return () => { active = false; };
  // Member inquiry list and lightweight policy config load in parallel for faster first paint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFirebaseAuthSession]);

  useEffect(() => {
    if (configLoading || !config || hasFirebaseAuthSession || config.allowGuest || redirectingToLoginRef.current) return;
    redirectingToLoginRef.current = true;
    goToUserLogin();
  }, [config, configLoading, goToUserLogin, hasFirebaseAuthSession]);

  useEffect(() => {
    if (!hasFirebaseAuthSession) return;
    redirectingToLoginRef.current = false;
    setMemberView('list');
    setEditingPublicId('');
    setDetail(null);
  }, [hasFirebaseAuthSession]);

  useEffect(() => () => {
    if (memberSearchTimerRef.current) {
      window.clearTimeout(memberSearchTimerRef.current);
    }
  }, []);

  const handleMemberSearchChange = (query) => {
    setMemberSearchQuery(query);
    setPage(1);
    if (memberSearchTimerRef.current) {
      window.clearTimeout(memberSearchTimerRef.current);
    }
    memberSearchTimerRef.current = window.setTimeout(() => {
      void loadList({ targetPage: 1, search: query, targetPageSize: listPageSize });
    }, 250);
  };

  const handleListPageSizeChange = (value) => {
    if (memberSearchTimerRef.current) {
      window.clearTimeout(memberSearchTimerRef.current);
      memberSearchTimerRef.current = null;
    }
    const nextPageSize = normalizeListPageSize(value);
    setListPageSize(nextPageSize);
    setPage(1);
    void loadList({ targetPage: 1, search: memberSearchQuery, targetPageSize: nextPageSize });
  };

  const resetOwnedForm = useCallback(() => {
    setEditingPublicId('');
    setForm(emptyForm());
  }, [categories]);

  const showMemberCompose = ({ historyMode = 'push' } = {}) => {
    resetOwnedForm();
    setDetail(null);
    setMemberView('compose');
    if (historyMode === 'push') {
      pushUserCommunityHistoryState({ tab: 'inquiry', view: 'compose' });
    }
  };

  const showMemberList = async ({ historyMode = 'none' } = {}) => {
    setEditingPublicId('');
    setDetail(null);
    setMemberView('list');
    if (historyMode === 'replace') {
      replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'list' });
    }
    if (!listLoaded) await loadList({ targetPage: 1 });
  };

  const openDetail = async (publicId, { historyMode = 'push' } = {}) => {
    setDetailLoading(true);
    try {
      const next = hasFirebaseAuthSession
        ? await inquiryApi.getMember(publicId)
        : await inquiryApi.getGuest(publicId, guestAccess?.token);
      setDetail(next);
      if (hasFirebaseAuthSession) setMemberView('detail');
      if (historyMode === 'push') {
        pushUserCommunityHistoryState({ tab: 'inquiry', view: 'detail', id: publicId });
      }
    } catch (error) {
      notify('문의 상세를 불러오지 못했습니다.', 'error');
      if (!hasFirebaseAuthSession && error?.status === 401) clearGuestSession();
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = () => {
    if (!detail || Number(detail.answerCount || 0) > 0) return;
    setEditingPublicId(detail.publicId);
    setForm({
      categoryId: detail.categoryId || '',
      title: detail.title || '',
      bodyHtml: sanitizeRichTextHtml(detail.bodyHtml || detail.bodyText || ''),
      attachments: Array.isArray(detail.attachments)
        ? detail.attachments.map((attachment) => ({ ...attachment, targetUrl: '' }))
        : [],
    });
    if (hasFirebaseAuthSession) setMemberView('compose');
    pushUserCommunityHistoryState({ tab: 'inquiry', view: 'compose', id: detail.publicId });
  };

  const cancelOwnedEdit = () => {
    const currentHistory = readUserCommunityHistoryState();
    if (currentHistory?.tab === 'inquiry' && currentHistory.view === 'compose' && backUserCommunityHistoryState({ tab: 'inquiry', view: 'compose', id: currentHistory.id })) {
      return;
    }
    if (editingPublicId && detail) {
      setEditingPublicId('');
      if (hasFirebaseAuthSession) setMemberView('detail');
      return;
    }
    if (hasFirebaseAuthSession) void showMemberList({ historyMode: 'replace' });
  };

  const saveMemberOrGuestInquiry = async () => {
    const wasEditing = Boolean(editingPublicId);
    const editingId = editingPublicId;
    const bodyHtml = sanitizeRichTextHtml(form.bodyHtml);
    const bodyText = richTextHtmlToText(bodyHtml);
    if (!form.categoryId || !form.title.trim() || isRichTextEmpty(bodyHtml)) {
      notify('문의 구분, 제목, 본문을 모두 입력해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, bodyHtml, bodyText };
      let next;
      if (editingPublicId) {
        next = hasFirebaseAuthSession
          ? await inquiryApi.updateMember(editingPublicId, payload)
          : await inquiryApi.updateGuest(editingPublicId, payload, guestAccess?.token);
      } else {
        next = await inquiryApi.createMember(payload);
      }
      notify(editingPublicId ? '문의가 수정되었습니다.' : '문의가 등록되었습니다.');
      setEditingPublicId('');
      setListLoaded(false);
      if (next) {
        setDetail(next);
        if (hasFirebaseAuthSession) setMemberView('detail');
        if (wasEditing && backUserCommunityHistoryState({ tab: 'inquiry', view: 'compose', id: editingId })) {
          return;
        }
        replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'detail', id: next.publicId || editingId });
      } else if (hasFirebaseAuthSession) {
        await showMemberList({ historyMode: 'replace' });
      }
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
      setListLoaded(false);
      const returnedByHistory = backUserCommunityHistoryState({ tab: 'inquiry', view: 'detail', id: detail.publicId });
      if (hasFirebaseAuthSession) {
        setMemberView('list');
        await loadList({ targetPage: 1 });
      } else {
        await loadList({ targetPage: 1, access: guestAccess, search: memberSearchQuery, targetPageSize: pageSize });
      }
      if (!returnedByHistory) {
        replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'list' });
      }
    } catch (error) {
      const answered = ['inquiry_answered_mutation_forbidden', 'inquiry_answered_delete_forbidden'].includes(error?.code);
      notify(answered ? '관리자 답변이 등록된 문의는 삭제할 수 없습니다.' : `문의 삭제에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    }
  };

  const createGuest = async () => {
    const hadGuestAccess = Boolean(guestAccess?.token);
    const bodyHtml = sanitizeRichTextHtml(guestForm.bodyHtml);
    const bodyText = richTextHtmlToText(bodyHtml);
    if (!guestForm.name.trim() || !guestForm.team.trim() || !guestForm.email.trim() || !isValidDomesticPhoneNumber(parseDomesticPhoneDraft(guestForm.phone))
      || !guestForm.password || !guestForm.passwordConfirm || !guestForm.categoryId || !guestForm.title.trim() || isRichTextEmpty(bodyHtml)) {
      notify('비회원 문의 필수 입력 항목을 모두 입력해 주세요.', 'error');
      return;
    }
    if (guestForm.password !== guestForm.passwordConfirm) {
      notify('문의 확인 비밀번호가 일치하지 않습니다.', 'error');
      return;
    }
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
      await inquiryApi.createGuest({
        ...guestForm,
        bodyHtml,
        bodyText,
        author: guestForm,
        currentPassword: guestPreparedPassword,
        termDecisions,
      });
      const access = await inquiryApi.verifyGuest({
        name: guestForm.name,
        email: guestForm.email,
        phone: guestForm.phone,
        password: guestForm.password,
      });
      writeGuestAccess(access);
      setGuestAccess(access);
      setGuestForm(emptyGuestForm());
      setGuestPreparedPassword('');
      setGuestMode('verify');
      setGuestEntry('guest');
      setListLoaded(false);
      const returnedToVerifiedList = hadGuestAccess
        ? backUserCommunityHistoryState({ tab: 'inquiry', view: 'compose' })
        : false;
      if (!returnedToVerifiedList) {
        replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'list' });
      }
      notify('비회원 문의가 등록되었습니다. 현재 브라우저에서 바로 확인할 수 있습니다.');
      setMemberSearchQuery('');
      setListPageSize(PAGE_SIZE_FALLBACK);
      await loadList({ targetPage: 1, access, search: '', targetPageSize: PAGE_SIZE_FALLBACK });
    } catch (error) {
      const message = error?.code === 'guest_inquiry_disabled'
        ? '현재 비회원 문의를 접수하지 않습니다.'
        : error?.code === 'guest_inquiry_identity_password_mismatch'
          ? '기존 비회원 문의의 문의 확인 비밀번호와 일치하지 않습니다.'
          : error?.code === 'guest_inquiry_required_terms_missing'
            ? '필수 약관에 모두 동의해 주세요.'
            : `비회원 문의 등록에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`;
      notify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasGuestVerificationInput = () => Boolean(
    guestVerify.name.trim()
    && guestVerify.email.trim()
    && isValidDomesticPhoneNumber(parseDomesticPhoneDraft(guestVerify.phone))
    && guestVerify.password
  );

  const verifyGuest = async () => {
    if (!hasGuestVerificationInput()) {
      notify('성명, 이메일, 연락처, 문의 확인 비밀번호를 모두 입력해 주세요.', 'error');
      return;
    }
    setGuestVerifyLoading(true);
    try {
      const access = await inquiryApi.verifyGuest(guestVerify);
      writeGuestAccess(access);
      setGuestAccess(access);
      setDetail(null);
      setListLoaded(false);
      replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'list' });
      setMemberSearchQuery('');
      setListPageSize(PAGE_SIZE_FALLBACK);
      await loadList({ targetPage: 1, access, search: '', targetPageSize: PAGE_SIZE_FALLBACK });
      notify('비회원 문의 확인 인증이 완료되었습니다.');
    } catch (error) {
      notify('입력한 정보와 일치하는 문의를 확인할 수 없습니다.', 'error');
    } finally {
      setGuestVerifyLoading(false);
    }
  };

  const prepareGuestCreate = async () => {
    if (!hasGuestVerificationInput()) {
      notify('성명, 이메일, 연락처, 문의 확인 비밀번호를 모두 입력해 주세요.', 'error');
      return;
    }
    setGuestPrepareLoading(true);
    try {
      await inquiryApi.prepareGuestCreate(guestVerify);
      const nextConfig = await ensureGuestTerms();
      if (!nextConfig) return;
      setGuestPreparedPassword(guestVerify.password);
      setGuestForm({
        ...emptyGuestForm(),
        name: guestVerify.name.trim(),
        email: guestVerify.email.trim(),
        phone: guestVerify.phone.trim(),
        password: guestVerify.password,
        passwordConfirm: '',
      });
      setGuestMode('create');
      pushUserCommunityHistoryState({ tab: 'inquiry', view: 'compose' });
    } catch (error) {
      const message = error?.code === 'guest_inquiry_identity_password_mismatch'
        ? '기존 비회원 문의의 문의 확인 비밀번호와 일치하지 않습니다.'
        : error?.code === 'guest_inquiry_disabled'
          ? '현재 비회원 문의를 접수하지 않습니다.'
          : '비회원 문의 등록 정보를 확인하지 못했습니다.';
      notify(message, 'error');
    } finally {
      setGuestPrepareLoading(false);
    }
  };

  const enterGuestFlow = async () => {
    setGuestEntry('guest');
    setGuestMode('verify');
    replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'verify' });
  };

  const cancelGuestCreate = () => {
    setGuestForm(emptyGuestForm());
    setGuestPreparedPassword('');

    const currentHistory = readUserCommunityHistoryState();
    if (currentHistory?.tab === 'inquiry' && currentHistory.view === 'compose' && backUserCommunityHistoryState({ tab: 'inquiry', view: 'compose', id: currentHistory.id })) {
      return;
    }

    setDetail(null);
    setEditingPublicId('');
    setGuestMode('verify');
    if (guestAccess?.token) {
      if (!listLoaded) void loadList({ targetPage: 1, access: guestAccess });
      replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'list' });
      return;
    }
    replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'verify' });
  };

  const startGuestCreateFromList = async () => {
    setDetail(null);
    setEditingPublicId('');
    setGuestEntry('guest');

    if (hasGuestVerificationInput()) {
      setGuestPrepareLoading(true);
      try {
        const nextConfig = await ensureGuestTerms();
        if (!nextConfig) return;
        setGuestPreparedPassword(guestVerify.password);
        setGuestForm({
          ...emptyGuestForm(),
          name: guestVerify.name.trim(),
          email: guestVerify.email.trim(),
          phone: guestVerify.phone.trim(),
          password: guestVerify.password,
          passwordConfirm: '',
        });
        setGuestMode('create');
        pushUserCommunityHistoryState({ tab: 'inquiry', view: 'compose' });
      } finally {
        setGuestPrepareLoading(false);
      }
      return;
    }

    const firstInquiryId = items[0]?.publicId;
    if (!firstInquiryId || !guestAccess?.token) {
      setGuestMode('verify');
      replaceUserCommunityHistoryState({ tab: 'inquiry', view: 'verify' });
      return;
    }

    setGuestPrepareLoading(true);
    try {
      const [identityInquiry, nextConfig] = await Promise.all([
        inquiryApi.getGuest(firstInquiryId, guestAccess.token),
        ensureGuestTerms(),
      ]);
      if (!identityInquiry || !nextConfig) return;
      setGuestPreparedPassword('');
      setGuestForm({
        ...emptyGuestForm(),
        name: identityInquiry.authorName || '',
        email: identityInquiry.authorEmail || '',
        phone: identityInquiry.authorPhone || '',
        password: '',
        passwordConfirm: '',
      });
      setGuestMode('create');
      pushUserCommunityHistoryState({ tab: 'inquiry', view: 'compose' });
    } catch (error) {
      if (['guest_inquiry_session_required', 'guest_inquiry_session_invalid'].includes(error?.code)) {
        clearGuestSession();
        return;
      }
      notify('비회원 문의 등록 화면을 준비하지 못했습니다.', 'error');
    } finally {
      setGuestPrepareLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const current = readUserCommunityHistoryState();
    if (!current || current.tab !== 'inquiry') {
      replaceUserCommunityHistoryState({
        tab: 'inquiry',
        view: hasFirebaseAuthSession || guestAccess?.token
          ? 'list'
          : guestEntry === 'guest'
            ? 'verify'
            : 'intro',
      });
    }

    const syncInquiryHistory = () => {
      const target = readUserCommunityHistoryState();
      if (!target || target.tab !== 'inquiry') return;

      if (target.view === 'detail' && target.id) {
        setEditingPublicId('');
        void openDetail(target.id, { historyMode: 'none' });
        return;
      }

      if (target.view === 'compose') {
        setDetail(null);
        if (hasFirebaseAuthSession) {
          setMemberView('compose');
          if (target.id) setEditingPublicId(target.id);
        } else {
          setGuestEntry('guest');
          setGuestMode('create');
        }
        return;
      }

      setDetail(null);
      setEditingPublicId('');
      if (hasFirebaseAuthSession) {
        setMemberView('list');
        if (!listLoaded) void loadList({ targetPage: 1 });
        return;
      }

      if (target.view === 'list') {
        setGuestMode('verify');
        if (guestAccess?.token && !listLoaded) {
          void loadList({ targetPage: 1, access: guestAccess });
        }
        return;
      }

      if (target.view === 'verify') {
        setGuestEntry('guest');
        setGuestMode('verify');
        return;
      }

      if (target.view === 'intro') {
        setGuestEntry('intro');
        setGuestMode('verify');
        return;
      }

      setGuestMode('verify');
    };

    syncInquiryHistory();
    window.addEventListener('popstate', syncInquiryHistory);
    return () => window.removeEventListener('popstate', syncInquiryHistory);
  // openDetail intentionally stays outside dependencies so the popstate listener is not recreated on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestAccess?.token, guestEntry, hasFirebaseAuthSession, listLoaded]);

  const returnToInquiryList = () => {
    setDetail(null);
    setEditingPublicId('');
    if (hasFirebaseAuthSession) {
      setMemberView('list');
      if (!listLoaded) void loadList({ targetPage: 1 });
    } else {
      setGuestMode('verify');
    }
    pushUserCommunityHistoryState({ tab: 'inquiry', view: 'list' });
  };

  const listNumber = useMemo(() => {
    const map = new Map();
    items.forEach((item, index) => map.set(item.publicId, Math.max(1, totalCount - ((page - 1) * pageSize) - index)));
    return map;
  }, [items, page, pageSize, totalCount]);

  const renderOwnedEditor = () => (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-base font-bold text-slate-900">{editingPublicId ? '문의 수정' : '문의 작성'}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {editingPublicId ? '관리자 답변이 등록되기 전 문의만 수정할 수 있습니다.' : '이용 중 궁금하신 점을 작성해주세요. 담당자 확인 후 답변드리겠습니다.'}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]">
        <Field label="문의 구분">
          <Select value={form.categoryId} onChange={(categoryId) => setForm((current) => ({ ...current, categoryId }))}>
            <option value="">선택</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </Field>
        <Field label="제목">
          <Input value={form.title} maxLength={200} onChange={(title) => setForm((current) => ({ ...current, title }))} />
        </Field>
      </div>
      <RichTextEditor
        label="문의 본문"
        value={form.bodyHtml}
        onChange={(bodyHtml) => setForm((current) => ({ ...current, bodyHtml }))}
        minHeight={320}
        disabled={saving}
      />
      <SecureAttachmentEditor
        value={form.attachments || []}
        onChange={(attachments) => setForm((current) => ({ ...current, attachments }))}
        disabled={saving}
      />
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        {hasFirebaseAuthSession ? <Button type="button" variant="outline" disabled={saving} onClick={cancelOwnedEdit}>취소</Button> : editingPublicId ? <Button type="button" variant="outline" disabled={saving} onClick={cancelOwnedEdit}>취소</Button> : null}
        <Button type="button" variant="primary" disabled={saving} onClick={saveMemberOrGuestInquiry}>{saving ? '저장 중' : editingPublicId ? '문의 수정' : '문의 등록'}</Button>
      </div>
    </section>
  );

  const renderDetail = () => {
    if (!detail) return null;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2"><InquiryStatusBadge status={detail.status} /><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{detail.categoryName || '문의 구분'}</span></div>
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
          <div className="flex-1 space-y-6 px-5 py-6">
            <RichTextContent html={detail.bodyHtml} text={detail.bodyText} className="text-sm leading-7 text-slate-700" />
            <SecureAttachmentList
              attachments={detail.attachments}
              authMode={hasFirebaseAuthSession ? 'clerk' : 'guest'}
              guestToken={guestAccess?.token || ''}
            />
          </div>
        </article>

        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-900">답변 {Number(detail.answerCount || 0)}건</h4>
          {Array.isArray(detail.answers) && detail.answers.length > 0 ? detail.answers.map((answer, index) => (
            <article key={answer.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-sm font-bold text-slate-900">{index === 0 ? '답변입니다.' : `${index}번째 추가답변입니다.`}</div>
                <div className="mt-1 text-[11px] text-slate-500">{answer.adminDisplayName ? `${answer.adminDisplayName} · ` : ''}{formatDateTime(answer.createdAt)}{answer.updatedAt && answer.updatedAt !== answer.createdAt ? ' · 수정됨' : ''}</div>
              </div>
              <div className="space-y-5 px-5 py-5">
                <RichTextContent html={answer.bodyHtml} text={answer.bodyText} className="text-sm leading-7 text-slate-700" />
                <SecureAttachmentList
                  attachments={answer.attachments}
                  authMode={hasFirebaseAuthSession ? 'clerk' : 'guest'}
                  guestToken={guestAccess?.token || ''}
                />
              </div>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-xs text-slate-500">아직 등록된 답변이 없습니다.</div>}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-[680px] w-full border-collapse text-left">
            <tbody>
              {[
                ['이전글', detail.navigation?.previous],
                ['다음글', detail.navigation?.next],
              ].map(([label, item]) => (
                <tr key={label} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    {item ? (
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-12 shrink-0 text-[11px] font-normal text-slate-500">{label}</span>
                        <button
                          type="button"
                          className="min-w-0 truncate text-left text-sm font-normal text-slate-800 hover:text-orange-600 hover:underline"
                          onClick={() => void openDetail(item.publicId)}
                        >
                          {item.title}
                        </button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-12 shrink-0 text-[11px] font-normal text-slate-500">{label}</span>
                        <span className="text-xs font-normal text-slate-400">{label}이 없습니다.</span>
                      </div>
                    )}
                  </td>
                  <td className="w-32 px-4 py-3 text-center text-xs text-slate-500">{item ? item.authorName || '' : ''}</td>
                  <td className="w-32 px-4 py-3 text-center text-xs text-slate-500">{item ? formatDate(item.createdAt) : ''}</td>
                  <td className="w-24 px-4 py-3 text-center text-xs text-slate-500"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={returnToInquiryList}
          >
            목록으로
          </Button>
          {Number(detail.answerCount || 0) === 0 ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={openEdit}><Pencil size={14} /> 수정</Button>
              <Button type="button" variant="dangerOutline" onClick={deleteCurrent}><Trash2 size={14} /> 삭제</Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderList = ({ guest = false } = {}) => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,4fr)_minmax(150px,1fr)] md:items-end">
          <label className="block min-w-0">
            <span className="block text-[11px] font-semibold text-slate-600">문의내역 검색</span>
            <div className="relative mt-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="search"
                value={memberSearchQuery}
                onChange={(event) => handleMemberSearchChange(event.target.value)}
                placeholder="문의 제목 또는 본문 검색"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
              />
            </div>
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-600">목록 표시</span>
            <select
              value={pageSize}
              onChange={(event) => handleListPageSizeChange(event.target.value)}
              disabled={listLoading}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs outline-none transition mk-form-focus disabled:bg-slate-100 disabled:text-slate-400"
              aria-label="문의 목록 표시 건수"
            >
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}개씩 보기</option>)}
            </select>
          </label>
        </div>
      </div>

      {listLoading || detailLoading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">문의 내역을 불러오는 중입니다.</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">{memberSearchQuery.trim() ? '검색 조건에 맞는 문의가 없습니다.' : '등록된 문의가 없습니다.'}</div> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600"><tr><th className="w-20 border-b border-slate-200 px-4 py-3 text-center">번호</th><th className="w-32 border-b border-slate-200 px-4 py-3 text-center">문의 구분</th><th className="border-b border-slate-200 px-4 py-3">제목</th><th className="w-28 border-b border-slate-200 px-4 py-3 text-center">상태</th><th className="w-40 border-b border-slate-200 px-4 py-3 text-center">작성일시</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.publicId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"><td className="px-4 py-3 text-center text-xs text-slate-500">{listNumber.get(item.publicId)}</td><td className="px-4 py-3 text-center text-xs text-slate-600">{item.categoryName || '-'}</td><td className="px-4 py-3"><button type="button" className="max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline" onClick={() => openDetail(item.publicId)}>{item.title}</button></td><td className="px-4 py-3 text-center"><InquiryStatusBadge status={item.status} /></td><td className="px-4 py-3 text-center text-xs text-slate-500">{formatDateTime(item.createdAt)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="text-[11px] text-slate-500 sm:justify-self-start">전체 문의 {totalCount}건 · {page} / {totalPages}페이지</div>
        <PaginationControls className="sm:justify-self-center" currentPage={page} totalPages={totalPages} disabled={listLoading} onPageChange={(nextPage) => loadList({ targetPage: nextPage, search: memberSearchQuery, targetPageSize: pageSize })} />
        <div className="flex flex-wrap gap-2 sm:justify-self-end">
          {guest ? (
            <>
              <Button type="button" variant="outline" onClick={clearGuestSession}>인증 종료</Button>
              <Button type="button" variant="primary" onClick={startGuestCreateFromList}>문의하기</Button>
            </>
          ) : <Button type="button" variant="primary" onClick={showMemberCompose}>문의 작성</Button>}
        </div>
      </div>
    </div>
  );
  const renderInquiryShell = (children) => (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-black tracking-tight">문의하기</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
            기기 대여 시스템 이용 중 궁금한 사항을 1:1로 문의할 수 있습니다.
          </p>
        </div>
      </div>
      <CardContent className="flex flex-1 flex-col p-6">{children}</CardContent>
    </Card>
  );

  if (configError) {
    return renderInquiryShell(<div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-800">{configError}</div>);
  }

  if (configLoading || !config) {
    return renderInquiryShell(<div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-xs text-slate-500">문의하기 화면을 준비하는 중입니다.</div>);
  }

  if (!hasFirebaseAuthSession && !config.allowGuest) {
    return renderInquiryShell(
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
        <LockKeyhole className="mx-auto text-slate-400" size={28} />
        <div className="mt-3 text-sm font-bold text-slate-900">로그인 화면으로 이동하고 있습니다.</div>
      </div>
    );
  }

  return renderInquiryShell(
    <div className="flex min-h-0 flex-1 flex-col gap-6">

      {!hasFirebaseAuthSession && config.allowGuest && !guestAccess?.token && guestEntry === 'intro' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">회원 문의</div>
            <p className="mt-2 text-xs leading-6 text-slate-500">로그인하시면 기존 문의를 확인하거나 새 문의를 작성할 수 있습니다.</p>
            <Button type="button" variant="primary" className="mt-5" onClick={goToUserLogin}>로그인</Button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">비회원 문의</div>
            <p className="mt-2 text-xs leading-6 text-slate-500">성명, 이메일, 연락처, 비밀번호를 입력하시면 기존 문의를 확인하거나 새 문의를 작성할 수 있습니다.</p>
            <Button type="button" variant="outline" className="mt-5" onClick={() => void enterGuestFlow()}>비회원 문의 등록 및 확인</Button>
          </div>
        </div>
      ) : null}

      {!hasFirebaseAuthSession && config.allowGuest && guestEntry === 'guest' && (guestMode === 'create' || !guestAccess?.token) ? (
        <>
          {guestMode === 'create' && guestTermsLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-500">비회원 문의 설정을 불러오는 중입니다.</div>
          ) : guestMode === 'create' ? (
            <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">비회원 문의 등록</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">문의 등록 및 확인 페이지에서 입력한 성명, 이메일, 연락처는 변경할 수 없습니다. 문의 확인 비밀번호는 아래 확인란에 다시 입력하시고, 비밀번호 변경시 새 비밀번호를 두 칸에 동일하게 입력해 주세요.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <IdentityText label="성명" value={guestForm.name} />
                <IdentityText label="이메일" value={guestForm.email} />
                <IdentityText label="연락처" value={guestForm.phone} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="부서/팀"><Input value={guestForm.team} onChange={(team) => setGuestForm((current) => ({ ...current, team }))} /></Field>
                <Field label="문의 확인 비밀번호">
                  <PasswordInput value={guestForm.password} onChange={(password) => setGuestForm((current) => ({ ...current, password }))} autoComplete="new-password" disabled={saving} />
                </Field>
                <Field label="문의 확인 비밀번호 확인">
                  <PasswordInput value={guestForm.passwordConfirm} onChange={(passwordConfirm) => setGuestForm((current) => ({ ...current, passwordConfirm }))} autoComplete="new-password" disabled={saving} />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]">
                <Field label="문의 구분">
                  <Select value={guestForm.categoryId} onChange={(categoryId) => setGuestForm((current) => ({ ...current, categoryId }))}>
                    <option value="">선택</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </Select>
                </Field>
                <Field label="제목"><Input value={guestForm.title} onChange={(title) => setGuestForm((current) => ({ ...current, title }))} maxLength={200} /></Field>
              </div>
              <RichTextEditor label="문의 본문" value={guestForm.bodyHtml} onChange={(bodyHtml) => setGuestForm((current) => ({ ...current, bodyHtml }))} minHeight={320} disabled={saving} />
              <SecureAttachmentEditor
                value={guestForm.attachments || []}
                onChange={(attachments) => setGuestForm((current) => ({ ...current, attachments }))}
                disabled={saving}
              />

              {guestTerms.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm font-bold text-slate-900">비회원 문의 약관 동의</div>
                  {guestTerms.map((term) => {
                    const key = `${term.source}:${term.id}`;
                    return (
                      <label key={key} className="block rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={Boolean(guestForm.termDecisions?.[key])} onChange={(event) => setGuestForm((current) => ({ ...current, termDecisions: { ...current.termDecisions, [key]: event.target.checked } }))} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${term.required ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{term.required ? '필수' : '선택'}</span>
                              <span>{term.title}</span>
                            </div>
                            <RichTextContent html={term.contentHtml} text={term.contentText} className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white p-3 text-xs leading-5 text-slate-600" />
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" disabled={saving} onClick={cancelGuestCreate}>취소</Button>
                <Button type="button" variant="primary" disabled={saving} onClick={createGuest}>{saving ? '등록 중' : '문의 등록'}</Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">비회원 문의 등록 및 확인</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">성명, 이메일, 연락처, 문의 확인 비밀번호를 입력해 기존 문의를 확인하거나 새 문의를 등록할 수 있습니다.</p>
              </div>
              <Field label="성명"><Input value={guestVerify.name} onChange={(name) => setGuestVerify((current) => ({ ...current, name }))} /></Field>
              <Field label="이메일"><Input type="email" value={guestVerify.email} onChange={(email) => setGuestVerify((current) => ({ ...current, email }))} /></Field>
              <DomesticPhoneInput
                label="연락처"
                {...parseDomesticPhoneDraft(guestVerify.phone)}
                onChange={(parts) => setGuestVerify((current) => ({ ...current, phone: buildDomesticPhoneNumber(parts) }))}
                disabled={guestVerifyLoading || guestPrepareLoading}
              />
              <Field label="문의 확인 비밀번호">
                <PasswordInput value={guestVerify.password} onChange={(password) => setGuestVerify((current) => ({ ...current, password }))} disabled={guestVerifyLoading || guestPrepareLoading} />
              </Field>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">비회원 문의 확인 비밀번호는 재설정할 수 없습니다. 비밀번호를 분실한 경우 기존 문의를 조회할 수 없습니다.</div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" disabled={guestVerifyLoading || guestPrepareLoading} onClick={prepareGuestCreate}>{guestPrepareLoading ? '확인 중' : '문의 등록'}</Button>
                <Button type="button" variant="primary" disabled={guestVerifyLoading || guestPrepareLoading} onClick={verifyGuest}>{guestVerifyLoading ? '확인 중' : '문의 확인'}</Button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {hasFirebaseAuthSession && memberView === 'compose' ? renderOwnedEditor() : null}
      {hasFirebaseAuthSession && memberView === 'detail' && detail && !editingPublicId ? renderDetail() : null}
      {hasFirebaseAuthSession && memberView === 'list' ? renderList() : null}

      {!hasFirebaseAuthSession && guestAccess?.token && guestMode !== 'create' && editingPublicId ? renderOwnedEditor() : null}
      {!hasFirebaseAuthSession && guestAccess?.token && guestMode !== 'create' && !editingPublicId && detail ? renderDetail() : null}
      {!hasFirebaseAuthSession && guestAccess?.token && guestMode !== 'create' && !editingPublicId && !detail ? renderList({ guest: true }) : null}
    </div>
  );
}
