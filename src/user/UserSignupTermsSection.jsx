import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { Check, ChevronRight, FileText } from 'lucide-react';

import TermsContentDialog from '../components/TermsContentDialog.jsx';
import { SIGNUP_TERMS_POLICY_DOC_REF } from '../firebase.js';
import {
  TERMS_DECISION,
  createEmptyTermsSubmission,
  normalizeTermsPolicy,
} from '../features/terms/termsConstants.js';

const buildSubmission = (policy, viewedById, acceptedById) => {
  const activeTerms = policy.activeTerms || [];
  const decisions = activeTerms.map((term) => ({
    termId: term.id,
    termVersion: term.version,
    termVersionId: term.versionId || '',
    title: term.title,
    required: term.required,
    contentHash: term.contentHash,
    decision: acceptedById[term.id]
      ? TERMS_DECISION.ACCEPTED
      : TERMS_DECISION.DECLINED,
    viewedAtMs: viewedById[term.id] || 0,
  }));

  const valid =
    policy.enabled &&
    activeTerms.length > 0 &&
    activeTerms.every(
      (term) => !term.required || (acceptedById[term.id] && viewedById[term.id])
    );

  return {
    ready: true,
    enabled: policy.enabled,
    valid,
    policyRevision: policy.revision,
    requiredRevision: policy.requiredRevision,
    decisions,
  };
};

export default function UserSignupTermsSection({ onChange }) {
  const [policy, setPolicy] = useState(() => normalizeTermsPolicy({}));
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [viewedById, setViewedById] = useState({});
  const [acceptedById, setAcceptedById] = useState({});
  const [dialogTermIds, setDialogTermIds] = useState([]);
  const [dialogMode, setDialogMode] = useState('single');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      SIGNUP_TERMS_POLICY_DOC_REF,
      (snapshot) => {
        const nextPolicy = normalizeTermsPolicy(
          snapshot.exists() ? snapshot.data() : {}
        );
        setPolicy(nextPolicy);
        setViewedById({});
        setAcceptedById({});
        setReady(true);
        setErrorMessage(
          nextPolicy.enabled && nextPolicy.activeTerms.length === 0
            ? '회원가입 약관이 활성화되어 있지만 등록된 사용 약관이 없습니다. 관리자에게 문의해 주세요.'
            : ''
        );
      },
      (error) => {
        console.error('Signup terms policy read error:', error);
        setReady(true);
        setErrorMessage('회원가입 약관을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    );

    return unsubscribe;
  }, []);

  const submission = useMemo(() => {
    if (!ready || errorMessage) return createEmptyTermsSubmission();
    if (!policy.enabled) {
      return {
        ...createEmptyTermsSubmission(),
        ready: true,
        enabled: false,
        valid: true,
      };
    }
    return buildSubmission(policy, viewedById, acceptedById);
  }, [acceptedById, errorMessage, policy, ready, viewedById]);

  useEffect(() => {
    onChange?.(submission);
  }, [onChange, submission]);

  const allAccepted =
    policy.activeTerms.length > 0 &&
    policy.activeTerms.every((term) => acceptedById[term.id]);

  const openSingle = (termId) => {
    setDialogMode('single');
    setDialogTermIds([termId]);
  };

  const openAll = () => {
    setDialogMode('all');
    setDialogTermIds(policy.activeTerms.map((term) => term.id));
  };

  const dialogTerms = policy.activeTerms.filter((term) =>
    dialogTermIds.includes(term.id)
  );

  const confirmDialog = () => {
    const viewedAtMs = Date.now();
    setViewedById((current) => ({
      ...current,
      ...Object.fromEntries(dialogTermIds.map((termId) => [termId, viewedAtMs])),
    }));

    if (dialogMode === 'all') {
      setAcceptedById((current) => ({
        ...current,
        ...Object.fromEntries(dialogTermIds.map((termId) => [termId, true])),
      }));
    }

    setDialogTermIds([]);
  };

  if (!ready) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-xs text-slate-400">
        회원가입 약관을 불러오는 중입니다.
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-700">
        {errorMessage}
      </div>
    );
  }

  if (!policy.enabled) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
        현재 회원가입 약관 동의 기능이 적용되지 않았습니다. 다음 단계에서 회원정보를 입력해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => {
            if (allAccepted) {
              setAcceptedById({});
            } else {
              openAll();
            }
          }}
          className="flex w-full items-center gap-3 px-5 py-4 text-left"
        >
          <span className={`flex h-5 w-5 items-center justify-center border ${allAccepted ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-white'}`}>
            {allAccepted ? <Check size={14} /> : null}
          </span>
          <span className="flex-1 text-sm font-black text-slate-900">전체 약관 동의</span>
          <ChevronRight size={16} className="text-slate-400" />
        </button>

        <div className="mx-5 border-t border-slate-200" />

        <div className="divide-y divide-slate-100 px-5 py-2">
          {policy.activeTerms.map((term) => {
            const viewed = Boolean(viewedById[term.id]);
            const accepted = Boolean(acceptedById[term.id]);

            return (
              <div key={term.id} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  disabled={!viewed}
                  onClick={() =>
                    setAcceptedById((current) => ({
                      ...current,
                      [term.id]: !current[term.id],
                    }))
                  }
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border ${accepted ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-white'} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300`}
                  aria-label={`${term.title} 동의`}
                  title={viewed ? '동의 여부 변경' : '약관 내용을 먼저 확인해 주세요'}
                >
                  {accepted ? <Check size={14} /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800">
                    [{term.required ? '필수' : '선택'}] {term.title}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {viewed ? `내용 확인 완료 · 버전 ${term.version}` : '보기를 눌러 내용을 먼저 확인해 주세요.'}
                  </div>
                </div>

                <button type="button" onClick={() => openSingle(term.id)} className="shrink-0 text-xs font-bold text-slate-800 underline underline-offset-2 hover:text-orange-600">
                  보기
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">
        <FileText size={15} className="mt-0.5 shrink-0 text-slate-400" />
        필수 약관은 모두 확인하고 동의해야 다음 단계로 이동할 수 있습니다. 선택 약관은 동의하지 않아도 가입할 수 있습니다.
      </div>

      <TermsContentDialog
        open={dialogTermIds.length > 0}
        title={dialogMode === 'all' ? '전체 약관 확인' : dialogTerms[0]?.title || '약관 확인'}
        terms={dialogTerms}
        onClose={() => setDialogTermIds([])}
        onConfirm={confirmDialog}
        confirmLabel={dialogMode === 'all' ? '전체 약관을 확인하고 모두 동의' : '내용을 확인했습니다'}
      />
    </div>
  );
}
