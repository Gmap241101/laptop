import { useEffect, useState } from 'react';
import { FileCheck2, History, PencilLine, X } from 'lucide-react';

import { loadMemberAccountHistorySummary } from '../features/members/memberAccountHistoryService.js';
import {
  getUserAccountStatusClassName,
  getUserAccountStatusLabel,
} from '../features/members/memberAccountPolicy.js';

const getCreatedAtText = (account) =>
  typeof account?.createdAt?.toDate === 'function'
    ? account.createdAt.toDate().toLocaleString('ko-KR')
    : '-';

export default function AdminMemberAccountDetailPanel({
  account,
  onClose,
  onEdit,
  onOpenTerms,
}) {
  const [historySummary, setHistorySummary] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    setHistorySummary(null);
    setHistoryError('');
  }, [account?.uid]);

  if (!account) return null;

  const loadHistory = async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      setHistorySummary(await loadMemberAccountHistorySummary(account));
    } catch (error) {
      console.error('Admin member history summary read error:', error);
      setHistoryError('대여 이력을 불러오지 못했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-left">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black text-slate-900">
              {account.name || '이름 미등록'} 회원 상세
            </h3>
            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getUserAccountStatusClassName(account.status || '')}`}
            >
              {getUserAccountStatusLabel(account.status || '')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            목록에서는 조회만 하며, 회원정보 변경은 아래의 회원수정 버튼으로 별도 팝업을 열어 진행합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          aria-label="회원 상세 닫기"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['이름', account.name || '-'],
          ['부서 / 팀', account.team || '-'],
          ['전화번호', account.phone || '-'],
          ['이메일', account.email || '-'],
          ['가입일시', getCreatedAtText(account)],
          ['현재 상태', getUserAccountStatusLabel(account.status || '')],
          ['UID', account.uid || '-'],
        ].map(([label, value]) => (
          <div key={label} className={label === 'UID' ? 'sm:col-span-2 xl:col-span-2' : ''}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div
              className={`mt-1 text-xs font-semibold text-slate-700 ${label === 'UID' || label === '이메일' ? 'break-all' : ''}`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {account.status === 'retired' ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
          이용 종료 계정은 회원정보 수정이 잠겨 있습니다. 목록에서 이용 재개 후 수정해 주세요.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenTerms}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
        >
          <FileCheck2 size={14} /> 약관 동의 내역
        </button>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={historyLoading}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <History size={14} /> {historyLoading ? '대여 이력 확인 중' : '대여 이력 확인'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={account.status === 'retired'}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-bold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PencilLine size={14} /> 회원수정
        </button>
      </div>

      {historySummary ? (
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[11px] leading-5 text-violet-800">
          전체 대여 {historySummary.totalRequests}건 · 이전 계정 대여 {historySummary.previousRequests}건 · 진행 중 {historySummary.activeRequests}건 · 연체 이력 {historySummary.overdueRequests}건
        </div>
      ) : null}
      {historyError ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {historyError}
        </div>
      ) : null}
    </div>
  );
}
