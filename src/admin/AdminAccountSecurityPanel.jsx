import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Info,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
import {
  normalizeSystemAdminSettings,
  normalizeUserSessionPolicy,
} from '../utils/systemSettings.js';

const getAdminRole = (account) => account?.adminRole || 'owner';
const getAdminDisplayName = (account) =>
  account?.userName ||
  account?.adminLoginId ||
  account?.authEmail ||
  account?.id ||
  '관리자';

function ToggleSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? 'bg-[var(--mk-orange)]' : 'bg-slate-300'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-black text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="divide-y divide-slate-100 px-5">{children}</div>
    </section>
  );
}

function SettingRow({ title, description, control }) {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">{control}</div>
    </div>
  );
}

function NumberControl({ value, onChange, min, max, unit, disabled, zeroLabel = '' }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-24 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-bold text-slate-900 outline-none transition focus:border-[var(--mk-orange)] focus:ring-4 focus:ring-[var(--mk-orange-ring)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
      <span className="min-w-8 text-xs font-semibold text-slate-600">{unit}</span>
      {zeroLabel ? (
        <span className="hidden whitespace-nowrap text-[11px] text-slate-400 xl:inline">
          {zeroLabel}
        </span>
      ) : null}
    </div>
  );
}

export default function AdminAccountSecurityPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    authenticatedAdminAccount,
    rebaseAdminAuthenticatedSession,
    setSystemAdminSettings,
    setUserSessionPolicy,
    systemAdminSettings,
    systemAdminSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    triggerToast,
    userSessionPolicy,
    userSessionPolicyLoadErrorMessage,
    userSessionPolicyReady,
  } = ctx;

  const isOwner = getAdminRole(authenticatedAdminAccount) === 'owner';
  const normalizedAdmin = useMemo(
    () => normalizeSystemAdminSettings(systemAdminSettings),
    [systemAdminSettings]
  );
  const normalizedUser = useMemo(
    () => normalizeUserSessionPolicy(userSessionPolicy),
    [userSessionPolicy]
  );

  const [adminDraft, setAdminDraft] = useState(normalizedAdmin);
  const [userDraft, setUserDraft] = useState(normalizedUser);
  const [saving, setSaving] = useState(false);
  const [deviceTrustState, setDeviceTrustState] = useState({
    ready: false,
    configured: false,
    enabled: null,
    errorCode: '',
  });
  const [deviceTrustDraft, setDeviceTrustDraft] = useState(false);
  const [savingDeviceTrust, setSavingDeviceTrust] = useState(false);

  useEffect(() => {
    setAdminDraft(normalizedAdmin);
  }, [normalizedAdmin]);

  useEffect(() => {
    setUserDraft(normalizedUser);
  }, [normalizedUser]);

  useEffect(() => {
    let cancelled = false;
    setDeviceTrustState({
      ready: false,
      configured: false,
      enabled: null,
      errorCode: '',
    });

    void clerkStagingClient
      .getAdminClerkDeviceTrust()
      .then((payload) => {
        if (cancelled) return;
        const state = payload?.clerkDeviceTrust || {};
        const enabled = typeof state.enabled === 'boolean' ? state.enabled : null;
        setDeviceTrustState({
          ready: true,
          configured: Boolean(state.configured),
          enabled,
          errorCode: '',
        });
        if (enabled !== null) setDeviceTrustDraft(enabled);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Clerk Device Trust settings read error:', error);
        setDeviceTrustState({
          ready: true,
          configured: false,
          enabled: null,
          errorCode: error?.code || error?.name || 'clerk_device_trust_read_failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authenticatedAdminAccount?.id]);

  const adminPolicyChanged =
    Boolean(adminDraft.adminLogoutOnBrowserClose) !==
      Boolean(normalizedAdmin.adminLogoutOnBrowserClose) ||
    Number(adminDraft.adminIdleTimeoutMinutes) !==
      Number(normalizedAdmin.adminIdleTimeoutMinutes) ||
    Number(adminDraft.adminAbsoluteTimeoutHours) !==
      Number(normalizedAdmin.adminAbsoluteTimeoutHours);

  const userPolicyChanged =
    Boolean(userDraft.userLogoutOnBrowserClose) !==
      Boolean(normalizedUser.userLogoutOnBrowserClose) ||
    Number(userDraft.userIdleTimeoutMinutes) !==
      Number(normalizedUser.userIdleTimeoutMinutes) ||
    Number(userDraft.userAbsoluteTimeoutHours) !==
      Number(normalizedUser.userAbsoluteTimeoutHours);

  const dirty = adminPolicyChanged || userPolicyChanged;
  const deviceTrustChanged =
    deviceTrustState.ready &&
    deviceTrustState.configured &&
    typeof deviceTrustState.enabled === 'boolean' &&
    deviceTrustDraft !== deviceTrustState.enabled;
  const ready = systemAdminSettingsReady && userSessionPolicyReady;
  const loadError =
    systemAdminSettingsLoadErrorMessage || userSessionPolicyLoadErrorMessage;

  const resetDrafts = () => {
    setAdminDraft(normalizedAdmin);
    setUserDraft(normalizedUser);
  };

  const saveSecuritySettings = async () => {
    if (!isOwner) {
      triggerToast('최고 관리자만 계정 보안 설정을 변경할 수 있습니다.', 'error');
      return;
    }

    const numericInputs = [
      ['관리자 무활동 자동 로그아웃', adminDraft.adminIdleTimeoutMinutes, 15, 480],
      ['관리자 1회 로그인 최대 유지시간', adminDraft.adminAbsoluteTimeoutHours, 0, 168],
      ['사용자 무활동 자동 로그아웃', userDraft.userIdleTimeoutMinutes, 15, 1440],
      ['사용자 1회 로그인 최대 유지시간', userDraft.userAbsoluteTimeoutHours, 0, 168],
    ];
    for (const [label, rawValue, min, max] of numericInputs) {
      const value = Number(rawValue);
      if (
        String(rawValue).trim() === '' ||
        !Number.isInteger(value) ||
        value < min ||
        value > max
      ) {
        triggerToast(`${label}은(는) ${min}~${max} 범위의 정수로 입력해 주세요.`, 'error');
        return;
      }
    }

    const nextAdmin = normalizeSystemAdminSettings(adminDraft);
    const nextUser = normalizeUserSessionPolicy(userDraft);
    const changedAdmin =
      nextAdmin.adminLogoutOnBrowserClose !==
        normalizedAdmin.adminLogoutOnBrowserClose ||
      nextAdmin.adminIdleTimeoutMinutes !==
        normalizedAdmin.adminIdleTimeoutMinutes ||
      nextAdmin.adminAbsoluteTimeoutHours !==
        normalizedAdmin.adminAbsoluteTimeoutHours;
    const changedUser =
      nextUser.userLogoutOnBrowserClose !==
        normalizedUser.userLogoutOnBrowserClose ||
      nextUser.userIdleTimeoutMinutes !== normalizedUser.userIdleTimeoutMinutes ||
      nextUser.userAbsoluteTimeoutHours !==
        normalizedUser.userAbsoluteTimeoutHours;

    if (!changedAdmin && !changedUser) return;

    const nextAdminPolicy = {
      ...nextAdmin,
      adminSecurityPolicyVersion: changedAdmin
        ? normalizedAdmin.adminSecurityPolicyVersion + 1
        : normalizedAdmin.adminSecurityPolicyVersion,
    };
    const nextUserPolicy = {
      ...nextUser,
      userSecurityPolicyVersion: changedUser
        ? normalizedUser.userSecurityPolicyVersion + 1
        : normalizedUser.userSecurityPolicyVersion,
    };

    setSaving(true);
    try {
      const [adminWriteResult, userWriteResult] = await Promise.all([
        changedAdmin
          ? clerkStagingClient.saveAdminSystemConfiguration('admin-security', nextAdminPolicy)
          : Promise.resolve(null),
        changedUser
          ? clerkStagingClient.saveAdminSystemConfiguration('user-session-policy', nextUserPolicy)
          : Promise.resolve(null),
      ]);

      if (changedAdmin) {
        const savedAdminPolicy = normalizeSystemAdminSettings(
          adminWriteResult?.systemConfiguration?.payload || nextAdminPolicy
        );
        rebaseAdminAuthenticatedSession(savedAdminPolicy);
        setSystemAdminSettings(savedAdminPolicy);
        setAdminDraft(savedAdminPolicy);
      }

      if (changedUser) {
        const savedUserPolicy = normalizeUserSessionPolicy(
          userWriteResult?.systemConfiguration?.payload || nextUserPolicy
        );
        setUserSessionPolicy(savedUserPolicy);
        setUserDraft(savedUserPolicy);
      }

      let auditWriteError = null;
      try {
        await clerkStagingClient.appendAdminSystemSettingsAudit({
          action: 'account-security-settings-update',
          section: '계정 보안 설정',
          summary: '관리자 및 일반 사용자 세션 유지·만료 정책을 변경했습니다.',
          beforeValues: {
            ...(changedAdmin ? { adminSecurity: normalizedAdmin } : {}),
            ...(changedUser ? { userSessionPolicy: normalizedUser } : {}),
          },
          afterValues: {
            ...(changedAdmin ? { adminSecurity: nextAdminPolicy } : {}),
            ...(changedUser ? { userSessionPolicy: nextUserPolicy } : {}),
          },
        });
      } catch (error) {
        auditWriteError = error;
        console.error('Account security settings audit write error:', error);
      }

      if (auditWriteError) {
        triggerToast(
          `계정 보안 설정은 성공적으로 저장 및 반영되었지만 변경 이력 기록에 실패했습니다. 오류 코드: ${auditWriteError?.code || auditWriteError?.name || 'system_settings_audit_write_failed'}`,
          'error'
        );
      } else {
        triggerToast(
          '계정 보안 설정이 성공적으로 저장 및 반영되었습니다. 다른 기존 로그인 세션에는 새 정책 버전이 적용됩니다.',
          'success'
        );
      }
    } catch (error) {
      console.error('PostgreSQL account security settings save error:', error);
      triggerToast(`계정 보안 설정을 PostgreSQL에 저장하지 못했습니다. 오류 코드: ${error?.code || error?.name || 'account_security_settings_save_failed'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveDeviceTrustSetting = async () => {
    if (!isOwner) {
      triggerToast('최고 관리자만 새 기기 로그인 인증 설정을 변경할 수 있습니다.', 'error');
      return;
    }
    if (!deviceTrustState.configured) {
      triggerToast(
        'Clerk Platform API 연동이 필요합니다. 오류 코드: clerk_platform_config_not_configured',
        'error',
      );
      return;
    }
    if (!deviceTrustChanged) return;

    const previousEnabled = Boolean(deviceTrustState.enabled);
    setSavingDeviceTrust(true);
    try {
      const payload = await clerkStagingClient.saveAdminClerkDeviceTrust(
        Boolean(deviceTrustDraft),
      );
      const savedState = payload?.clerkDeviceTrust || {};
      const enabled = Boolean(savedState.enabled);
      setDeviceTrustState({
        ready: true,
        configured: true,
        enabled,
        errorCode: '',
      });
      setDeviceTrustDraft(enabled);

      let auditWriteError = null;
      try {
        await clerkStagingClient.appendAdminSystemSettingsAudit({
          action: 'device-trust-settings-update',
          section: '계정 보안 설정',
          summary: `새 기기 로그인 이메일 인증을 ${enabled ? '사용' : '사용 안 함'}으로 변경했습니다.`,
          beforeValues: {
            deviceTrustEmailVerificationEnabled: previousEnabled,
          },
          afterValues: {
            deviceTrustEmailVerificationEnabled: enabled,
          },
        });
      } catch (error) {
        auditWriteError = error;
        console.error('Device Trust settings audit write error:', error);
      }

      if (auditWriteError) {
        triggerToast(
          `새 기기 로그인 이메일 인증 설정은 성공적으로 저장 및 반영되었지만 변경 이력 기록에 실패했습니다. 오류 코드: ${auditWriteError?.code || auditWriteError?.name || 'system_settings_audit_write_failed'}`,
          'error',
        );
      } else {
        triggerToast(
          '새 기기 로그인 이메일 인증 설정이 성공적으로 저장 및 반영되었습니다.',
          'success',
        );
      }
    } catch (error) {
      console.error('Clerk Device Trust settings save error:', error);
      setDeviceTrustDraft(previousEnabled);
      triggerToast(
        `새 기기 로그인 이메일 인증 설정을 Clerk에 반영하지 못했습니다. 기존 설정은 유지됩니다. 오류 코드: ${error?.code || error?.name || 'clerk_device_trust_write_failed'}`,
        'error',
      );
    } finally {
      setSavingDeviceTrust(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="계정 보안 설정"
        description="관리자와 일반 사용자의 로그인 지속성, 무활동 만료 및 최대 세션시간을 관리합니다."
        badge={
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
            <ShieldCheck size={14} />
            {isOwner ? '최고 관리자 설정 가능' : '읽기 전용'}
          </span>
        }
      />

      {!isOwner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
          계정 보안 정책은 최고 관리자만 변경할 수 있습니다. 현재 값은 읽기 전용으로 표시됩니다.
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800">
          {loadError}
        </div>
      ) : null}

      {!ready ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
          계정 보안 설정을 불러오는 중입니다.
        </div>
      ) : (
        <>
          <SectionCard
            title="관리자 세션"
            description="관리자 화면은 일반 사용자보다 짧은 세션을 권장합니다. 최대 유지시간 0은 절대 만료 제한을 적용하지 않는다는 뜻입니다."
          >
            <SettingRow
              title="브라우저·탭 종료 시 로그아웃"
              description="브라우저 탭이나 창을 닫으면 Clerk 관리자 세션과 애플리케이션 세션을 유지하지 않습니다."
              control={
                <ToggleSwitch
                  label="관리자 브라우저 종료 시 로그아웃"
                  checked={Boolean(adminDraft.adminLogoutOnBrowserClose)}
                  disabled={!isOwner}
                  onChange={(value) =>
                    setAdminDraft((current) => ({
                      ...current,
                      adminLogoutOnBrowserClose: value,
                    }))
                  }
                />
              }
            />
            <SettingRow
              title="무활동 자동 로그아웃"
              description="마지막 관리자 활동 이후 설정 시간이 지나면 자동 로그아웃합니다."
              control={
                <NumberControl
                  min={15}
                  max={480}
                  unit="분"
                  value={adminDraft.adminIdleTimeoutMinutes}
                  disabled={!isOwner}
                  onChange={(value) =>
                    setAdminDraft((current) => ({
                      ...current,
                      adminIdleTimeoutMinutes: value,
                    }))
                  }
                />
              }
            />
            <SettingRow
              title="1회 로그인 최대 유지시간"
              description="계속 사용 중이어도 최초 로그인부터 설정 시간이 지나면 종료합니다. * 0 = 제한 없음"
              control={
                <NumberControl
                  min={0}
                  max={168}
                  unit="시간"
                  value={adminDraft.adminAbsoluteTimeoutHours}
                  disabled={!isOwner}
                  onChange={(value) =>
                    setAdminDraft((current) => ({
                      ...current,
                      adminAbsoluteTimeoutHours: value,
                    }))
                  }
                />
              }
            />
            <SettingRow
              title="관리자 정책 버전"
              description="세션 정책이 바뀌면 버전이 증가하고 기존 관리자 세션을 다시 인증하게 합니다."
              control={
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                  v{normalizedAdmin.adminSecurityPolicyVersion}
                </span>
              }
            />
          </SectionCard>

          <SectionCard
            title="사용자 세션"
            description="일반 사용자 로그인에도 관리자와 동일한 세션 기준을 적용합니다."
          >
            <SettingRow
              title="브라우저·탭 종료 시 로그아웃"
              description="브라우저 탭이나 창을 닫으면 사용자 로그인 상태를 유지하지 않습니다."
              control={
                <ToggleSwitch
                  label="사용자 브라우저 종료 시 로그아웃"
                  checked={Boolean(userDraft.userLogoutOnBrowserClose)}
                  disabled={!isOwner}
                  onChange={(value) =>
                    setUserDraft((current) => ({
                      ...current,
                      userLogoutOnBrowserClose: value,
                    }))
                  }
                />
              }
            />
            <SettingRow
              title="무활동 자동 로그아웃"
              description="마지막 사용자 활동 이후 설정 시간이 지나면 자동 로그아웃합니다."
              control={
                <NumberControl
                  min={15}
                  max={1440}
                  unit="분"
                  value={userDraft.userIdleTimeoutMinutes}
                  disabled={!isOwner}
                  onChange={(value) =>
                    setUserDraft((current) => ({
                      ...current,
                      userIdleTimeoutMinutes: value,
                    }))
                  }
                />
              }
            />
            <SettingRow
              title="1회 로그인 최대 유지시간"
              description="계속 사용 중이어도 최초 로그인부터 설정 시간이 지나면 종료합니다. * 0 = 제한 없음"
              control={
                <NumberControl
                  min={0}
                  max={168}
                  unit="시간"
                  value={userDraft.userAbsoluteTimeoutHours}
                  disabled={!isOwner}
                  onChange={(value) =>
                    setUserDraft((current) => ({
                      ...current,
                      userAbsoluteTimeoutHours: value,
                    }))
                  }
                />
              }
            />
            <SettingRow
              title="사용자 정책 버전"
              description="세션 정책이 바뀌면 버전이 증가하고 기존 사용자 세션을 다시 로그인하게 합니다."
              control={
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                  v{normalizedUser.userSecurityPolicyVersion}
                </span>
              }
            />
          </SectionCard>

          <SectionCard
            title="새 기기 로그인 인증"
            description="사용자와 관리자 모두 새로운 기기에서 로그인할 때 이메일 인증코드를 추가 확인할지 설정합니다. 저장하면 Clerk Device Trust에 즉시 반영됩니다."
          >
            <SettingRow
              title="새로운 기기에서 이메일 인증 사용"
              description="예: 새 기기 로그인 시 6자리 이메일 인증코드를 추가 확인합니다. 아니오: 이메일과 비밀번호 인증 후 별도의 새 기기 인증코드를 요구하지 않습니다."
              control={
                <>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    !deviceTrustState.ready
                      ? 'bg-slate-100 text-slate-500'
                      : deviceTrustState.configured
                        ? deviceTrustDraft
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-700'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {!deviceTrustState.ready
                      ? '확인 중'
                      : deviceTrustState.configured
                        ? deviceTrustDraft
                          ? '예'
                          : '아니오'
                        : '연동 필요'}
                  </span>
                  <ToggleSwitch
                    label="새 기기 로그인 이메일 인증 사용"
                    checked={Boolean(deviceTrustDraft)}
                    disabled={
                      !isOwner ||
                      !deviceTrustState.ready ||
                      !deviceTrustState.configured ||
                      savingDeviceTrust
                    }
                    onChange={setDeviceTrustDraft}
                  />
                </>
              }
            />
            {!deviceTrustState.configured && deviceTrustState.ready ? (
              <div className="py-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  Clerk Platform API 연동이 필요합니다. Heroku 서버에 CLERK_PLATFORM_API_KEY, CLERK_APPLICATION_ID, CLERK_INSTANCE_ID를 설정하면 이 화면에서 실제 Clerk Device Trust를 변경할 수 있습니다.
                  {deviceTrustState.errorCode ? ` 오류 코드: ${deviceTrustState.errorCode}` : ''}
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={!deviceTrustChanged || savingDeviceTrust}
                onClick={() => setDeviceTrustDraft(Boolean(deviceTrustState.enabled))}
              >
                변경 취소
              </Button>
              <Button
                type="button"
                disabled={!isOwner || !deviceTrustChanged || savingDeviceTrust}
                onClick={saveDeviceTrustSetting}
              >
                <Save size={14} />
                {savingDeviceTrust ? 'Clerk 반영 중' : '새 기기 로그인 인증 설정 저장'}
              </Button>
            </div>
          </SectionCard>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
              <div>
                <div className="text-sm font-bold text-emerald-900">
                  Clerk 인증 보호 사용
                </div>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  클라이언트가 자체적으로 실패 횟수를 기록하는 계정 잠금은 사용하지 않습니다. 로그인 오류 통합 표시와 비밀번호 재설정 계정 존재 은폐는 앱에 적용되어 있습니다.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <Info className="mt-0.5 shrink-0 text-sky-600" size={18} />
              <p className="text-xs leading-5 text-sky-800">
                새 기기 로그인 인증은 Clerk Device Trust에 직접 반영되고, 애플리케이션 세션 시간과 잠금 정책은 PostgreSQL 시스템 설정에서 관리합니다.
              </p>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || saving}
              onClick={resetDrafts}
            >
              변경 취소
            </Button>
            <Button
              type="button"
              disabled={!isOwner || !dirty || saving}
              onClick={saveSecuritySettings}
            >
              <Save size={14} />
              {saving ? '저장 중' : '계정 보안 설정 저장'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
