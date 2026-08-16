import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';

export default function AdminManagedPasswordDialog({
  account,
  accountType = 'member',
  Button,
  open,
  saving = false,
  onClose,
  onSave,
}) {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setPasswordConfirm('');
  }, [open, account?.uid, account?.id]);

  if (!open || !account) return null;

  const isAdmin = accountType === 'admin';
  const accountLabel = isAdmin
    ? account.adminLoginId || account.authEmail || account.email || account.id || '관리자'
    : account.name || account.email || account.uid || '회원';

  return (
    <ModalPortal className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound size={17} className="text-orange-500" />
              <h3 className="text-base font-black text-slate-900">비밀번호 수정</h3>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              [{accountLabel}] {isAdmin ? '관리자' : '회원'} 계정의 Clerk 로그인 비밀번호를 새 값으로 변경합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
            aria-label="비밀번호 수정 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">새 비밀번호</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8자 이상 입력"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">새 비밀번호 확인</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none mk-form-border-focus"
            />
          </label>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">
            변경 즉시 새 비밀번호가 Clerk 로그인 비밀번호로 적용됩니다. 변경한 비밀번호는 화면에 다시 표시되지 않습니다.
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>취소</Button>
            <Button
              type="button"
              variant="primary"
              disabled={saving}
              onClick={() => void onSave({ password, passwordConfirm })}
            >
              {saving ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
