import { ShieldCheck, X } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';

export default function AdminAccountCreateDialog({
  open,
  Button,
  Input,
  Select,
  data,
  form,
  setForm,
  ADMIN_CUSTOM_OPTION_VALUE,
  authenticatedAdminAccount,
  saving = false,
  onClose,
  onSave,
}) {
  if (!open) return null;

  const selectedOrganizationName = form.organizationName === ADMIN_CUSTOM_OPTION_VALUE
    ? String(form.customOrganizationName || '').trim()
    : String(form.organizationName || '').trim();
  const userOptions = (data?.borrowers || []).filter((borrower) => borrower.team === selectedOrganizationName);

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto mk-modal-scroll-shell rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-orange-500" />
              <h3 className="text-base font-black text-slate-900">관리자 계정 신규 등록</h3>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Clerk 로그인 계정과 PostgreSQL 관리자 레지스트리를 함께 생성합니다.
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
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-[11px] leading-5 text-orange-800">
            조직명과 사용자명은 등록된 부서·사용자 목록에서 선택하거나 기타 직접 입력으로 공용 관리자 계정을 등록할 수 있습니다.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="관리자 ID"
              value={form.adminLoginId}
              onChange={(v) => setForm({ ...form, adminLoginId: v })}
              placeholder="예: admin01"
            />
            <Input
              label="초기 비밀번호"
              type="password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              placeholder="Clerk 초기 비밀번호 입력"
            />

            <Select
              label="조직명"
              value={form.organizationName}
              onChange={(v) => setForm({
                ...form,
                organizationName: v,
                customOrganizationName: v === ADMIN_CUSTOM_OPTION_VALUE ? form.customOrganizationName : '',
                userName: '',
                customUserName: '',
              })}
            >
              <option value="">조직 선택</option>
              {(data?.teams || []).map((team) => <option key={team} value={team}>{team}</option>)}
              <option value={ADMIN_CUSTOM_OPTION_VALUE}>기타 직접 입력</option>
            </Select>

            {form.organizationName === ADMIN_CUSTOM_OPTION_VALUE ? (
              <Input
                label="조직명 직접 입력"
                value={form.customOrganizationName}
                onChange={(v) => setForm({
                  ...form,
                  customOrganizationName: v,
                  userName: ADMIN_CUSTOM_OPTION_VALUE,
                })}
                placeholder="예: 관리자, 기획1팀, 공용계정"
              />
            ) : (
              <Select
                label="사용자명"
                value={form.userName}
                onChange={(v) => setForm({
                  ...form,
                  userName: v,
                  customUserName: v === ADMIN_CUSTOM_OPTION_VALUE ? form.customUserName : '',
                })}
              >
                <option value="">{form.organizationName ? '사용자 선택' : '조직명을 먼저 선택해 주세요'}</option>
                {userOptions.map((borrower, index) => (
                  <option key={`${borrower.team}-${borrower.name}-${index}`} value={borrower.name}>{borrower.name}</option>
                ))}
                <option value={ADMIN_CUSTOM_OPTION_VALUE}>기타 직접 입력</option>
              </Select>
            )}

            {(form.organizationName === ADMIN_CUSTOM_OPTION_VALUE || form.userName === ADMIN_CUSTOM_OPTION_VALUE) ? (
              <Input
                label="사용자명 직접 입력"
                value={form.customUserName}
                onChange={(v) => setForm({ ...form, customUserName: v, userName: ADMIN_CUSTOM_OPTION_VALUE })}
                placeholder="예: 관리자, 기획1팀 공용"
              />
            ) : null}

            <Input
              label="로그인 이메일"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="예: admin@example.com"
            />

            <Select
              label="관리자 권한"
              value={form.adminRole || 'admin'}
              onChange={(v) => setForm({ ...form, adminRole: v })}
              disabled={(authenticatedAdminAccount?.adminRole || 'owner') !== 'owner'}
            >
              <option value="admin">일반 관리자</option>
              <option value="owner">최고 관리자</option>
            </Select>

            <Input
              label="전화번호"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="예: 010-0000-0000"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>취소</Button>
            <Button type="button" variant="primary" onClick={() => void onSave()} disabled={saving}>
              {saving ? '등록 중...' : '관리자 계정 등록'}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
