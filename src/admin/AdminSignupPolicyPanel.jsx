import { useEffect, useState } from 'react';

import useAdminMemberDirectoryAuditActions from '../features/members/useAdminMemberDirectoryAuditActions.js';
import useAdminSignupPolicyActions from '../features/members/useAdminSignupPolicyActions.js';
import AdminSignupTermsManager from './AdminSignupTermsManager.jsx';
import { preloadAdminSignupTermsCatalog } from '../features/terms/adminTermsService.js';

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
            className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
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
    authenticatedAdminAccount,
    authenticatedAdminId,
    isAdminAuthenticated,
    isSplitStorageReady,
    memberDirectoryAudit,
    memberDirectoryBorrowers,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
    onSignupPolicyDeferredStateChange,
    openAdminMemberAccounts,
    setData,
    signupPolicySettings,
    triggerConfirm,
    triggerToast,
  } = ctx;

  const [activePolicyTab, setActivePolicyTab] = useState('policy');

  const {
    memberDirectoryAuditLoading,
    memberDirectoryAuditResult,
    openProfileRequiredMembers,
    resetDirectoryMismatchRestoreAttempt,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    runFullMemberDirectoryAudit,
  } = useAdminMemberDirectoryAuditActions({
    authenticatedAdminAccount,
    authenticatedAdminId,
    borrowers: memberDirectoryBorrowers,
    isAdminAuthenticated,
    isSplitStorageReady,
    settings: signupPolicySettings,
    openAdminMemberAccounts,
    triggerConfirm,
    triggerToast,
  });

  const {
    cancelSignupPolicyChanges,
    saveSignupPolicyChanges,
    setTempAutoApproveNewMembers,
    setTempRequireRegisteredMemberForSignup,
    setTempSignupTermsApplyToExistingMembers,
    setTempSignupTermsEnabled,
    setTempSignupTermsRequireReconsentOnChange,
    signupPolicyDirty,
    signupPolicySaving,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
    tempSignupTermsApplyToExistingMembers,
    tempSignupTermsEnabled,
    tempSignupTermsRequireReconsentOnChange,
  } = useAdminSignupPolicyActions({
    isAdminAuthenticated,
    isSplitStorageReady,
    resetDirectoryMismatchRestoreAttempt,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    setData,
    settings: signupPolicySettings,
    triggerToast,
  });

  useEffect(() => {
    onSignupPolicyDeferredStateChange({
      dirty: signupPolicyDirty,
      discard: cancelSignupPolicyChanges,
      save: saveSignupPolicyChanges,
    });
  }, [
    cancelSignupPolicyChanges,
    onSignupPolicyDeferredStateChange,
    saveSignupPolicyChanges,
    signupPolicyDirty,
  ]);

  useEffect(
    () => () => {
      onSignupPolicyDeferredStateChange(null);
    },
    [onSignupPolicyDeferredStateChange]
  );

  const autoApproveDisabled = !tempRequireRegisteredMemberForSignup;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="회원가입 정책"
        description="가입 대상, 승인 방식, 회원가입 약관과 기존 회원 적용 정책을 관리합니다."
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex min-w-max gap-2">
          <button
            type="button"
            onClick={() => setActivePolicyTab('policy')}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activePolicyTab === 'policy'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            가입 정책
          </button>
          <button
            type="button"
            onPointerEnter={() => { void preloadAdminSignupTermsCatalog().catch(() => {}); }}
            onFocus={() => { void preloadAdminSignupTermsCatalog().catch(() => {}); }}
            onClick={() => {
              void preloadAdminSignupTermsCatalog().catch(() => {});
              setActivePolicyTab('terms');
            }}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activePolicyTab === 'terms'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            이용약관 관리
          </button>
        </div>
      </div>

      {activePolicyTab === 'terms' ? (
        <AdminSignupTermsManager
          Button={Button}
          triggerConfirm={triggerConfirm}
          triggerToast={triggerToast}
        />
      ) : (
        <>
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

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">회원가입 약관 정책</h2>
              <p className="mt-1 text-xs text-slate-500">약관 적용 범위와 변경 후 재동의 방식을 설정합니다.</p>
            </div>

            <PolicySwitch
              checked={tempSignupTermsEnabled}
              label="회원가입 약관 사용"
              description="활성화하면 신규 회원은 이용약관 관리 탭에 등록된 현재 약관을 확인하고 동의해야 가입할 수 있습니다."
              onChange={setTempSignupTermsEnabled}
            />

            <PolicySwitch
              checked={tempSignupTermsRequireReconsentOnChange}
              disabled={!tempSignupTermsEnabled}
              label="약관 변경 시 기존 회원 재동의 요구"
              description="약관의 제목, 본문, 필수·선택 구분 또는 신규 활성 약관이 변경되면 기존 회원의 대여 기능을 재동의 전까지 제한합니다."
              onChange={setTempSignupTermsRequireReconsentOnChange}
            />

            <div className={`rounded-2xl border p-5 ${tempSignupTermsEnabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
              <h3 className="text-sm font-bold text-slate-900">최초 적용 대상</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">약관 기능을 처음 적용할 때 기존 가입자에게도 현재 약관 동의를 요구할지 선택합니다.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <input
                    type="radio"
                    name="terms-existing-scope"
                    disabled={!tempSignupTermsEnabled}
                    checked={!tempSignupTermsApplyToExistingMembers}
                    onChange={() => setTempSignupTermsApplyToExistingMembers(false)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">신규 회원부터 적용</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">기존 회원은 최초 도입 약관으로 즉시 차단하지 않습니다. 이후 재동의 대상 변경부터 적용됩니다.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <input
                    type="radio"
                    name="terms-existing-scope"
                    disabled={!tempSignupTermsEnabled}
                    checked={tempSignupTermsApplyToExistingMembers}
                    onChange={() => setTempSignupTermsApplyToExistingMembers(true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">기존 회원 포함</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">현재 약관 동의 기록이 없는 기존 회원도 다음 대여 기능 이용 전에 동의해야 합니다.</span>
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">기존 회원 명부 검사</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                기본 검증은 명부 버전이 변경된 사용자가 로그인할 때 본인 정보만 확인합니다. 필요한 경우 전체 회원을 수동으로 검사할 수 있습니다.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">
                  {memberDirectoryAudit?.completedAtText ? (
                    <>
                      최근 전체 검사: {memberDirectoryAudit.completedAtText} · 정상 {memberDirectoryAudit.normal || 0}명 · 정보 수정 필요 {memberDirectoryAudit.profileRequired || 0}명 · 중복 {memberDirectoryAudit.duplicates || 0}명
                    </>
                  ) : (
                    '아직 전체 회원 명부 검사를 실행하지 않았습니다.'
                  )}
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
            </div>
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

        </>
      )}
    </div>
  );
}
