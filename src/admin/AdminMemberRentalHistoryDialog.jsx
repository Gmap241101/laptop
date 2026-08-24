import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';

import ModalPortal from '../components/ModalPortal.jsx';
import { loadMemberAccountRentalHistory } from '../features/members/memberAccountHistoryService.js';
import { formatKoreanDateTime } from '../utils/appUtils.js';

const formatTimestamp = (value) => formatKoreanDateTime(value, '-');

const statusClassName = (status) => {
  if (status === '대여중') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === '신청중' || status === '보류') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === '반납완료') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === '불허' || status === '사용자취소') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-slate-200 bg-white text-slate-600';
};

export default function AdminMemberRentalHistoryDialog({ account, onClose }) {
  const [history, setHistory] = useState(null);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setReady(false);
      setHistory(null);
      setErrorMessage('');
      try {
        const result = await loadMemberAccountRentalHistory({ uid: account.uid });
        if (!disposed) setHistory(result);
      } catch (error) {
        console.error('Admin member rental history read error:', error);
        if (!disposed) setErrorMessage('대여 이력을 불러오지 못했습니다.');
      } finally {
        if (!disposed) setReady(true);
      }
    };
    void load();
    return () => { disposed = true; };
  }, [account.uid]);

  const summary = history?.summary || {};
  const requests = Array.isArray(history?.requests) ? history.requests : [];

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-900"><History size={17} /> 회원 대여 이력</h3>
            <p className="mt-1 text-[11px] text-slate-500">{account.name || '이름 미등록'} · {account.email || account.uid}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="space-y-5 p-5">
          {!ready ? (
            <div className="py-12 text-center text-xs text-slate-400">대여 이력을 불러오는 중입니다.</div>
          ) : errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{errorMessage}</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['전체 대여', summary.totalRequests || 0],
                  ['이전 계정 대여', summary.previousRequests || 0],
                  ['진행 중', summary.activeRequests || 0],
                  ['연체 이력', summary.overdueRequests || 0],
                  ['반납 완료', summary.returnedRequests || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                    <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
                  </div>
                ))}
              </div>

              {requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">저장된 대여 이력이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[980px] w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] text-slate-600">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-3">신청일시</th>
                        <th className="border-b border-slate-200 px-3 py-3">기기</th>
                        <th className="border-b border-slate-200 px-3 py-3">대여 기간</th>
                        <th className="border-b border-slate-200 px-3 py-3 text-center">상태</th>
                        <th className="border-b border-slate-200 px-3 py-3">사용 목적</th>
                        <th className="border-b border-slate-200 px-3 py-3 text-center">반납/연체</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((request) => (
                        <tr key={request.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatTimestamp(request.requestedAt || request.createdAt)}</td>
                          <td className="px-3 py-3">
                            <div className="font-bold text-slate-800">{request.assetNo || request.laptopId || '-'}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{request.assetCategory || '-'}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{request.startDate || '-'} ~ {request.dueDate || '-'}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-bold ${statusClassName(request.status)}`}>{request.status || '-'}</span>
                          </td>
                          <td className="max-w-[280px] px-3 py-3 text-slate-600">{request.purpose || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-[11px] text-slate-600">
                            {Number(request.overdueDaysAtReturn || 0) > 0
                              ? `${Number(request.overdueDaysAtReturn)}일 연체`
                              : request.actualReturnDate
                                ? `반납 ${request.actualReturnDate}`
                                : request.status === '대여중'
                                  ? '대여 중'
                                  : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
