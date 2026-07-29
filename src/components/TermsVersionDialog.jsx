import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { X } from 'lucide-react';

import { SIGNUP_TERM_VERSIONS_COLLECTION_REF } from '../firebase.js';
import RichTextContent from './RichTextContent.jsx';

export default function TermsVersionDialog({ log, onClose }) {
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
        if (!versionId) {
          throw new Error('terms/version-id-missing');
        }
        const snapshot = await getDoc(doc(SIGNUP_TERM_VERSIONS_COLLECTION_REF, versionId));
        if (!snapshot.exists()) {
          throw new Error('terms/version-not-found');
        }
        if (!disposed) setVersion({ id: snapshot.id, ...snapshot.data() });
      } catch (error) {
        console.error('Terms version read error:', error);
        if (!disposed) {
          setErrorMessage(
            String(log?.termVersionId || '').trim()
              ? '보관된 약관 버전 내용을 불러오지 못했습니다.'
              : '이 기록에는 보관된 약관 버전 연결 정보가 없습니다.'
          );
        }
      } finally {
        if (!disposed) setReady(true);
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [log]);

  if (!log) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="동의 당시 약관 내용">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-bold text-orange-600">
              {log.requiredSnapshot ? '필수' : '선택'} · 버전 {log.termVersion || '-'}
            </div>
            <h3 className="mt-1 text-base font-black text-slate-900">{log.titleSnapshot || log.termId || '약관 내용'}</h3>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5">
          {!ready ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">동의 당시 약관을 불러오는 중입니다.</div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800">
              {errorMessage}
              <div className="mt-2 break-all text-[10px] text-amber-700">기록된 내용 해시: {log.contentHash || '-'}</div>
            </div>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <RichTextContent html={version?.contentHtml} text={version?.contentText} className="text-sm leading-7 text-slate-700" />
              <div className="mt-5 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
                내용 해시: <span className="break-all">{version?.contentHash || log.contentHash || '-'}</span>
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">닫기</button>
        </div>
      </div>
    </div>
  );
}
