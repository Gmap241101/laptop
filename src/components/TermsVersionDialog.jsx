import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import ModalPortal from './ModalPortal.jsx';

import {
  POLICY_CONTENT_DOMAINS,
  readPolicyContentCutoverConfig,
  requestPolicyContentDomain,
} from '../features/content/policyContentCutover.js';
import RichTextContent from './RichTextContent.jsx';

export default function TermsVersionDialog({ log, onClose, showVersion = true }) {
  const [version, setVersion] = useState(null);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setReady(false);
      setErrorMessage('');
      try {
        const versionId = String(log?.termVersionId || '').trim();
        if (!versionId) throw new Error('terms/version-id-missing');
        const content = await requestPolicyContentDomain({
          domain: POLICY_CONTENT_DOMAINS.TERMS,
          config: readPolicyContentCutoverConfig(),
          useCache: false,
        });
        const versionDocument = (content.documents || []).find(
          (item) => item.key === `signupTermVersions/${versionId}`
        );
        const currentTermDocument = (content.documents || []).find(
          (item) => item.key.startsWith('signupTerms/') &&
            String(item.payload?.currentVersionId || item.payload?.versionId || '') === versionId
        );
        const payload = versionDocument?.payload || currentTermDocument?.payload || null;
        if (!payload) throw new Error('terms/version-not-found');
        if (!disposed) setVersion({ id: versionId, ...payload });
      } catch (error) {
        console.error('Terms version PostgreSQL read error:', error);
        if (!disposed) {
          setErrorMessage(
            String(log?.termVersionId || '').trim()
              ? 'PostgreSQL에 보관된 약관 내용을 불러오지 못했습니다. Firebase 퇴역 이전의 과거 버전은 별도 이관이 필요할 수 있습니다.'
              : '이 기록에는 보관된 약관 내용 연결 정보가 없습니다.'
          );
        }
      } finally {
        if (!disposed) setReady(true);
      }
    };
    void load();
    return () => { disposed = true; };
  }, [log]);

  if (!log) return null;

  return (
    <ModalPortal className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="동의 당시 약관 내용">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-bold text-orange-600">{log.requiredSnapshot ? '필수' : '선택'}{showVersion ? ` · 버전 ${log.termVersion || '-'}` : ''}</div>
            <h3 className="mt-1 text-base font-black text-slate-900">{log.titleSnapshot || log.termId || '약관 내용'}</h3>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label="닫기"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5">
          {!ready ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">동의 당시 약관을 불러오는 중입니다.</div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800">{errorMessage}<div className="mt-2 break-all text-[10px] text-amber-700">기록된 내용 해시: {log.contentHash || '-'}</div></div>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <RichTextContent html={version?.contentHtml} text={version?.contentText} className="text-sm leading-7 text-slate-700" />
              <div className="mt-5 border-t border-slate-100 pt-3 text-[10px] text-slate-400">내용 해시: <span className="break-all">{version?.contentHash || log.contentHash || '-'}</span></div>
            </section>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">닫기</button>
        </div>
      </div>
    </ModalPortal>
  );
}
