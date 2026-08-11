import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { Check, Clock3, History } from 'lucide-react';

import TermsContentDialog from '../components/TermsContentDialog.jsx';
import TermsVersionDialog from '../components/TermsVersionDialog.jsx';
import {
  SIGNUP_TERMS_POLICY_DOC_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  USER_TERM_CONSENT_LOGS_COLLECTION_REF,
  USER_TERM_CONSENT_STATES_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../firebase.js';
import {
  TERMS_CONSENT_SOURCE,
  TERMS_DECISION,
  getTermsConsentStateId,
  isTermsConsentRequiredForAccount,
  normalizeTermsPolicy,
} from '../features/terms/termsConstants.js';
import {
  formatTermsTimestamp,
  loadSignupTermsPolicy,
  loadUserTermConsentLogs,
  loadUserTermConsentStates,
} from '../features/terms/termsService.js';
import { syncMemberProfileWriteThroughBestEffort } from '../features/members/memberProfileWriteThrough.js';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
import {
  publishAccountLifecycleAuthorityObservation,
  readAccountLifecycleAuthorityConfig,
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
  const uid = firebaseAuth.currentUser?.uid || account?.uid || '';
  const [policy, setPolicy] = useState(() => normalizeTermsPolicy({}));
  const [states, setStates] = useState({});
  const [decisions, setDecisions] = useState({});
  const [logs, setLogs] = useState([]);
  const [termsConsentRevision, setTermsConsentRevision] = useState(() => Math.max(0, Number(account?.termsConsentRevision) || 0));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [dialogTermIds, setDialogTermIds] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLog, setHistoryLog] = useState(null);

  const loadData = useCallback(async () => {
    if (!uid) return;
    setReady(false);
    try {
      const lifecycleConfig = readAccountLifecycleAuthorityConfig();
      let nextPolicy;
      let nextStates;
      let nextLogs;
      if (lifecycleConfig.requested) {
        let payload = await clerkStagingClient.getUserTermsConsent();
        if (payload?.termsConsent?.bootstrapRequired) {
          const firebaseUser = firebaseAuth.currentUser;
          if (!firebaseUser) throw new Error('terms-consent-firebase-compatibility-required');
          const firebaseIdToken = await firebaseUser.getIdToken();
          payload = await clerkStagingClient.bootstrapUserTermsConsent(firebaseIdToken);
        }
        nextPolicy = normalizeTermsPolicy(payload?.termsConsent?.policy || {});
        nextStates = payload?.termsConsent?.states || {};
        nextLogs = Array.isArray(payload?.termsConsent?.logs) ? payload.termsConsent.logs : [];
        setTermsConsentRevision(Math.max(0, Number(payload?.termsConsent?.termsConsentRevision) || 0));
        publishAccountLifecycleAuthorityObservation({
          ...readAccountLifecycleAuthorityFromPayload(payload, { requested: true }),
          termsConsentMirror: payload?.termsConsent?.firestoreMirror || 'retired',
          termsConsentBootstrap: payload?.termsConsent?.legacyBootstrap || 'not-required',
          error: null,
        });
      } else {
        nextPolicy = await loadSignupTermsPolicy();
        setTermsConsentRevision(Math.max(0, Number(account?.termsConsentRevision) || 0));
        [nextStates, nextLogs] = await Promise.all([
          loadUserTermConsentStates(uid, nextPolicy),
          loadUserTermConsentLogs(uid),
        ]);
      }
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
  const dialogTerms = policy.activeTerms.filter((term) => dialogTermIds.includes(term.id));

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
    setDialogTermIds([]);
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
      const lifecycleConfig = readAccountLifecycleAuthorityConfig();
      if (lifecycleConfig.requested) {
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
          termsConsentMirror: payload?.termsConsent?.firestoreMirror || 'retired',
          error: null,
        });
      } else {
      await runTransaction(db, async (transaction) => {
        const [policySnapshot, accountSnapshot] = await Promise.all([
          transaction.get(SIGNUP_TERMS_POLICY_DOC_REF),
          transaction.get(doc(db, USER_ACCOUNTS_COLLECTION_NAME, uid)),
        ]);
        const latestPolicy = normalizeTermsPolicy(policySnapshot.exists() ? policySnapshot.data() : {});
        if (!accountSnapshot.exists()) {
          const error = new Error('terms/account-not-found');
          error.code = 'terms/account-not-found';
          throw error;
        }
        if (
          latestPolicy.revision !== policy.revision ||
          latestPolicy.activeTerms.length !== policy.activeTerms.length
        ) {
          const error = new Error('terms/policy-changed');
          error.code = 'terms/policy-changed';
          throw error;
        }

        latestPolicy.activeTerms.forEach((term) => {
          const localTerm = policy.activeTerms.find((item) => item.id === term.id);
          const decisionState = decisions[term.id] || {};
          if (!localTerm || localTerm.version !== term.version || localTerm.contentHash !== term.contentHash) {
            const error = new Error('terms/policy-changed');
            error.code = 'terms/policy-changed';
            throw error;
          }
          if (
            term.required &&
            (decisionState.decision !== TERMS_DECISION.ACCEPTED || !decisionState.viewedAtMs)
          ) {
            const error = new Error('terms/required-not-accepted');
            error.code = 'terms/required-not-accepted';
            throw error;
          }
          const decisionChanged =
            decisionState.decision !== decisionState.originalDecision;
          if (
            !term.required &&
            (!decisionState.currentVersion || decisionChanged) &&
            (![TERMS_DECISION.ACCEPTED, TERMS_DECISION.DECLINED].includes(decisionState.decision) || !decisionState.viewedAtMs)
          ) {
            const error = new Error('terms/decision-required');
            error.code = 'terms/decision-required';
            throw error;
          }
        });

        latestPolicy.activeTerms.forEach((term) => {
          const decisionState = decisions[term.id];
          const previous = states[term.id] || {};
          const shouldPersist =
            !decisionState.currentVersion ||
            decisionState.decision !== decisionState.originalDecision;
          if (!shouldPersist) return;

          const stateRef = doc(
            USER_TERM_CONSENT_STATES_COLLECTION_REF,
            getTermsConsentStateId(uid, term.id)
          );
          const logRef = doc(USER_TERM_CONSENT_LOGS_COLLECTION_REF);
          const payload = {
            uid,
            termId: term.id,
            termVersion: term.version,
            termVersionId: term.versionId || '',
            policyRevision: latestPolicy.revision,
            decision: decisionState.decision,
            requiredSnapshot: Boolean(term.required),
            titleSnapshot: term.title,
            contentHash: term.contentHash,
            viewedAtMs: Number(decisionState.viewedAtMs || 0),
            decidedAt: serverTimestamp(),
            source: consentRequired ? TERMS_CONSENT_SOURCE.RECONSENT : TERMS_CONSENT_SOURCE.MY_PAGE,
            updatedAt: serverTimestamp(),
          };
          transaction.set(stateRef, payload);
          transaction.set(logRef, {
            ...payload,
            previousDecision: previous.decision || '',
            createdAt: serverTimestamp(),
          });
        });

        transaction.update(doc(db, USER_ACCOUNTS_COLLECTION_NAME, uid), {
          termsConsentRevision: latestPolicy.revision,
          termsConsentCompletedAt: serverTimestamp(),
          termsConsentPolicyVersion: latestPolicy.revision,
          updatedAt: serverTimestamp(),
        });
      });

      await syncMemberProfileWriteThroughBestEffort({
        firebaseUser: firebaseAuth.currentUser,
        firebaseUid: uid,
        reason: 'user-terms-consent-save',
      });
      }

      triggerToast('약관 동의 정보가 저장되었습니다.', 'success');
      await loadData();
      onCompleted?.();
    } catch (error) {
      if (readAccountLifecycleAuthorityConfig().requested) {
        publishAccountLifecycleAuthorityObservation({
          requested: true,
          error: error?.code || error?.message || 'terms-consent-save-failed',
        });
      }
      console.error('User terms consent save error:', error);
      triggerToast(
        error?.code === 'terms/policy-changed'
          ? '약관이 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
          : '약관 동의 정보 저장에 실패했습니다.',
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

                <button type="button" onClick={() => setDialogTermIds([term.id])} className="shrink-0 text-xs font-bold text-slate-800 underline underline-offset-2">보기</button>

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
        title={dialogTerms[0]?.title || '약관 확인'}
        terms={dialogTerms}
        onClose={() => setDialogTermIds([])}
        onConfirm={confirmViewed}
      />
    </div>
  );
}
