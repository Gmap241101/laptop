import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';

import { AdminPageHeader, Button, Input, Select } from '../components/CommonUI.jsx';
import RichTextContent from '../components/RichTextContent.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { inquiryApi } from '../features/inquiries/inquiryApi.js';
import PaginationControls from '../components/PaginationControls.jsx';

const STATUS_LABELS = Object.freeze({ waiting: '답변대기', answered: '답변완료', additional: '추가답변' });
const STATUS_CLASSES = Object.freeze({
  waiting: 'border-amber-200 bg-amber-50 text-amber-700',
  answered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  additional: 'border-violet-200 bg-violet-50 text-violet-700',
});
const PAGE_SIZE_OPTIONS = Object.freeze([5, 10, 20, 30, 50]);

const trim = (value) => String(value ?? '').trim();
const htmlToText = (html) => {
  const source = String(html || '');
  if (typeof document !== 'undefined') {
    const node = document.createElement('div');
    node.innerHTML = source;
    return trim(node.textContent || node.innerText || '');
  }
  return trim(source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
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

const StatusBadge = ({ status }) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${STATUS_CLASSES[status] || STATUS_CLASSES.waiting}`}>{STATUS_LABELS[status] || STATUS_LABELS.waiting}</span>;

const ModalShell = ({ title, description = '', maxWidth = 'max-w-4xl', children, onClose }) => (
  <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-3 sm:p-5">
    <div className={`mk-modal-scroll-shell max-h-[94vh] w-full ${maxWidth} overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl`}>
      <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div><h3 className="text-base font-bold text-slate-950">{title}</h3>{description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}</div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="닫기"><X size={17} /></button>
      </div>
      {children}
    </div>
  </div>
);

const Field = ({ label, children }) => <div><div className="mb-1.5 text-[11px] font-semibold text-slate-600">{label}</div>{children}</div>;

export default function AdminInquiryPanel({ ctx }) {
  const { triggerConfirm, triggerToast } = ctx;
  const [settingsBundle, setSettingsBundle] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [answerEditing, setAnswerEditing] = useState(null);
  const [answerHtml, setAnswerHtml] = useState('');
  const [answerSaving, setAnswerSaving] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [termForm, setTermForm] = useState({ id: '', title: '', bodyHtml: '', required: true, enabled: true });
  const [termSaving, setTermSaving] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState({ id: '', name: '' });
  const [categorySaving, setCategorySaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ allowGuest: false, postsPerPage: 10, guestTermBindings: [] });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const notify = useCallback((message, type = 'success') => {
    if (typeof triggerToast === 'function') triggerToast(message, type);
  }, [triggerToast]);

  const categories = Array.isArray(settingsBundle?.categories) ? settingsBundle.categories : [];
  const signupTerms = Array.isArray(settingsBundle?.signupTerms) ? settingsBundle.signupTerms : [];
  const inquiryTerms = Array.isArray(settingsBundle?.inquiryTerms) ? settingsBundle.inquiryTerms : [];
  const pageSize = Number(settingsBundle?.settings?.postsPerPage || 10);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const loadSettings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setSettingsLoading(true);
    try {
      const bundle = await inquiryApi.getAdminSettings();
      setSettingsBundle(bundle);
      setSettingsDraft({
        allowGuest: Boolean(bundle?.settings?.allowGuest),
        postsPerPage: Number(bundle?.settings?.postsPerPage || 10),
        guestTermBindings: Array.isArray(bundle?.settings?.guestTermBindings) ? bundle.settings.guestTermBindings : [],
      });
      return bundle;
    } catch (error) {
      notify(`문의하기 관리 설정을 불러오지 못했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
      return null;
    } finally {
      if (!silent) setSettingsLoading(false);
    }
  }, [notify]);

  const loadList = useCallback(async ({ targetPage = page, bundle = settingsBundle } = {}) => {
    if (!bundle) return;
    setListLoading(true);
    try {
      const result = await inquiryApi.listAdmin({ search: query, status, categoryId, page: targetPage, pageSize: bundle.settings?.postsPerPage || 10 });
      setItems(Array.isArray(result.items) ? result.items : []);
      setTotalCount(Number(result.totalCount || 0));
      setPage(Number(result.page || targetPage || 1));
    } catch (error) {
      notify(`문의 목록을 불러오지 못했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setListLoading(false);
    }
  }, [categoryId, notify, page, query, settingsBundle, status]);

  useEffect(() => {
    let active = true;
    (async () => {
      const bundle = await loadSettings();
      if (!active || !bundle) return;
      await loadList({ targetPage: 1, bundle });
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsBundle) return undefined;
    const timer = window.setTimeout(() => { void loadList({ targetPage: 1 }); }, 220);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, categoryId]);

  const openDetail = async (publicId) => {
    setDetailLoading(true);
    try {
      setDetail(await inquiryApi.getAdmin(publicId));
    } catch (error) {
      notify(`문의 상세를 불러오지 못했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAfterMutation = async (nextDetail = null) => {
    if (nextDetail) setDetail(nextDetail);
    await Promise.all([loadList({ targetPage: page }), loadSettings({ silent: true })]);
  };

  const openAnswerEditor = (answer = null) => {
    setAnswerEditing(answer);
    setAnswerHtml(answer?.bodyHtml || '');
    setAnswerOpen(true);
  };

  const saveAnswer = async () => {
    if (!detail) return;
    const bodyText = htmlToText(answerHtml);
    if (!bodyText) { notify('답변 내용을 입력해 주세요.', 'error'); return; }
    setAnswerSaving(true);
    try {
      const next = answerEditing
        ? await inquiryApi.updateAnswer(detail.publicId, answerEditing.id, { bodyHtml: answerHtml, bodyText })
        : await inquiryApi.addAnswer(detail.publicId, { bodyHtml: answerHtml, bodyText });
      setAnswerOpen(false);
      setAnswerEditing(null);
      setAnswerHtml('');
      notify(answerEditing ? '관리자 답변이 수정되었습니다.' : '관리자 답변이 등록되었습니다.');
      await refreshAfterMutation(next);
    } catch (error) {
      notify(`관리자 답변 저장에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setAnswerSaving(false);
    }
  };

  const confirmDeleteAnswer = (answer) => {
    triggerConfirm('관리자 답변 삭제', '이 답변을 삭제하시겠습니까? 답변은 논리삭제되며 문의 상태가 다시 계산됩니다.', async () => {
      try {
        const next = await inquiryApi.deleteAnswer(detail.publicId, answer.id);
        notify('관리자 답변이 삭제되었습니다.');
        await refreshAfterMutation(next);
      } catch (error) {
        notify(`관리자 답변 삭제에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
      }
    });
  };

  const confirmDeleteInquiry = () => {
    if (!detail) return;
    triggerConfirm('문의 삭제', '이 문의를 삭제하시겠습니까? 관리자 삭제는 답변 유무와 관계없이 논리삭제됩니다.', async () => {
      try {
        await inquiryApi.deleteAdmin(detail.publicId);
        setDetail(null);
        notify('문의가 삭제되었습니다.');
        await loadList({ targetPage: 1 });
      } catch (error) {
        notify(`문의 삭제에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
      }
    });
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await inquiryApi.saveAdminSettings(settingsDraft);
      const bundle = await loadSettings({ silent: true });
      setSettingsOpen(false);
      setPage(1);
      notify('문의하기 설정이 저장되었습니다.');
      if (bundle) await loadList({ targetPage: 1, bundle });
    } catch (error) {
      notify(`문의하기 설정 저장에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleTermBinding = (source, id, checked) => {
    const key = `${source}:${id}`;
    setSettingsDraft((current) => {
      const existing = new Map((current.guestTermBindings || []).map((binding) => [`${binding.source}:${binding.id}`, binding]));
      if (checked) existing.set(key, { source, id }); else existing.delete(key);
      return { ...current, guestTermBindings: [...existing.values()] };
    });
  };

  const isTermBound = (source, id) => (settingsDraft.guestTermBindings || []).some((binding) => binding.source === source && binding.id === id);

  const saveCategory = async () => {
    if (!trim(categoryDraft.name)) { notify('문의 구분명을 입력해 주세요.', 'error'); return; }
    setCategorySaving(true);
    try {
      await inquiryApi.saveCategory(categoryDraft);
      setCategoryDraft({ id: '', name: '' });
      const bundle = await loadSettings({ silent: true });
      notify(categoryDraft.id ? '문의 구분이 수정되었습니다.' : '문의 구분이 등록되었습니다.');
      if (bundle) await loadList({ targetPage: 1, bundle });
    } catch (error) {
      notify(`문의 구분 저장에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const confirmDeleteCategory = (category) => {
    triggerConfirm('문의 구분 삭제', `'${category.name}' 문의 구분을 삭제하시겠습니까? 사용 중인 문의 구분은 삭제할 수 없습니다.`, async () => {
      try {
        await inquiryApi.deleteCategory(category.id);
        if (categoryId === category.id) setCategoryId('all');
        const bundle = await loadSettings({ silent: true });
        notify('문의 구분이 삭제되었습니다.');
        if (bundle) await loadList({ targetPage: 1, bundle });
      } catch (error) {
        const suffix = error?.code === 'inquiry_category_in_use' ? ` 현재 문의 ${Number(error?.payload?.inquiryCount || 0)}건에서 사용 중입니다.` : '';
        notify(`문의 구분 삭제에 실패했습니다.${suffix}${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
      }
    });
  };

  const openTermEditor = (term = null) => {
    setTermForm(term ? { id: term.id, title: term.title, bodyHtml: term.contentHtml || '', required: Boolean(term.required), enabled: term.enabled !== false } : { id: '', title: '', bodyHtml: '', required: true, enabled: true });
    setTermOpen(true);
  };

  const saveTerm = async () => {
    const bodyText = htmlToText(termForm.bodyHtml);
    if (!trim(termForm.title) || !bodyText) { notify('약관 제목과 본문을 입력해 주세요.', 'error'); return; }
    setTermSaving(true);
    try {
      await inquiryApi.saveInquiryTerm({ ...termForm, bodyText });
      await loadSettings({ silent: true });
      setTermOpen(false);
      notify(termForm.id ? '문의 전용 약관이 수정되었습니다.' : '문의 전용 약관이 등록되었습니다.');
    } catch (error) {
      notify(`문의 전용 약관 저장에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
    } finally {
      setTermSaving(false);
    }
  };

  const confirmDeleteTerm = (term) => {
    triggerConfirm('문의 전용 약관 삭제', `'${term.title}' 약관을 삭제하시겠습니까? 비회원 문의 적용 약관으로 선택된 경우 삭제할 수 없습니다.`, async () => {
      try {
        await inquiryApi.deleteInquiryTerm(term.id);
        await loadSettings({ silent: true });
        notify('문의 전용 약관이 삭제되었습니다.');
      } catch (error) {
        notify(`문의 전용 약관 삭제에 실패했습니다.${error?.code ? ` 오류 코드: ${error.code}` : ''}`, 'error');
      }
    });
  };

  const resultNumber = useMemo(() => {
    const map = new Map();
    items.forEach((item, index) => map.set(item.publicId, Math.max(1, totalCount - ((page - 1) * pageSize) - index)));
    return map;
  }, [items, page, pageSize, totalCount]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="문의하기 관리" description="회원·비회원 1:1 문의와 관리자 답변, 문의 정책을 PostgreSQL 기준으로 관리합니다." />

      {settingsLoading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">문의하기 관리 설정을 불러오는 중입니다.</div> : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setCategoryId('all'); setPage(1); }} className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${categoryId === 'all' ? 'border-orange-500 bg-orange-500 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'}`}>전체</button>
            {categories.map((category) => <button key={category.id} type="button" onClick={() => { setCategoryId(category.id); setPage(1); }} className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${categoryId === category.id ? 'border-orange-500 bg-orange-500 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'}`}>{category.name}</button>)}
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="문의 검색"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="제목, 본문, 작성자명, 이메일, 연락처 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none mk-form-focus" /></div></Field>
            <Field label="상태"><Select value={status} onChange={(value) => { setStatus(value); setPage(1); }}><option value="all">전체</option><option value="waiting">답변대기</option><option value="answered">답변완료</option><option value="additional">추가답변</option></Select></Field>
          </div>

          {detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" onClick={() => setDetail(null)}>목록으로</Button><div className="flex gap-2"><Button type="button" variant="primary" onClick={() => openAnswerEditor()}><Plus size={14} /> 답변 등록</Button><Button type="button" variant="dangerOutline" onClick={confirmDeleteInquiry}><Trash2 size={14} /> 문의 삭제</Button></div></div>
              <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap gap-2"><StatusBadge status={detail.status} /><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{detail.authorType === 'member' ? '회원' : '비회원'}</span><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{detail.categoryName}</span></div>
                  <h3 className="mt-3 text-lg font-bold text-slate-950">{detail.title}</h3>
                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div><span className="text-slate-400">성명</span><div className="mt-1 font-semibold text-slate-800">{detail.authorName || '-'}</div></div><div><span className="text-slate-400">부서/팀</span><div className="mt-1 font-semibold text-slate-800">{detail.authorTeam || '-'}</div></div><div><span className="text-slate-400">이메일</span><div className="mt-1 font-semibold text-slate-800 break-all">{detail.authorEmail || '-'}</div></div><div><span className="text-slate-400">연락처</span><div className="mt-1 font-semibold text-slate-800">{detail.authorPhone || '-'}</div></div><div><span className="text-slate-400">회원 UID</span><div className="mt-1 break-all font-semibold text-slate-800">{detail.authorType === 'member' ? (detail.memberUid || '-') : '-'}</div></div><div><span className="text-slate-400">작성일시</span><div className="mt-1 font-semibold text-slate-800">{formatDateTime(detail.createdAt)}</div></div><div><span className="text-slate-400">상태</span><div className="mt-1 font-semibold text-slate-800">{STATUS_LABELS[detail.status] || '-'}</div></div><div><span className="text-slate-400">답변 수</span><div className="mt-1 font-semibold text-slate-800">{Number(detail.answerCount || 0)}건</div></div>
                  </div>
                </div>
                <div className="min-h-[220px] p-5"><RichTextContent html={detail.bodyHtml} text={detail.bodyText} className="text-sm leading-7 text-slate-700" /></div>
              </article>
              <div className="space-y-3"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">관리자 답변 이력</h4><span className="text-xs text-slate-500">유효 답변 {Number(detail.answerCount || 0)}건</span></div>{Array.isArray(detail.answers) && detail.answers.length ? detail.answers.map((answer, index) => <article key={answer.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4"><div><div className="text-sm font-bold text-slate-900">관리자 답변 {index + 1}</div><div className="mt-1 text-[11px] text-slate-500">{answer.adminDisplayName || '관리자'} · {formatDateTime(answer.createdAt)}{answer.updatedAt && answer.updatedAt !== answer.createdAt ? ` · 수정 ${formatDateTime(answer.updatedAt)}` : ''}</div></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => openAnswerEditor(answer)}><Edit3 size={13} /> 수정</Button><Button type="button" variant="dangerOutline" onClick={() => confirmDeleteAnswer(answer)}><Trash2 size={13} /> 삭제</Button></div></div><div className="p-5"><RichTextContent html={answer.bodyHtml} text={answer.bodyText} className="text-sm leading-7 text-slate-700" /></div></article>) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-xs text-slate-500">등록된 관리자 답변이 없습니다.</div>}</div>
            </div>
          ) : (
            <>
              {listLoading || detailLoading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">문의 목록을 불러오는 중입니다.</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">검색 조건에 맞는 문의가 없습니다.</div> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1180px] table-fixed border-collapse text-left"><thead className="bg-slate-50 text-[11px] font-semibold text-slate-600"><tr><th className="w-14 border-b border-slate-200 px-3 py-3 text-center">번호</th><th className="w-24 border-b border-slate-200 px-3 py-3 text-center">상태</th><th className="w-20 border-b border-slate-200 px-3 py-3 text-center">회원구분</th><th className="w-28 border-b border-slate-200 px-3 py-3 text-center">문의 구분</th><th className="border-b border-slate-200 px-3 py-3">제목</th><th className="w-24 border-b border-slate-200 px-3 py-3 text-center">작성자</th><th className="w-36 border-b border-slate-200 px-3 py-3 text-center">작성일시</th><th className="w-20 border-b border-slate-200 px-3 py-3 text-center">답변수</th><th className="w-36 border-b border-slate-200 px-3 py-3 text-center">최근 답변일시</th><th className="w-24 border-b border-slate-200 px-3 py-3 text-center">관리</th></tr></thead><tbody>{items.map((item) => <tr key={item.publicId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"><td className="px-3 py-3 text-center text-xs text-slate-500">{resultNumber.get(item.publicId)}</td><td className="px-3 py-3 text-center"><StatusBadge status={item.status} /></td><td className="px-3 py-3 text-center text-xs text-slate-600">{item.authorType === 'member' ? '회원' : '비회원'}</td><td className="px-3 py-3 text-center text-xs text-slate-600">{item.categoryName || '-'}</td><td className="min-w-0 px-3 py-3"><button type="button" title={item.title} onClick={() => openDetail(item.publicId)} className="block max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline">{item.title}</button></td><td className="px-3 py-3 text-center text-xs text-slate-600">{item.authorName || '-'}</td><td className="px-3 py-3 text-center text-xs text-slate-500">{formatDateTime(item.createdAt)}</td><td className="px-3 py-3 text-center text-xs text-slate-600">{Number(item.answerCount || 0)}</td><td className="px-3 py-3 text-center text-xs text-slate-500">{formatDateTime(item.latestAnswerAt)}</td><td className="px-3 py-3 text-center"><Button type="button" variant="outline" onClick={() => openDetail(item.publicId)}>상세</Button></td></tr>)}</tbody></table></div>}

              <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center"><div className="text-[11px] text-slate-500 sm:justify-self-start">검색 결과 {totalCount}건 · {page} / {totalPages}페이지</div><PaginationControls className="sm:justify-self-center" currentPage={page} totalPages={totalPages} onPageChange={(nextPage) => loadList({ targetPage: nextPage })} /><div className="flex flex-wrap gap-2 sm:justify-self-end"><Button type="button" variant="outline" onClick={() => setCategoryOpen(true)}>문의 구분 관리</Button><Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>문의 설정</Button></div></div>
            </>
          )}
        </>
      )}

      {answerOpen ? <ModalShell title={answerEditing ? '관리자 답변 수정' : '관리자 답변 등록'} description="동일 문의에 관리자 답변을 여러 번 등록할 수 있습니다." onClose={() => !answerSaving && setAnswerOpen(false)}><div className="p-5"><RichTextEditor label="답변 내용" value={answerHtml} onChange={setAnswerHtml} minHeight={320} disabled={answerSaving} /></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><Button type="button" variant="outline" disabled={answerSaving} onClick={() => setAnswerOpen(false)}>취소</Button><Button type="button" variant="primary" disabled={answerSaving} onClick={saveAnswer}>{answerSaving ? '저장 중' : '답변 저장'}</Button></div></ModalShell> : null}

      {categoryOpen ? <ModalShell title="문의 구분 관리" description="문의 작성 시 선택할 문의 구분을 등록·수정·삭제합니다." maxWidth="max-w-2xl" onClose={() => !categorySaving && setCategoryOpen(false)}><div className="space-y-4 p-5"><div className="flex gap-2"><Input value={categoryDraft.name} onChange={(name) => setCategoryDraft((c) => ({ ...c, name }))} placeholder="문의 구분명" onKeyDown={(e) => { if (e.key === 'Enter') void saveCategory(); }} /><Button type="button" variant="primary" disabled={categorySaving} onClick={saveCategory}>{categoryDraft.id ? '수정 적용' : '등록'}</Button>{categoryDraft.id ? <Button type="button" variant="outline" onClick={() => setCategoryDraft({ id: '', name: '' })}>취소</Button> : null}</div><div className="divide-y divide-slate-100 rounded-xl border border-slate-200">{categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><div className="text-sm font-semibold text-slate-800">{category.name}</div><div className="mt-1 text-[11px] text-slate-500">문의 {Number(category.inquiryCount || 0)}건</div></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setCategoryDraft({ id: category.id, name: category.name })}><Edit3 size={13} /> 수정</Button><Button type="button" variant="dangerOutline" onClick={() => confirmDeleteCategory(category)}><Trash2 size={13} /> 삭제</Button></div></div>)}</div></div></ModalShell> : null}

      {settingsOpen ? <ModalShell title="문의하기 설정" description="문의 가능 대상, 비회원 적용 약관, 페이지당 목록 표시 수를 설정합니다." maxWidth="max-w-4xl" onClose={() => !settingsSaving && setSettingsOpen(false)}><div className="space-y-6 p-5"><div><div className="text-sm font-bold text-slate-900">문의 가능 대상</div><div className="mt-3 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="radio" name="inquiryAudience" checked={!settingsDraft.allowGuest} onChange={() => setSettingsDraft((c) => ({ ...c, allowGuest: false }))} /> 회원만 문의 가능</label><label className="flex items-center gap-2"><input type="radio" name="inquiryAudience" checked={settingsDraft.allowGuest} onChange={() => setSettingsDraft((c) => ({ ...c, allowGuest: true }))} /> 회원 + 비회원 문의 가능</label></div></div><Field label="페이지당 목록 표시 수"><Select value={settingsDraft.postsPerPage} onChange={(value) => setSettingsDraft((c) => ({ ...c, postsPerPage: Number(value) }))}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}개</option>)}</Select></Field><div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-bold text-slate-900">비회원 문의 적용 약관</div><p className="mt-1 text-xs text-slate-500">회원가입 약관과 문의 전용 약관을 복수 선택할 수 있습니다.</p></div><Button type="button" variant="outline" onClick={() => openTermEditor()}><Plus size={14} /> 문의 전용 약관 등록</Button></div>{signupTerms.length ? <div className="rounded-xl border border-slate-200 p-4"><div className="mb-3 text-xs font-bold text-slate-700">기존 회원가입 약관</div><div className="space-y-2">{signupTerms.map((term) => <label key={`signup:${term.id}`} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={isTermBound('signup', term.id)} onChange={(e) => toggleTermBinding('signup', term.id, e.target.checked)} /><span><strong>{term.required ? '[필수]' : '[선택]'} {term.title}</strong> <span className="text-slate-400">revision {term.revision}</span></span></label>)}</div></div> : null}<div className="rounded-xl border border-slate-200 p-4"><div className="mb-3 text-xs font-bold text-slate-700">문의 전용 약관</div>{inquiryTerms.length ? <div className="space-y-3">{inquiryTerms.map((term) => <div key={`inquiry:${term.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 p-3"><label className="flex min-w-0 flex-1 items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={term.enabled === false} checked={isTermBound('inquiry', term.id)} onChange={(e) => toggleTermBinding('inquiry', term.id, e.target.checked)} /><span><strong>{term.required ? '[필수]' : '[선택]'} {term.title}</strong> <span className="text-slate-400">revision {term.revision}{term.enabled === false ? ' · 사용 안 함' : ''}</span></span></label><div className="flex gap-1.5"><Button type="button" variant="outline" onClick={() => openTermEditor(term)}>수정</Button><Button type="button" variant="dangerOutline" onClick={() => confirmDeleteTerm(term)}>삭제</Button></div></div>)}</div> : <div className="text-xs text-slate-400">등록된 문의 전용 약관이 없습니다.</div>}</div></div></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><Button type="button" variant="outline" disabled={settingsSaving} onClick={() => setSettingsOpen(false)}>취소</Button><Button type="button" variant="primary" disabled={settingsSaving} onClick={saveSettings}>{settingsSaving ? '저장 중' : '설정 저장'}</Button></div></ModalShell> : null}

      {termOpen ? <ModalShell title={termForm.id ? '문의 전용 약관 수정' : '문의 전용 약관 등록'} description="비회원 문의에 별도로 적용할 약관을 관리합니다. 내용이 변경되면 revision이 증가합니다." maxWidth="max-w-4xl" onClose={() => !termSaving && setTermOpen(false)}><div className="space-y-4 p-5"><Field label="약관 제목"><Input value={termForm.title} onChange={(title) => setTermForm((c) => ({ ...c, title }))} /></Field><div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={termForm.required} onChange={(e) => setTermForm((c) => ({ ...c, required: e.target.checked }))} /> 필수 약관</label><label className="flex items-center gap-2"><input type="checkbox" checked={termForm.enabled} onChange={(e) => setTermForm((c) => ({ ...c, enabled: e.target.checked }))} /> 사용</label></div><RichTextEditor label="약관 본문" value={termForm.bodyHtml} onChange={(bodyHtml) => setTermForm((c) => ({ ...c, bodyHtml }))} minHeight={320} disabled={termSaving} allowVideos={false} /></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><Button type="button" variant="outline" disabled={termSaving} onClick={() => setTermOpen(false)}>취소</Button><Button type="button" variant="primary" disabled={termSaving} onClick={saveTerm}>{termSaving ? '저장 중' : '약관 저장'}</Button></div></ModalShell> : null}
    </div>
  );
}
