import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, History } from 'lucide-react';

import TermsContentDialog from '../components/TermsContentDialog.jsx';
import TermsVersionDialog from '../components/TermsVersionDialog.jsx';
import {
  TERMS_CONSENT_SOURCE,
  TERMS_DECISION,
  isTermsConsentRequiredForAccount,
  normalizeTermsPolicy,
} from '../features/terms/termsConstants.js';
import {
  formatTermsTimestamp,
  loadSignupTermContents,
  preloadSignupTermContent,
} from '../features/terms/termsService.js';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
import {
  publishAccountLifecycleAuthorityObservation,
  readAccountLifecycleAuthorityFromPayload,
} from '../features/auth/accountLifecycleAuthority.js';

const createDecisionState = (policy, states) => Object.fromEntries(
  policy.activeTerms.map((term) => {
    const state = states[term.id];
    const currentVersion = Number(state?.termVersion || 0) === Number(term.version || 0) &&
      String(state?.termVersionId || '') === String(term.versionId || '') &&
      String(state?.contentHash || '') === String(term.contentHash || '');
    return [term.id, {
      decision: currentVersion ? state?.decision || '' : '',
      viewedAtMs: currentVersion ? Number(state?.viewedAtMs || 0) : 0,
      currentVersion,
      originalDecision: currentVersion ? state?.decision || '' : '',
    }];
  })
);

export default function UserTermsConsentPanel({
  account,
  Button,
  triggerToast,
  mode = 'mypage',
  onCompleted,
}) {
  const uid = account?.uid || account?.firebaseUid || account?.legacyMemberKey || '';
  const [policy, setPolicy] = useState(() => normalizeTermsPolicy({}));
  const [states, setStates] = useState({});
  const [decisions, setDecisions] = useState({});
  const [logs, setLogs] = useState([]);
  const [termsConsentRevision, setTermsConsentRevision] = useState(() => Math.max(0, Number(account?.termsConsentRevision) || 0));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [dialogTermIds, setDialogTermIds] = useState([]);
  const [dialogTerms, setDialogTerms] = useState([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogErrorMessage, setDialogErrorMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyLog, setHistoryLog] = useState(null);
  const dialogRequestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    if (!uid) return;
    setReady(false);
    try {
      const payload = await clerkStagingClient.getUserTermsConsent();
      if (payload?.termsConsent?.bootstrapRequired) {
        const error = new Error('PostgreSQL terms consent bootstrap is incomplete.');
        error.code = 'terms_consent_postgresql_bootstrap_required';
        throw error;
      }
      const nextPolicy = normalizeTermsPolicy(payload?.termsConsent?.policy || {});
      const nextStates = payload?.termsConsent?.states || {};
      const nextLogs = Array.isArray(payload?.termsConsent?.logs) ? payload.termsConsent.logs : [];
      setTermsConsentRevision(Math.max(0, Number(payload?.termsConsent?.termsConsentRevision) || 0));
      publishAccountLifecycleAuthorityObservation({
        ...readAccountLifecycleAuthorityFromPayload(payload, { requested: true }),
        termsConsentMirror: 'retired',
        termsConsentBootstrap: payload?.termsConsent?.legacyBootstrap || 'not-required',
        error: null,
      });
      setPolicy(nextPolicy);
      setStates(nextStates);
      setDecisions(createDecisionState(nextPolicy, nextStates));
      setLogs(nextLogs);
      setErrorMessage('');
    } catch (error) {
      console.error('User terms consent load error:', error);
      setErrorMessage('약관 동의 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setReady(true);
    }
  }, [account?.termsConsentRevision, uid]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const consentRequired = isTermsConsentRequiredForAccount({
    policy,
    account: { ...(account || {}), termsConsentRevision },
  });
  const dialogMetadataTerms = policy.activeTerms.filter((term) => dialogTermIds.includes(term.id));

  const closeDialog = () => {
    dialogRequestIdRef.current += 1;
    setDialogTermIds([]);
    setDialogTerms([]);
    setDialogLoading(false);
    setDialogErrorMessage('');
  };

  const openTermDialog = async (term) => {
    const requestId = dialogRequestIdRef.current + 1;
    dialogRequestIdRef.current = requestId;
    setDialogTermIds([term.id]);
    setDialogTerms([]);
    setDialogLoading(true);
    setDialogErrorMessage('');
    try {
      const loadedTerms = await loadSignupTermContents([term]);
      if (dialogRequestIdRef.current !== requestId) return;
      setDialogTerms(loadedTerms);
    } catch (error) {
      if (dialogRequestIdRef.current !== requestId) return;
      console.error('Reconsent term content read error:', error);
      setDialogErrorMessage(
        `약관 내용을 불러오지 못했습니다. 오류 코드: ${error?.code || error?.name || 'signup_term_content_read_failed'}`
      );
    } finally {
      if (dialogRequestIdRef.current === requestId) setDialogLoading(false);
    }
  };

  const confirmViewed = () => {
    const viewedAtMs = Date.now();
    setDecisions((current) => {
      const next = { ...current };
      dialogTermIds.forEach((termId) => {
        next[termId] = {
          ...(next[termId] || {}),
          viewedAtMs,
        };
      });
      return next;
    });
    closeDialog();
  };

  const valid = useMemo(() => policy.activeTerms.every((term) => {
    const decisionState = decisions[term.id] || {};
    if (term.required) {
      return decisionState.decision === TERMS_DECISION.ACCEPTED && decisionState.viewedAtMs > 0;
    }
    const decisionChanged = decisionState.decision !== decisionState.originalDecision;
    if (!decisionState.currentVersion || decisionChanged) {
      return [TERMS_DECISION.ACCEPTED, TERMS_DECISION.DECLINED].includes(decisionState.decision) && decisionState.viewedAtMs > 0;
    }
    return true;
  }), [decisions, policy.activeTerms]);

  const dirty = useMemo(() => policy.activeTerms.some((term) => {
    const value = decisions[term.id] || {};
    return value.decision !== value.originalDecision || !value.currentVersion;
  }), [decisions, policy.activeTerms]);

  const saveConsents = async () => {
    if (!uid || !valid) {
      triggerToast('변경된 약관을 모두 확인하고 동의 여부를 선택해 주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const submittedDecisions = policy.activeTerms.map((term) => ({
        termId: term.id,
        termVersion: term.version,
        termVersionId: term.versionId || '',
        contentHash: term.contentHash || '',
        decision: decisions[term.id]?.decision || '',
        viewedAtMs: Number(decisions[term.id]?.viewedAtMs || 0),
      }));
      const payload = await clerkStagingClient.saveUserTermsConsent({
        policyRevision: policy.revision,
        decisions: submittedDecisions,
        source: consentRequired ? TERMS_CONSENT_SOURCE.RECONSENT : TERMS_CONSENT_SOURCE.MY_PAGE,
      });
      publishAccountLifecycleAuthorityObservation({
        ...readAccountLifecycleAuthorityFromPayload(payload, { requested: true }),
        termsConsentMirror: 'retired',
        error: null,
      });

      triggerToast('약관 동의 정보가 저장되었습니다.', 'success');
      await loadData();
      onCompleted?.();
    } catch (error) {
      publishAccountLifecycleAuthorityObservation({
        requested: true,
        error: error?.code || error?.message || 'terms-consent-save-failed',
      });
      console.error('User terms consent save error:', error);
      triggerToast(
        error?.code === 'terms/policy-changed'
          ? '약관이 변경되었습니다. 최신 내용을 다시 확인해 주세요. 오류 코드: terms/policy-changed'
          : `약관 동의 정보 저장에 실패했습니다. 오류 코드: ${error?.code || error?.name || 'terms_consent_save_failed'}`,
        'error'
      );
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">약관 동의 정보를 불러오는 중입니다.</div>;
  }

  if (errorMessage) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs text-rose-700">{errorMessage}</div>;
  }

  if (!policy.enabled) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-600">현재 적용 중인 회원 약관 정책이 없습니다.</div>;
  }

  return (
    <div className="space-y-4">
      {mode === 'gate' || consentRequired ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
          <div className="text-sm font-black text-orange-900">변경된 약관의 재동의가 필요합니다</div>
          <p className="mt-1 text-xs leading-5 text-orange-800">현재 약관을 모두 확인하고 필수 약관에 동의하며 선택 약관의 동의 여부를 결정해야 대여 기능을 계속 이용할 수 있습니다.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-xs text-emerald-800">
          현재 적용 중인 약관 동의가 완료되어 있습니다. 선택 약관은 아래에서 변경할 수 있습니다.
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-5">
        {policy.activeTerms.map((term) => {
          const decisionState = decisions[term.id] || {};
          const currentState = states[term.id] || {};
          const viewed = decisionState.viewedAtMs > 0;
          const accepted = decisionState.decision === TERMS_DECISION.ACCEPTED;
          const needsDecision =
            !decisionState.currentVersion ||
            (!term.required && !viewed && !accepted);
          return (
            <div key={term.id} className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${term.required ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{term.required ? '필수' : '선택'}</span>
                    <span className="text-sm font-bold text-slate-900">{term.title}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {decisionState.currentVersion
                      ? `${accepted ? '동의' : '미동의'} · ${formatTermsTimestamp(currentState.decidedAt)}`
                      : '약관이 변경되어 새 내용 확인이 필요합니다.'}
                  </div>
                </div>

                <button
                  type="button"
                  onPointerEnter={() => { void preloadSignupTermContent(term).catch(() => {}); }}
                  onFocus={() => { void preloadSignupTermContent(term).catch(() => {}); }}
                  onClick={() => { void openTermDialog(term); }}
                  className="shrink-0 text-xs font-bold text-slate-800 underline underline-offset-2"
                >보기</button>

                {term.required ? (
                  <button
                    type="button"
                    disabled={!viewed || (decisionState.currentVersion && accepted && !needsDecision)}
                    onClick={() => setDecisions((current) => ({
                      ...current,
                      [term.id]: { ...current[term.id], decision: TERMS_DECISION.ACCEPTED },
                    }))}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Check size={14} /> {accepted ? '동의 완료' : '동의'}
                  </button>
                ) : needsDecision ? (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={!viewed} onClick={() => setDecisions((current) => ({ ...current, [term.id]: { ...current[term.id], decision: TERMS_DECISION.ACCEPTED } }))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'} disabled:opacity-40`}>동의</button>
                    <button type="button" disabled={!viewed} onClick={() => setDecisions((current) => ({ ...current, [term.id]: { ...current[term.id], decision: TERMS_DECISION.DECLINED } }))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${decisionState.decision === TERMS_DECISION.DECLINED ? 'border-slate-400 bg-slate-100 text-slate-800' : 'border-slate-200 bg-white text-slate-600'} disabled:opacity-40`}>미동의</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDecisions((current) => ({ ...current, [term.id]: { ...current[term.id], decision: accepted ? TERMS_DECISION.DECLINED : TERMS_DECISION.ACCEPTED } }))} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                    <Check size={14} /> {accepted ? '동의함' : '미동의'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setShowHistory((current) => !current)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 underline underline-offset-2">
          <History size={14} /> {showHistory ? '동의 이력 닫기' : '동의 이력 보기'}
        </button>
        <Button type="button" variant="primary" disabled={saving || !valid || (!dirty && !consentRequired)} onClick={saveConsents}>
          {saving ? '저장 중...' : consentRequired ? '재동의 완료' : '약관 동의 저장'}
        </Button>
      </div>

      {showHistory ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-800"><Clock3 size={15} /> 약관 동의 이력</div>
          {logs.length === 0 ? (
            <div className="text-xs text-slate-400">저장된 동의 이력이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-600">
                  <div className="font-bold text-slate-800">{log.titleSnapshot || log.termId}</div>
                  <div className="mt-1">{log.decision === TERMS_DECISION.ACCEPTED ? '동의' : '미동의'} · {formatTermsTimestamp(log.createdAt)}</div>
                  <div className="mt-1 text-slate-400">처리 경로: {log.source || '-'}</div>
                  <button type="button" onClick={() => setHistoryLog(log)} className="mt-2 text-[11px] font-bold text-slate-700 underline underline-offset-2">동의 당시 내용 보기</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <TermsVersionDialog log={historyLog} showVersion={false} onClose={() => setHistoryLog(null)} />

      <TermsContentDialog
        open={dialogTermIds.length > 0}
        title={dialogMetadataTerms[0]?.title || '약관 확인'}
        terms={dialogTerms}
        loading={dialogLoading}
        errorMessage={dialogErrorMessage}
        onClose={closeDialog}
        onConfirm={confirmViewed}
      />
    </div>
  );
}
