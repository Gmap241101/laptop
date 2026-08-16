import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';
import AdminMemberDirectoryIdentityFields from './AdminMemberDirectoryIdentityFields.jsx';

import {
  DOMESTIC_PHONE_PREFIXES,
  normalizePhoneDigits,
  normalizePhoneMiddleDigits,
  parseDomesticPhoneNumber,
} from '../utils/memberPolicy.js';
import {
  formatUserAccountCreatedAt,
  getUserAccountStatusClassName,
  getUserAccountStatusLabel,
} from '../features/members/memberAccountPolicy.js';

export default function AdminMemberAccountEditDialog({
  account,
  Button,
  onClose,
  onSave,
  saving,
  memberDirectoryTeams = [],
  memberDirectoryBorrowers = [],
  memberDirectoryPolicyEnabled = false,
  onPasswordChange,
}) {
  const initialPhone = useMemo(
    () => parseDomesticPhoneNumber(account?.phone || ''),
    [account?.phone]
  );
  const [form, setForm] = useState(() => ({
    name: account?.name || '',
    team: account?.team || '',
    useManagedDirectory: Boolean(memberDirectoryPolicyEnabled) && !account?.directoryOverrideByAdmin,
    phonePrefix: initialPhone.prefix,
    phoneMiddle: initialPhone.middle,
    phoneLast: initialPhone.last,
  }));

  useEffect(() => {
    const phone = parseDomesticPhoneNumber(account?.phone || '');
    setForm({
      name: account?.name || '',
      team: account?.team || '',
      useManagedDirectory: Boolean(memberDirectoryPolicyEnabled) && !account?.directoryOverrideByAdmin,
      phonePrefix: phone.prefix,
      phoneMiddle: phone.middle,
      phoneLast: phone.last,
    });
  }, [account?.uid, account?.name, account?.team, account?.phone, account?.directoryOverrideByAdmin, memberDirectoryPolicyEnabled]);

  if (!account) return null;

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">회원정보 수정</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              성명·부서·전화번호를 변경합니다. 회원 가입 정책에서 지정된 부서·사용자 명부 사용이 활성화된 경우에만 명부 선택 체크박스를 표시하며, 비활성화된 경우 부서/팀과 성명을 자유롭게 입력합니다. 이메일과 UID는 변경하지 않습니다.
            </p>
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
              <div className="mt-1 text-xs font-semibold text-slate-700">{formatUserAccountCreatedAt(account)}</div>
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
            <AdminMemberDirectoryIdentityFields
              form={form}
              setForm={setForm}
              teams={memberDirectoryTeams}
              borrowers={memberDirectoryBorrowers}
              policyEnabled={memberDirectoryPolicyEnabled}
            />
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
              탈퇴 계정은 Clerk 로그인 계정이 삭제된 이용 종료 기록이므로 수정할 수 없습니다. 재가입은 새 회원 계정으로 처리합니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800">로그인 비밀번호</div>
                <div className="mt-1 text-[11px] leading-5 text-slate-500">회원 개인정보 저장과 분리하여 별도 비밀번호 수정 모달에서 변경합니다.</div>
              </div>
              <Button type="button" variant="outline" onClick={() => onPasswordChange?.(account)} disabled={saving}>
                비밀번호 수정
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              취소
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
    </ModalPortal>
  );
}
