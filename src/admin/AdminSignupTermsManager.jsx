import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Edit3,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';

import RichTextContent from '../components/RichTextContent.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import {
  MAX_ACTIVE_SIGNUP_TERMS,
  normalizeTermsPolicy,
} from '../features/terms/termsConstants.js';
import { createTermsContentHash } from '../features/terms/termsService.js';
import {
  POLICY_CONTENT_DOMAINS,
  patchPolicyContentDomainInPostgresql,
  readPolicyContentCutoverConfig,
  requestPolicyContentDomain,
} from '../features/content/policyContentCutover.js';
import {
  createSiteContentDocumentId,
  subscribeSiteContentInvalidation,
} from '../features/content/siteContentCutover.js';
import {
  isRichTextEmpty,
  richTextHtmlToText,
  sanitizeRichTextHtml,
} from '../utils/richTextCore.js';

const createEmptyForm = () => ({
  id: '',
  title: '',
  required: true,
  enabled: true,
  contentHtml: '',
  changeNote: '',
  requireReconsent: true,
});

const normalizeTermDocument = (snapshot) => ({
  id: snapshot.id,
  ...snapshot.data(),
  required: Boolean(snapshot.data()?.required),
  enabled: snapshot.data()?.enabled !== false,
  archived: Boolean(snapshot.data()?.archived),
  currentVersion: Math.max(1, Number(snapshot.data()?.currentVersion) || 1),
  displayOrder: Number.isFinite(Number(snapshot.data()?.displayOrder))
    ? Number(snapshot.data().displayOrder)
    : 0,
});

const normalizeTermPayload = (payload = {}, id = '') => ({
  ...payload,
  id: String(payload.id || id),
  required: Boolean(payload.required),
  enabled: payload.enabled !== false,
  archived: Boolean(payload.archived),
  currentVersion: Math.max(1, Number(payload.currentVersion) || 1),
  displayOrder: Number.isFinite(Number(payload.displayOrder)) ? Number(payload.displayOrder) : 0,
});

const toActiveTermSnapshot = (term) => ({
  id: term.id,
  title: term.title,
  contentHtml: term.contentHtml,
  contentText: term.contentText || richTextHtmlToText(term.contentHtml || ''),
  contentHash: term.contentHash,
  required: Boolean(term.required),
  version: Math.max(1, Number(term.currentVersion || term.version) || 1),
  versionId: String(term.currentVersionId || term.versionId || ''),
  displayOrder: Number(term.displayOrder) || 0,
});

const formatDateParts = (value) => {
  const date = value?.toDate?.() || (value instanceof Date ? value : null);
  if (!date) return { date: '-', time: '' };
  return {
    date: date.toLocaleDateString('ko-KR'),
    time: date.toLocaleTimeString('ko-KR'),
  };
};

export default function AdminSignupTermsManager({ Button, triggerConfirm, triggerToast }) {
  const [terms, setTerms] = useState([]);
  const [termVersions, setTermVersions] = useState([]);
  const [termsPolicy, setTermsPolicy] = useState(() => normalizeTermsPolicy({}));
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewTerm, setPreviewTerm] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const formBaselineRef = useRef('');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');

  useEffect(() => {
    const config = readPolicyContentCutoverConfig();
    let cancelled = false;
    const load = async () => {
      try {
        const content = await requestPolicyContentDomain({
          domain: POLICY_CONTENT_DOMAINS.TERMS,
          config,
          useCache: false,
        });
        if (cancelled) return;
        const policyDocument = content.documents.find((item) => item.key === 'signupTermsPolicy/current');
        const nextTerms = content.documents
          .filter((item) => item.key.startsWith('signupTerms/'))
          .map((item) => normalizeTermPayload(item.payload, item.key.split('/').pop()))
          .sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title, 'ko'));
        const nextVersions = content.documents
          .filter((item) => item.key.startsWith('signupTermVersions/'))
          .map((item) => ({ key: item.key, payload: item.payload, enabled: item.enabled, sortOrder: item.sortOrder }));
        setTerms(nextTerms);
        setTermVersions(nextVersions);
        setTermsPolicy(normalizeTermsPolicy(policyDocument?.payload || {}));
        setReady(true);
        setErrorMessage('');
      } catch (error) {
        if (cancelled) return;
        console.error('Signup terms PostgreSQL admin list error:', error);
        setReady(true);
        setErrorMessage('이용약관 목록을 PostgreSQL에서 불러오지 못했습니다.');
      }
    };
    void load();
    const unsubscribe = subscribeSiteContentInvalidation((detail) => {
      if (detail?.domain === POLICY_CONTENT_DOMAINS.TERMS || detail?.domain === 'all') void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const createTermsDomainDocuments = ({ sourceTerms, sourcePolicy, sourceVersions }) => {
    const normalizedPolicy = normalizeTermsPolicy(sourcePolicy);
    return [
      { key: 'signupTermsPolicy/current', payload: normalizedPolicy, enabled: normalizedPolicy.enabled },
      ...sourceTerms.map((term) => ({
        key: `signupTerms/${term.id}`,
        payload: term,
        enabled: term.enabled !== false && !term.archived,
        sortOrder: term.displayOrder,
      })),
      ...sourceVersions,
    ];
  };

  const getDocumentFingerprint = (document) => JSON.stringify({
    key: document.key,
    payload: document.payload || {},
    enabled: typeof document.enabled === 'boolean' ? document.enabled : null,
    sortOrder: Number.isFinite(Number(document.sortOrder)) ? Number(document.sortOrder) : null,
  });

  const patchTermsDomain = async ({ nextTerms, nextPolicy, nextVersions = termVersions }) => {
    const normalizedPolicy = normalizeTermsPolicy(nextPolicy);
    const currentDocuments = createTermsDomainDocuments({
      sourceTerms: terms,
      sourcePolicy: termsPolicy,
      sourceVersions: termVersions,
    });
    const nextDocuments = createTermsDomainDocuments({
      sourceTerms: nextTerms,
      sourcePolicy: normalizedPolicy,
      sourceVersions: nextVersions,
    });
    const currentByKey = new Map(currentDocuments.map((document) => [document.key, document]));
    const nextByKey = new Map(nextDocuments.map((document) => [document.key, document]));
    const upserts = nextDocuments.filter((document) =>
      getDocumentFingerprint(currentByKey.get(document.key) || {}) !== getDocumentFingerprint(document)
    );
    const deletes = currentDocuments
      .map((document) => document.key)
      .filter((key) => !nextByKey.has(key));

    if (upserts.length > 0 || deletes.length > 0) {
      await patchPolicyContentDomainInPostgresql({
        domain: POLICY_CONTENT_DOMAINS.TERMS,
        config: readPolicyContentCutoverConfig(),
        upserts,
        deletes,
      });
    }
    setTerms(nextTerms.slice().sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title, 'ko')));
    setTermVersions(nextVersions);
    setTermsPolicy(normalizedPolicy);
  };

  const createNextPolicy = ({ nextTerms, revisionIncrement = 1, requireReconsent = false }) => {
    const revision = termsPolicy.revision + revisionIncrement;
    return normalizeTermsPolicy({
      ...termsPolicy,
      revision,
      requiredRevision: requireReconsent && termsPolicy.enabled
        ? revision
        : termsPolicy.requiredRevision,
      activeTerms: nextTerms
        .filter((term) => term.enabled && !term.archived)
        .map(toActiveTermSnapshot),
    });
  };

  const filteredTerms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return terms;
    return terms.filter((term) =>
      [term.title, term.contentText, term.changeNote]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    );
  }, [query, terms]);

  const openCreate = () => {
    const nextForm = { ...createEmptyForm(), displayOrder: terms.length };
    setForm(nextForm);
    formBaselineRef.current = JSON.stringify(nextForm);
    setDialogOpen(true);
  };

  const openEdit = (term) => {
    const nextForm = {
      id: term.id,
      title: term.title || '',
      required: Boolean(term.required),
      enabled: term.enabled !== false,
      contentHtml: term.contentHtml || '',
      changeNote: '',
      requireReconsent: true,
      displayOrder: term.displayOrder,
    };
    setForm(nextForm);
    formBaselineRef.current = JSON.stringify(nextForm);
    setDialogOpen(true);
  };

  const resetTermDialog = () => {
    setDialogOpen(false);
    setForm(createEmptyForm());
    formBaselineRef.current = '';
  };

  const closeTermDialog = () => {
    if (saving || !dialogOpen) return;

    if (JSON.stringify(form) === formBaselineRef.current) {
      resetTermDialog();
      return;
    }

    triggerConfirm(
      '저장되지 않은 이용약관',
      '저장되지 않은 이용약관 변경사항이 있습니다. 저장하지 않고 닫으시겠습니까?',
      async () => {
        resetTermDialog();
      }
    );
  };

  const saveTerm = async () => {
    const title = form.title.trim();
    const contentHtml = sanitizeRichTextHtml(form.contentHtml || '');
    if (!title) {
      triggerToast('약관 제목을 입력해 주세요.', 'error');
      return;
    }
    if (isRichTextEmpty(contentHtml)) {
      triggerToast('약관 내용을 입력해 주세요.', 'error');
      return;
    }

    const activeTermCount = terms.filter(
      (term) => term.enabled && !term.archived && term.id !== form.id
    ).length;
    if (form.enabled && activeTermCount >= MAX_ACTIVE_SIGNUP_TERMS) {
      triggerToast(`사용 중인 회원가입 약관은 최대 ${MAX_ACTIVE_SIGNUP_TERMS}개까지 등록할 수 있습니다.`, 'error');
      return;
    }

    setSaving(true);
    try {
      const contentText = richTextHtmlToText(contentHtml);
      const contentHash = await createTermsContentHash(
        `${title}\n${form.required ? 'required' : 'optional'}\n${contentHtml}`
      );
        const id = form.id || createSiteContentDocumentId();
        const previous = terms.find((term) => term.id === id) || null;
        const semanticChanged = !previous || previous.title !== title ||
          Boolean(previous.required) !== Boolean(form.required) || previous.contentHash !== contentHash;
        const wasActive = Boolean(previous?.enabled) && !previous?.archived;
        const willBeActive = Boolean(form.enabled);
        const activePolicyChanged = (wasActive || willBeActive) && (semanticChanged || wasActive !== willBeActive);
        const now = new Date();
        const nextTerm = normalizeTermPayload({
          ...previous,
          id,
          title,
          required: Boolean(form.required),
          enabled: willBeActive,
          archived: false,
          displayOrder: Number.isFinite(Number(form.displayOrder)) ? Number(form.displayOrder) : terms.length,
          currentVersion: semanticChanged ? Math.max(0, Number(previous?.currentVersion) || 0) + 1 : previous?.currentVersion,
          currentVersionId: semanticChanged ? createSiteContentDocumentId() : previous?.currentVersionId || '',
          contentHtml,
          contentText,
          contentHash,
          changeNote: form.changeNote.trim(),
          createdAt: previous?.createdAt || now,
          createdBy: previous?.createdBy || 'clerk-admin',
          updatedAt: now,
          updatedBy: 'clerk-admin',
        }, id);
        const nextTerms = [...terms.filter((term) => term.id !== id), nextTerm];
        const nextPolicy = createNextPolicy({
          nextTerms,
          revisionIncrement: activePolicyChanged ? 1 : 0,
          requireReconsent: Boolean(form.requireReconsent) && activePolicyChanged,
        });
        const nextVersions = semanticChanged && nextTerm.currentVersionId
          ? [
              ...termVersions.filter((item) => item.key !== `signupTermVersions/${nextTerm.currentVersionId}`),
              {
                key: `signupTermVersions/${nextTerm.currentVersionId}`,
                payload: {
                  id: nextTerm.currentVersionId,
                  termId: nextTerm.id,
                  title: nextTerm.title,
                  required: nextTerm.required,
                  version: nextTerm.currentVersion,
                  contentHtml: nextTerm.contentHtml,
                  contentText: nextTerm.contentText,
                  contentHash: nextTerm.contentHash,
                  changeNote: nextTerm.changeNote || '',
                  createdAt: now,
                  createdBy: 'clerk-admin',
                },
                enabled: true,
                sortOrder: nextTerm.currentVersion,
              },
            ]
          : termVersions;
        await patchTermsDomain({ nextTerms, nextPolicy, nextVersions });
        resetTermDialog();
        triggerToast(form.id ? '이용약관의 새 버전을 저장했습니다.' : '이용약관을 등록했습니다.', 'success');
        return;    } catch (error) {
      console.error('Signup term save error:', error);
      triggerToast('이용약관 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setTermEnabled = async (term, enabled) => {
    if (
      enabled &&
      terms.filter((item) => item.enabled && !item.archived && item.id !== term.id).length >= MAX_ACTIVE_SIGNUP_TERMS
    ) {
      triggerToast(`사용 중인 회원가입 약관은 최대 ${MAX_ACTIVE_SIGNUP_TERMS}개까지 설정할 수 있습니다.`, 'error');
      return;
    }

    setActionId(term.id);
    try {
        const now = new Date();
        const nextTerms = terms.map((item) => item.id === term.id
          ? normalizeTermPayload({ ...item, enabled, archived: false, updatedAt: now, updatedBy: 'clerk-admin' }, item.id)
          : item);
        await patchTermsDomain({
          nextTerms,
          nextPolicy: createNextPolicy({
            nextTerms,
            requireReconsent: enabled && termsPolicy.requireReconsentOnChange,
          }),
        });
        triggerToast(enabled ? '약관을 사용으로 전환했습니다.' : '약관을 사용하지 않도록 변경했습니다.', 'success');
        return;    } catch (error) {
      console.error('Signup term enabled update error:', error);
      triggerToast('약관 사용 상태 변경에 실패했습니다.', 'error');
    } finally {
      setActionId('');
    }
  };

  const executeArchiveTerm = async (term) => {
    setActionId(term.id);
    try {
        const now = new Date();
        const nextTerms = terms.map((item) => item.id === term.id
          ? normalizeTermPayload({ ...item, enabled: false, archived: true, updatedAt: now, updatedBy: 'clerk-admin' }, item.id)
          : item);
        await patchTermsDomain({ nextTerms, nextPolicy: createNextPolicy({ nextTerms }) });
        triggerToast('약관을 보관했습니다.', 'success');
        return;    } catch (error) {
      console.error('Signup term archive error:', error);
      triggerToast('약관 보관에 실패했습니다.', 'error');
    } finally {
      setActionId('');
    }
  };

  const archiveTerm = (term) => {
    triggerConfirm(
      '이용약관 보관',
      '약관을 보관하면 신규 가입과 재동의 화면에서 제외되지만 기존 동의 이력과 버전은 유지됩니다.',
      () => {
        void executeArchiveTerm(term);
      }
    );
  };

  const moveTerm = async (termId, direction) => {
    const currentIndex = terms.findIndex((term) => term.id === termId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= terms.length) return;

    const current = terms[currentIndex];
    const target = terms[targetIndex];
    setActionId(termId);
    try {
        const nextTerms = terms.map((item) => item.id === current.id
          ? { ...item, displayOrder: target.displayOrder, updatedAt: new Date() }
          : item.id === target.id
            ? { ...item, displayOrder: current.displayOrder, updatedAt: new Date() }
            : item);
        await patchTermsDomain({
          nextTerms,
          nextPolicy: createNextPolicy({ nextTerms, revisionIncrement: 0 }),
        });
        return;    } catch (error) {
      console.error('Signup term order update error:', error);
      triggerToast('약관 순서 변경에 실패했습니다.', 'error');
    } finally {
      setActionId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">약관 검색</span>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 본문 검색" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none mk-form-border-focus" />
          </div>
        </label>
        <Button type="button" variant="primary" onClick={openCreate}>
          <Plus size={14} /> 약관 등록
        </Button>
      </div>

      {!ready ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">약관을 불러오는 중입니다.</div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs text-rose-700">{errorMessage}</div>
      ) : filteredTerms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">등록된 약관이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-[860px] w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[88px]" />
              <col className="w-[72px]" />
              <col className="w-[74px]" />
              <col className="w-[340px]" />
              <col className="w-[64px]" />
              <col className="w-[126px]" />
              <col className="w-[96px]" />
            </colgroup>
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3 text-center">순서</th>
                <th className="border-b border-slate-200 px-3 py-3 text-center">사용</th>
                <th className="border-b border-slate-200 px-3 py-3 text-center">구분</th>
                <th className="border-b border-slate-200 px-3 py-3">약관명</th>
                <th className="border-b border-slate-200 px-3 py-3 text-center">버전</th>
                <th className="border-b border-slate-200 px-3 py-3 text-center">최종 수정일</th>
                <th className="border-b border-slate-200 px-3 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredTerms.map((term) => {
                const globalIndex = terms.findIndex((item) => item.id === term.id);
                const updatedAt = formatDateParts(term.updatedAt);
                return (
                  <tr key={term.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-1">
                        <button type="button" disabled={globalIndex <= 0 || actionId === term.id} onClick={() => moveTerm(term.id, -1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-30"><ArrowUp size={14} /></button>
                        <button type="button" disabled={globalIndex >= terms.length - 1 || actionId === term.id} onClick={() => moveTerm(term.id, 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-30"><ArrowDown size={14} /></button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button type="button" role="switch" aria-checked={term.enabled && !term.archived} disabled={term.archived || actionId === term.id} onClick={() => setTermEnabled(term, !term.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full ${term.enabled && !term.archived ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}>
                        <span className={`h-4 w-4 rounded-full bg-white shadow transition ${term.enabled && !term.archived ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${term.required ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{term.required ? '필수' : '선택'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setPreviewTerm(term)}
                        className="block w-full min-w-0 text-left"
                        title={`${term.title} 보기`}
                      >
                        <span className="block truncate text-sm font-bold text-slate-800 underline-offset-2 hover:text-orange-600 hover:underline">{term.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">{term.archived ? '보관됨 · ' : ''}{term.contentText || '본문 없음'}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-600">v{term.currentVersion}</td>
                    <td className="px-3 py-3 text-center text-[11px] leading-5 text-slate-500">
                      <div className="whitespace-nowrap">{updatedAt.date}</div>
                      <div className="whitespace-nowrap">{updatedAt.time}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-1">
                        {term.archived ? (
                          <button type="button" onClick={() => setTermEnabled(term, true)} disabled={actionId === term.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 disabled:opacity-40" title="보관 해제"><RotateCcw size={14} /></button>
                        ) : (
                          <>
                            <button type="button" onClick={() => openEdit(term)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200" title="수정"><Edit3 size={14} /></button>
                            <button type="button" onClick={() => archiveTerm(term)} disabled={actionId === term.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 disabled:opacity-40" title="보관"><Archive size={14} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen ? (
        <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <h3 className="text-lg font-black text-slate-900">{form.id ? '이용약관 수정' : '이용약관 등록'}</h3>
              <p className="mt-1 text-xs text-slate-500">제목, 본문 또는 필수·선택 구분을 변경하면 기존 버전을 보존하고 새 버전을 생성합니다.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">약관 제목</span>
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none mk-form-border-focus" placeholder="예: 개인정보 수집 및 이용 동의" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">필수 여부</span>
                <select value={form.required ? 'required' : 'optional'} onChange={(event) => setForm((current) => ({ ...current, required: event.target.value === 'required' }))} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none mk-form-border-focus">
                  <option value="required">필수</option>
                  <option value="optional">선택</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">사용 상태</span>
                <select value={form.enabled ? 'enabled' : 'disabled'} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.value === 'enabled' }))} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none mk-form-border-focus">
                  <option value="enabled">사용</option>
                  <option value="disabled">사용 안 함</option>
                </select>
              </label>
            </div>

            <div className="mt-4">
              <RichTextEditor label="약관 본문" value={form.contentHtml} onChange={(contentHtml) => setForm((current) => ({ ...current, contentHtml }))} placeholder="회원에게 표시할 약관 내용을 입력해 주세요." minHeight={320} disabled={saving} allowVideos={false} />
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">변경 사유 또는 버전 메모</span>
              <input value={form.changeNote} onChange={(event) => setForm((current) => ({ ...current, changeNote: event.target.value }))} maxLength={300} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none mk-form-border-focus" placeholder="예: 보유기간 문구 수정" />
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input type="checkbox" checked={form.requireReconsent} onChange={(event) => setForm((current) => ({ ...current, requireReconsent: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-orange-500" />
              <span>
                <span className="block text-xs font-bold text-slate-800">현재 정책이 허용하는 경우 기존 회원에게 재동의 요구</span>
                <span className="mt-1 block text-[11px] leading-5 text-slate-500">오탈자처럼 서비스 이용을 막을 필요가 없는 변경은 해제할 수 있습니다.</span>
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" disabled={saving} onClick={closeTermDialog}>취소</Button>
              <Button type="button" variant="primary" disabled={saving} onClick={saveTerm}>{saving ? '저장 중...' : '저장'}</Button>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {previewTerm ? (
        <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-bold text-orange-600">{previewTerm.required ? '필수' : '선택'} · 버전 {previewTerm.currentVersion}</div>
                <h3 className="mt-1 text-lg font-black text-slate-900">{previewTerm.title}</h3>
              </div>
              <Button type="button" variant="outline" onClick={() => setPreviewTerm(null)}>닫기</Button>
            </div>
            <RichTextContent html={previewTerm.contentHtml} text={previewTerm.contentText} className="mt-5 text-sm leading-7 text-slate-700" />
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
