import { useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';
import {
  DOMESTIC_PHONE_PREFIXES,
  normalizePhoneDigits,
  normalizePhoneMiddleDigits,
} from '../utils/memberPolicy.js';

const createInitialForm = () => ({
  email: '',
  name: '',
  team: '',
  phonePrefix: '010',
  phoneMiddle: '',
  phoneLast: '',
  password: '',
  passwordConfirm: '',
});

export default function AdminMemberAccountCreateDialog({
  open,
  Button,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(createInitialForm);

  useEffect(() => {
    if (open) setForm(createInitialForm());
  }, [open]);

  if (!open) return null;

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <UserPlus size={17} className="text-orange-500" />
              <h3 className="text-base font-black text-slate-900">회원 신규 등록</h3>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              관리자가 Clerk 로그인 계정과 PostgreSQL 회원정보를 함께 생성합니다. 이메일 OTP 인증은 받지 않으며, 약관은 사용자가 첫 로그인에서 직접 동의합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] leading-5 text-sky-800">
            신규 회원은 즉시 로그인 가능한 계정으로 등록됩니다. 동일 인물의 탈퇴 이력이 확인되는 재가입 계정은 안전을 위해 승인 대기 상태로 생성됩니다.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">로그인 이메일</span>
              <input
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="user@example.com"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
              />
              <span className="mt-1.5 block text-[10px] text-slate-400">관리자 등록 경로에서는 이메일 인증코드를 발송하지 않습니다.</span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">성명</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={30}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">부서 / 팀</span>
              <input
                value={form.team}
                onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
                maxLength={80}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
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
                placeholder="1234"
                className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-center text-xs outline-none mk-form-border-focus"
              />
              <input
                value={form.phoneLast}
                inputMode="numeric"
                onChange={(event) => setForm((current) => ({
                  ...current,
                  phoneLast: normalizePhoneDigits(event.target.value, 4),
                }))}
                placeholder="5678"
                className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-center text-xs outline-none mk-form-border-focus"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">초기 비밀번호</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="영문+숫자 포함 8자 이상"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">초기 비밀번호 확인</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.passwordConfirm}
                onChange={(event) => setForm((current) => ({ ...current, passwordConfirm: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
              />
            </label>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">
            등록 완료 후 초기 비밀번호는 관리자에게 다시 표시되지 않습니다. 사용자에게 별도 안전한 방법으로 전달해 주세요.
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>취소</Button>
            <Button type="button" variant="primary" onClick={() => void onSave(form)} disabled={saving}>
              {saving ? '등록 중...' : '회원 등록'}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
