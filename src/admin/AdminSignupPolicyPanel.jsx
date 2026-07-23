function PolicySwitch({ checked, disabled = false, label, description, onChange }) {
  return (
    <div className={`rounded-2xl border p-5 ${disabled ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 pr-4">
          <h3 className="text-sm font-bold text-slate-900">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-orange-500' : 'bg-slate-300'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2'}`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
          />
          <span className="sr-only">{checked ? '켜짐' : '꺼짐'}</span>
        </button>
      </div>
    </div>
  );
}

export default function AdminSignupPolicyPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    memberDirectoryAudit,
    memberDirectoryAuditLoading,
    memberDirectoryAuditResult,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
    openProfileRequiredMembers,
    runFullMemberDirectoryAudit,
    signupPolicyDirty,
    signupPolicySaving,
    saveSignupPolicyChanges,
    cancelSignupPolicyChanges,
    setTempAutoApproveNewMembers,
    setTempRequireRegisteredMemberForSignup,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
  } = ctx;

  const autoApproveDisabled = !tempRequireRegisteredMemberForSignup;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="회원가입 정책"
        description="가입 대상, 승인 방식, 기존 회원 명부 검사를 관리합니다."
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">가입 대상 정책</h2>
          <p className="mt-1 text-xs text-slate-500">가입 단계에서 관리자 명부 일치 여부를 확인합니다.</p>
        </div>

        <PolicySwitch
          checked={tempRequireRegisteredMemberForSignup}
          label="등록된 부서·사용자만 가입 허용"
          description="부서·사용자 관리에 등록된 부서와 성명이 일치하는 경우에만 회원가입 및 서비스 이용을 허용합니다."
          onChange={(nextValue) => {
            setTempRequireRegisteredMemberForSignup(nextValue);
            if (!nextValue) {
              setTempAutoApproveNewMembers(false);
            }
          }}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">승인 정책</h2>
          <p className="mt-1 text-xs text-slate-500">신규 가입자의 초기 회원 상태를 결정합니다.</p>
        </div>

        <PolicySwitch
          checked={tempAutoApproveNewMembers}
          disabled={autoApproveDisabled}
          label="신규 회원 자동 승인"
          description="명부 확인을 통과한 신규 회원을 관리자 승인 없이 즉시 활성화합니다. 재가입자는 자동 승인하지 않습니다."
          onChange={setTempAutoApproveNewMembers}
        />

        {autoApproveDisabled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">
            신규 회원 자동 승인은 등록 명부 확인이 활성화된 경우에만 사용할 수 있습니다.
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        {signupPolicyDirty ? (
          <div className="self-center text-[11px] text-orange-600 sm:mr-auto">저장되지 않은 변경사항이 있습니다.</div>
        ) : null}
        <Button type="button" variant="outline" disabled={!signupPolicyDirty || signupPolicySaving} onClick={cancelSignupPolicyChanges}>
          변경 취소
        </Button>
        <Button type="button" variant="primary" disabled={!signupPolicyDirty || signupPolicySaving} onClick={saveSignupPolicyChanges}>
          {signupPolicySaving ? '정책 저장 중...' : '정책 저장'}
        </Button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">기존 회원 명부 검사</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              기본 검증은 명부 버전이 변경된 사용자가 로그인할 때 본인 정보만 확인합니다. 필요한 경우 전체 회원을 수동으로 검사할 수 있습니다.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={runFullMemberDirectoryAudit}
            disabled={!memberDirectoryPolicyEnabled || memberDirectoryAuditLoading}
            className="shrink-0"
          >
            {memberDirectoryAuditLoading ? '전체 회원 검사 중...' : '전체 회원 명부 검사'}
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">
          {memberDirectoryAudit?.completedAtText ? (
            <>
              최근 전체 검사: {memberDirectoryAudit.completedAtText} · 정상 {memberDirectoryAudit.normal || 0}명 · 정보 수정 필요 {memberDirectoryAudit.profileRequired || 0}명 · 중복 {memberDirectoryAudit.duplicates || 0}명
            </>
          ) : (
            '아직 전체 회원 명부 검사를 실행하지 않았습니다.'
          )}
        </div>

        {!memberDirectoryPolicyEnabled ? (
          <p className="mt-2 text-[11px] text-slate-400">전체 회원 검사는 저장된 가입 제한 정책이 켜져 있을 때 실행할 수 있습니다.</p>
        ) : null}

        {!memberIdentityClaimsReady ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">
            기존 회원의 부서·성명 중복 확인 정보가 아직 준비되지 않았습니다. 부서·사용자 명부를 저장하거나 전체 회원 명부 검사를 실행해 주세요.
          </div>
        ) : null}

        {memberDirectoryAuditResult ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            검사 {memberDirectoryAuditResult.total || 0}명 · 정상 {memberDirectoryAuditResult.normal || 0}명 · 정보 수정 필요 {memberDirectoryAuditResult.profileRequired || 0}명 · 중복 {memberDirectoryAuditResult.duplicates || 0}명 · 실패 {memberDirectoryAuditResult.failed || 0}명
            {(memberDirectoryAuditResult.profileRequired || 0) > 0 ? (
              <button type="button" onClick={openProfileRequiredMembers} className="ml-3 font-bold underline underline-offset-2">
                정보 수정 필요 회원 보기
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
