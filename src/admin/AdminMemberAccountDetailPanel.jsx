import { ArrowLeft, FileCheck2, History, PencilLine, Trash2 } from 'lucide-react';

import {
  formatUserAccountCreatedAt,
  getUserAccountStatusClassName,
  getUserAccountStatusLabel,
} from '../features/members/memberAccountPolicy.js';

export default function AdminMemberAccountDetailPanel({
  account,
  onBack,
  onEdit,
  onOpenHistory,
  onOpenTerms,
  onPurge,
  purgeLoading = false,
}) {
  if (!account) return null;

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-left">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-black text-slate-950">
              {account.name || '이름 미등록'} 회원 상세
            </h3>
            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getUserAccountStatusClassName(account.status || '')}`}
            >
              {getUserAccountStatusLabel(account.status || '')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            회원정보를 조회하는 상세 본문입니다. 수정이 필요한 경우 아래 회원수정 버튼을 눌러 별도 팝업에서 진행합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['이름', account.name || '-'],
          ['부서 / 팀', account.team || '-'],
          ['전화번호', account.phone || '-'],
          ['이메일', account.email || '-'],
          ['가입일시', formatUserAccountCreatedAt(account)],
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
          탈퇴 계정은 로그인 계정이 삭제된 이용 종료 상태입니다. 회원정보와 과거 업무기록은 보존되며, 재가입은 항상 새 계정으로 처리합니다. 완전 삭제하면 관련 업무기록과 재가입 연결정보까지 함께 삭제됩니다.
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenTerms}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <FileCheck2 size={14} /> 약관 동의 내역
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <History size={14} /> 대여 이력 확인
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={account.status === 'retired'}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-bold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PencilLine size={14} /> 회원수정
          </button>
          {account.status === 'retired' ? (
            <button
              type="button"
              onClick={onPurge}
              disabled={purgeLoading}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} /> {purgeLoading ? '완전 삭제 중' : '회원 완전 삭제'}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 sm:self-auto"
        >
          <ArrowLeft size={14} /> 목록으로
        </button>
      </div>

    </div>
  );
}
