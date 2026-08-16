import { X } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';

export default function AdminAccountEditDialog({
  account,
  Button,
  Input,
  Select,
  form,
  setForm,
  authenticatedAdminAccount,
  onClose,
  onSave,
  onPasswordReset,
  isCurrentAdminAccount = false,
}) {
  if (!account) return null;
  const isClerkLinked = Boolean(account.authUid || account.clerkUserId);

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">관리자 계정 수정</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              관리자 정보와 권한을 수정합니다. Clerk 연결 계정의 로그인 이메일은 이 화면에서 변경하지 않습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="관리자 ID" value={form.adminLoginId} onChange={(v) => setForm({ ...form, adminLoginId: v })} />
            <Input
              label="로그인 이메일"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              disabled={isClerkLinked}
              placeholder={isClerkLinked ? 'Clerk 연결 이메일은 변경 불가' : '로그인 이메일'}
            />
            <Input label="조직명" value={form.organizationName} onChange={(v) => setForm({ ...form, organizationName: v })} />
            <Input label="사용자명" value={form.userName} onChange={(v) => setForm({ ...form, userName: v })} />
            <Select
              label="관리자 권한"
              value={form.adminRole || account.adminRole || 'admin'}
              onChange={(v) => setForm({ ...form, adminRole: v })}
              disabled={(authenticatedAdminAccount?.adminRole || 'owner') !== 'owner'}
            >
              <option value="admin">일반 관리자</option>
              <option value="owner">최고 관리자</option>
            </Select>
            <Input label="전화번호" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Input
              label="새 비밀번호"
              type="password"
              value={form.newPassword}
              onChange={(v) => setForm({ ...form, newPassword: v })}
              disabled={isClerkLinked && !isCurrentAdminAccount}
              placeholder={isClerkLinked && !isCurrentAdminAccount ? '다른 관리자 계정은 직접 지정 불가' : '변경하지 않으면 비워두세요'}
            />
            <Input
              label="새 비밀번호 확인"
              type="password"
              value={form.newPasswordConfirm}
              onChange={(v) => setForm({ ...form, newPasswordConfirm: v })}
              disabled={isClerkLinked && !isCurrentAdminAccount}
            />
          </div>

          {isClerkLinked ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
              <p>
                Clerk 로그인 이메일은 이 화면에서 직접 변경하지 않습니다.
                {isCurrentAdminAccount
                  ? ' 현재 로그인 중인 본인 계정은 새 비밀번호를 직접 변경할 수 있습니다.'
                  : ' 다른 관리자 계정은 로그인 화면의 비밀번호 재설정을 사용해야 합니다.'}
              </p>
              {!isCurrentAdminAccount ? (
                <div className="mt-3 flex justify-end">
                  <Button type="button" variant="outline" onClick={() => onPasswordReset?.(account)}>
                    비밀번호 재설정 안내
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="button" variant="primary" onClick={() => void onSave(account)}>저장</Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
