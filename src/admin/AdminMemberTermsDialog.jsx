import { useEffect, useState } from 'react';
import { FileCheck2, X } from 'lucide-react';

import TermsVersionDialog from '../components/TermsVersionDialog.jsx';

import {
  TERMS_DECISION,
} from '../features/terms/termsConstants.js';
import {
  formatTermsTimestamp,
  loadSignupTermsPolicy,
  loadUserTermConsentLogs,
  loadUserTermConsentStates,
} from '../features/terms/termsService.js';

export default function AdminMemberTermsDialog({ account, onClose }) {
  const [policy, setPolicy] = useState(null);
  const [states, setStates] = useState({});
  const [logs, setLogs] = useState([]);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [historyLog, setHistoryLog] = useState(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const nextPolicy = await loadSignupTermsPolicy();
        const [nextStates, nextLogs] = await Promise.all([
          loadUserTermConsentStates(account.uid, nextPolicy),
          loadUserTermConsentLogs(account.uid),
        ]);
        if (disposed) return;
        setPolicy(nextPolicy);
        setStates(nextStates);
        setLogs(nextLogs);
      } catch (error) {
        console.error('Admin member terms read error:', error);
        if (!disposed) setErrorMessage('회원의 약관 동의 내역을 불러오지 못했습니다.');
      } finally {
        if (!disposed) setReady(true);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [account.uid]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">회원 약관 동의 내역</h3>
            <p className="mt-1 text-[11px] text-slate-500">{account.name || '이름 미등록'} · {account.email || account.uid}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><X size={16} /></button>
        </div>

        <div className="space-y-5 p-5">
          {!ready ? (
            <div className="py-12 text-center text-xs text-slate-400">약관 동의 내역을 불러오는 중입니다.</div>
          ) : errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{errorMessage}</div>
          ) : (
            <>
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><FileCheck2 size={16} /> 현재 약관 상태</div>
                {!policy?.enabled ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">현재 회원가입 약관 정책이 비활성화되어 있습니다.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-[680px] w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] text-slate-600">
                        <tr>
                          <th className="border-b border-slate-200 px-3 py-3">약관</th>
                          <th className="border-b border-slate-200 px-3 py-3 text-center">구분</th>
                          <th className="border-b border-slate-200 px-3 py-3 text-center">현재 버전</th>
                          <th className="border-b border-slate-200 px-3 py-3 text-center">회원 상태</th>
                          <th className="border-b border-slate-200 px-3 py-3 text-center">처리일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {policy.activeTerms.map((term) => {
                          const state = states[term.id];
                          const current = Number(state?.termVersion || 0) === Number(term.version || 0) && state?.termVersionId === term.versionId && state?.contentHash === term.contentHash;
                          return (
                            <tr key={term.id} className="border-b border-slate-100 last:border-b-0">
                              <td className="px-3 py-3 font-bold text-slate-800">{term.title}</td>
                              <td className="px-3 py-3 text-center">{term.required ? '필수' : '선택'}</td>
                              <td className="px-3 py-3 text-center">v{term.version}</td>
                              <td className="px-3 py-3 text-center">
                                {!state ? '기록 없음' : !current ? '재동의 필요' : state.decision === TERMS_DECISION.ACCEPTED ? '동의' : '미동의'}
                              </td>
                              <td className="px-3 py-3 text-center text-slate-500">{formatTermsTimestamp(state?.decidedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-3 text-sm font-black text-slate-900">전체 변경 이력</h4>
                {logs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">저장된 약관 동의 이력이 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">
                        <div className="font-bold text-slate-900">{log.titleSnapshot || log.termId}</div>
                        <div>버전 {log.termVersion} · {log.requiredSnapshot ? '필수' : '선택'} · {log.decision === TERMS_DECISION.ACCEPTED ? '동의' : '미동의'}</div>
                        <div>처리일 {formatTermsTimestamp(log.createdAt)} · 처리 경로 {log.source || '-'}</div>
                        <div className="break-all text-slate-400">내용 해시 {log.contentHash || '-'}</div>
                        <button type="button" onClick={() => setHistoryLog(log)} className="mt-1 font-bold text-slate-700 underline underline-offset-2">동의 당시 내용 보기</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      <TermsVersionDialog log={historyLog} onClose={() => setHistoryLog(null)} />
    </div>
  );
}
