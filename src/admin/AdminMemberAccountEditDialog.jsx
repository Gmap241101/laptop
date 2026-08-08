import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, History, X } from 'lucide-react';

import { loadMemberAccountHistorySummary } from '../features/members/memberAccountHistoryService.js';
import {
  DOMESTIC_PHONE_PREFIXES,
  normalizePhoneDigits,
  normalizePhoneMiddleDigits,
  parseDomesticPhoneNumber,
} from '../utils/memberPolicy.js';
import {
  getUserAccountStatusClassName,
  getUserAccountStatusLabel,
} from '../features/members/memberAccountPolicy.js';

const getCreatedAtText = (account) =>
  typeof account?.createdAt?.toDate === 'function'
    ? account.createdAt.toDate().toLocaleString('ko-KR')
    : '-';

export default function AdminMemberAccountEditDialog({
  account,
  Button,
  onClose,
  onOpenTerms,
  onSave,
  saving,
}) {
  const initialPhone = useMemo(
    () => parseDomesticPhoneNumber(account?.phone || ''),
    [account?.phone]
  );
  const [form, setForm] = useState(() => ({
    name: account?.name || '',
    team: account?.team || '',
    phonePrefix: initialPhone.prefix,
    phoneMiddle: initialPhone.middle,
    phoneLast: initialPhone.last,
  }));
  const [historySummary, setHistorySummary] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    const phone = parseDomesticPhoneNumber(account?.phone || '');
    setForm({
      name: account?.name || '',
      team: account?.team || '',
      phonePrefix: phone.prefix,
      phoneMiddle: phone.middle,
      phoneLast: phone.last,
    });
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">회원정보 확인 및 수정</h3>
            <p className="mt-1 text-[11px] text-slate-500">이메일과 UID는 로그인 식별정보이므로 이 화면에서 변경하지 않습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold text-slate-400">이메일</div>
              <div className="mt-1 break-all text-xs font-semibold text-slate-700">{account.email || '-'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-400">가입일시</div>
              <div className="mt-1 text-xs font-semibold text-slate-700">{getCreatedAtText(account)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-400">현재 상태</div>
              <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getUserAccountStatusClassName(account.status || '')}`}>
                {getUserAccountStatusLabel(account.status || '')}
              </span>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-400">UID</div>
              <div className="mt-1 break-all text-[10px] text-slate-500">{account.uid}</div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">이름</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
                maxLength={30}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">부서 / 팀</span>
              <input
                value={form.team}
                onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
                maxLength={80}
              />
            </label>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-bold text-slate-700">전화번호</div>
            <div className="grid grid-cols-[100px_1fr_1fr] gap-2">
              <select
                value={form.phonePrefix}
                onChange={(event) => setForm((current) => ({ ...current, phonePrefix: event.target.value }))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none mk-form-border-focus"
              >
                {DOMESTIC_PHONE_PREFIXES.map((prefix) => (
                  <option key={prefix} value={prefix}>{prefix}</option>
                ))}
              </select>
              <input
                value={form.phoneMiddle}
                inputMode="numeric"
                onChange={(event) => setForm((current) => ({
                  ...current,
                  phoneMiddle: normalizePhoneMiddleDigits(event.target.value),
                }))}
                className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-center text-xs outline-none mk-form-border-focus"
                placeholder="1234"
              />
              <input
                value={form.phoneLast}
                inputMode="numeric"
                onChange={(event) => setForm((current) => ({
                  ...current,
                  phoneLast: normalizePhoneDigits(event.target.value, 4),
                }))}
                className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-center text-xs outline-none mk-form-border-focus"
                placeholder="5678"
              />
            </div>
          </div>

          {account.status === 'retired' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              이용 종료 계정은 정보 수정이 잠겨 있습니다. 목록에서 이용 재개 후 수정해 주세요.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onOpenTerms}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <FileCheck2 size={15} /> 약관 동의 내역
            </button>
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <History size={15} /> {historyLoading ? '대여 이력 확인 중' : '대여 이력 확인'}
            </button>
          </div>

          {historySummary ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[11px] leading-5 text-violet-800">
              전체 대여 {historySummary.totalRequests}건 · 이전 계정 대여 {historySummary.previousRequests}건 · 진행 중 {historySummary.activeRequests}건 · 연체 이력 {historySummary.overdueRequests}건
            </div>
          ) : null}
          {historyError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{historyError}</div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              닫기
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={saving || account.status === 'retired'}
              onClick={() => void onSave(form)}
            >
              {saving ? '저장 중...' : '회원정보 저장'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
