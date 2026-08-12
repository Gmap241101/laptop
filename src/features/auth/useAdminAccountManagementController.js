import { useEffect, useState } from 'react';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishMemberAuthorityObservation } from '../members/memberAuthorityCutover.js';
import { publishAccountAuthObservation } from './accountAuthCutover.js';

export const ADMIN_CUSTOM_OPTION_VALUE = '__ADMIN_CUSTOM_INPUT__';
export const ADMIN_ACCOUNT_PAGE_SIZE = 10;

export const createDefaultAdminAccountForm = () => ({ adminLoginId: '', password: '', organizationName: '', customOrganizationName: '', userName: '', customUserName: '', email: '', phone: '', adminRole: 'admin' });
export const createDefaultAdminAccountEditForm = () => ({ adminLoginId: '', organizationName: '', userName: '', email: '', phone: '', adminRole: 'admin', newPassword: '', newPasswordConfirm: '' });

export const useAdminAccountManagementState = ({ adminTab }) => {
  const [adminAccountForm, setAdminAccountForm] = useState(createDefaultAdminAccountForm);
  const [adminAccountPage, setAdminAccountPage] = useState(1);
  const [editingAdminAccountId, setEditingAdminAccountId] = useState('');
  const [adminAccountEditForm, setAdminAccountEditForm] = useState(createDefaultAdminAccountEditForm);
  const [adminMyProfileForm, setAdminMyProfileForm] = useState(createDefaultAdminAccountEditForm);
  const [adminMyProfileSaving, setAdminMyProfileSaving] = useState(false);
  useEffect(() => {
    if (adminTab !== 'adminAccounts') return;
    setAdminAccountForm(createDefaultAdminAccountForm());
    setAdminAccountPage(1);
  }, [adminTab]);
  return { adminAccountEditForm, adminAccountForm, adminAccountPage, adminMyProfileForm, adminMyProfileSaving, editingAdminAccountId, setAdminAccountEditForm, setAdminAccountForm, setAdminAccountPage, setAdminMyProfileForm, setAdminMyProfileSaving, setEditingAdminAccountId };
};

const adminErrorMessage = (error) => {
  const code = String(error?.code || '');
  const map = {
    admin_owner_required: '최고 관리자만 이 작업을 수행할 수 있습니다.',
    last_owner_required: '마지막 최고 관리자 권한은 변경하거나 삭제할 수 없습니다.',
    admin_login_id_duplicate: '이미 등록된 관리자 ID입니다.',
    admin_email_duplicate: '이미 등록된 관리자 이메일입니다.',
    admin_clerk_email_duplicate: '이미 Clerk에 등록된 이메일입니다.',
    admin_clerk_password_too_short: '관리자 비밀번호는 8자 이상이어야 합니다.',
    admin_self_delete_forbidden: '현재 로그인 중인 관리자 계정은 삭제할 수 없습니다.',
    admin_self_lock_forbidden: '현재 로그인 중인 관리자 계정은 잠글 수 없습니다.',
    admin_account_locked: '잠긴 관리자 계정입니다.',
  };
  return map[code] || '관리자 계정 PostgreSQL/Clerk 처리에 실패했습니다.';
};

export default function useAdminAccountManagementController({
  adminAccountEditForm, adminAccountForm, adminAccountPage, adminMyProfileForm,
  authenticatedAdminAccount, authenticatedAdminId, currentAuthAdminAccount, dataBorrowers,
  editingAdminAccountId, registeredAdminAccounts, setAdminAccountEditForm, setAdminAccountForm,
  setAdminAccountPage, setAdminAccounts, setAdminMyProfileForm, setAdminMyProfileSaving,
  setCurrentAuthAdminAccount, setEditingAdminAccountId, triggerConfirm, triggerToast,
}) {
  useEffect(() => {
    if (!authenticatedAdminAccount) { setAdminMyProfileForm(createDefaultAdminAccountEditForm()); return; }
    setAdminMyProfileForm({ adminLoginId: authenticatedAdminAccount.adminLoginId || '', organizationName: authenticatedAdminAccount.organizationName || '', userName: authenticatedAdminAccount.userName || '', email: authenticatedAdminAccount.authEmail || authenticatedAdminAccount.email || '', phone: authenticatedAdminAccount.phone || '', adminRole: authenticatedAdminAccount.adminRole || 'admin', newPassword: '', newPasswordConfirm: '' });
  }, [authenticatedAdminAccount?.id, authenticatedAdminAccount?.adminLoginId, authenticatedAdminAccount?.organizationName, authenticatedAdminAccount?.userName, authenticatedAdminAccount?.authEmail, authenticatedAdminAccount?.email, authenticatedAdminAccount?.phone, authenticatedAdminAccount?.adminRole, setAdminMyProfileForm]);

  const refreshAdminAccounts = async () => {
    const payload = await clerkStagingClient.getAdminAccountsPostgresql();
    const accounts = payload?.adminAccounts?.accounts || [];
    setAdminAccounts(accounts);
    publishMemberAuthorityObservation({ adminRegistryRequested: true, adminRegistrySource: 'postgresql-admin-registry', adminRegistryCount: accounts.length, adminRegistryError: '' });
    return accounts;
  };

  const selectedAdminOrganizationName = adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE ? adminAccountForm.customOrganizationName.trim() : adminAccountForm.organizationName;
  const adminAccountUserOptions = (dataBorrowers || []).filter((borrower) => borrower.team === selectedAdminOrganizationName);
  const selectedAdminUserName = adminAccountForm.userName === ADMIN_CUSTOM_OPTION_VALUE || adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE ? adminAccountForm.customUserName.trim() : adminAccountForm.userName;
  const adminAccountTotalPages = Math.max(1, Math.ceil((registeredAdminAccounts || []).length / ADMIN_ACCOUNT_PAGE_SIZE));
  const safeAdminAccountPage = Math.min(adminAccountPage, adminAccountTotalPages);
  const paginatedAdminAccounts = (registeredAdminAccounts || []).slice((safeAdminAccountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE, safeAdminAccountPage * ADMIN_ACCOUNT_PAGE_SIZE);

  const registerAdminAccount = async () => {
    const input = { adminLoginId: adminAccountForm.adminLoginId.trim(), password: adminAccountForm.password, organizationName: selectedAdminOrganizationName.trim(), userName: selectedAdminUserName.trim(), email: adminAccountForm.email.trim(), phone: adminAccountForm.phone.trim(), adminRole: adminAccountForm.adminRole === 'owner' ? 'owner' : 'admin' };
    if (!input.adminLoginId || !input.email || !input.organizationName || !input.userName) { triggerToast('관리자 ID, 이메일, 조직명, 사용자명을 모두 입력해 주세요.', 'error'); return; }
    if (input.password.length < 8) { triggerToast('관리자 초기 비밀번호는 8자 이상이어야 합니다.', 'error'); return; }
    try {
      const payload = await clerkStagingClient.createAdminAccountPostgresql(input);
      const account = payload?.adminAccountMutation?.account;
      setAdminAccounts((prev) => [account, ...(prev || []).filter((item) => item.id !== account.id)]);
      setAdminAccountForm(createDefaultAdminAccountForm()); setAdminAccountPage(1);
      publishAccountAuthObservation({ adminClerkAuthRequested: true, adminAuthSource: 'clerk-postgresql', adminProvisionOperation: 'admin-create', adminProvisionTargetUid: account.id, adminProvisionClerkUserId: account.clerkUserId, adminAuthError: '' });
      triggerToast(`[${account.adminLoginId}] Clerk/PostgreSQL 관리자 계정이 등록되었습니다.`, 'success');
    } catch (error) { console.error('Admin account create error:', error); triggerToast(adminErrorMessage(error), 'error'); }
  };

  const startEditAdminAccount = (account) => { setEditingAdminAccountId(account.id); setAdminAccountEditForm({ adminLoginId: account.adminLoginId || '', organizationName: account.organizationName || '', userName: account.userName || '', email: account.authEmail || account.email || '', phone: account.phone || '', adminRole: account.adminRole || 'admin', newPassword: '', newPasswordConfirm: '' }); };
  const cancelEditAdminAccount = () => { setEditingAdminAccountId(''); setAdminAccountEditForm(createDefaultAdminAccountEditForm()); };

  const sendAdminAccountPasswordResetEmail = (account) => {
    triggerToast(`[${account?.adminLoginId || '관리자'}] 계정은 Clerk 비밀번호를 사용합니다. 해당 관리자가 로그인 화면의 비밀번호 재설정을 이용해 주세요.`, 'info');
  };

  const saveAdminAccountEdit = async (account) => {
    const nextPassword = adminAccountEditForm.newPassword || '';
    if (nextPassword && nextPassword !== (adminAccountEditForm.newPasswordConfirm || '')) { triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error'); return; }
    if (nextPassword && nextPassword.length < 8) { triggerToast('새 비밀번호는 8자 이상이어야 합니다.', 'error'); return; }
    try {
      const payload = await clerkStagingClient.updateAdminAccountPostgresql(account.id, { adminLoginId: adminAccountEditForm.adminLoginId.trim(), organizationName: adminAccountEditForm.organizationName.trim(), userName: adminAccountEditForm.userName.trim(), phone: adminAccountEditForm.phone.trim(), adminRole: adminAccountEditForm.adminRole === 'owner' ? 'owner' : 'admin', ...(nextPassword ? { newPassword: nextPassword } : {}) });
      const updated = payload?.adminAccountMutation?.account;
      setAdminAccounts((prev) => (prev || []).map((item) => item.id === account.id ? updated : item));
      if (currentAuthAdminAccount?.id === account.id) setCurrentAuthAdminAccount(updated);
      cancelEditAdminAccount();
      triggerToast(`[${updated.adminLoginId}] 관리자 정보가 Clerk/PostgreSQL에 저장되었습니다.`, 'success');
    } catch (error) { console.error('Admin account update error:', error); triggerToast(adminErrorMessage(error), 'error'); }
  };

  const deleteAdminAccount = (account) => {
    triggerConfirm('관리자 ID 삭제', `[${account.adminLoginId}] 관리자 권한과 연결된 Clerk 계정을 삭제합니다.`, async () => {
      try { await clerkStagingClient.deleteAdminAccountPostgresql(account.id); setAdminAccounts((prev) => (prev || []).filter((item) => item.id !== account.id)); if (editingAdminAccountId === account.id) cancelEditAdminAccount(); triggerToast(`[${account.adminLoginId}] 관리자 ID가 삭제되었습니다.`, 'success'); }
      catch (error) { console.error('Admin account delete error:', error); triggerToast(adminErrorMessage(error), 'error'); }
    });
  };

  const toggleAdminAccountLock = (account) => {
    const locked = Number(account.lockUntil || 0) > Date.now();
    triggerConfirm(`관리자 계정 ${locked ? '잠금 해제' : '수동 잠금'}`, `[${account.adminLoginId}] 관리자 계정을 ${locked ? '잠금 해제' : '잠금'}합니다.`, async () => {
      try { const payload = await clerkStagingClient.setAdminAccountLockPostgresql(account.id, !locked); const updated = payload?.adminAccountMutation?.account; setAdminAccounts((prev) => (prev || []).map((item) => item.id === account.id ? updated : item)); triggerToast(`[${account.adminLoginId}] 관리자 계정이 ${locked ? '잠금 해제' : '잠금'}되었습니다.`, 'success'); }
      catch (error) { console.error('Admin account lock error:', error); triggerToast(adminErrorMessage(error), 'error'); }
    });
  };

  const saveMyAdminProfile = async () => {
    if (!authenticatedAdminAccount?.id) { triggerToast('관리자 인증 후 내 정보를 수정할 수 있습니다.', 'error'); return; }
    setAdminMyProfileSaving(true);
    try {
      const nextPassword = adminMyProfileForm.newPassword || '';
      if (nextPassword && nextPassword !== (adminMyProfileForm.newPasswordConfirm || '')) { triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error'); return; }
      const payload = await clerkStagingClient.updateAdminAccountPostgresql(authenticatedAdminAccount.id, { adminLoginId: adminMyProfileForm.adminLoginId.trim(), organizationName: adminMyProfileForm.organizationName.trim(), userName: adminMyProfileForm.userName.trim(), phone: adminMyProfileForm.phone.trim(), adminRole: authenticatedAdminAccount.adminRole || 'admin', ...(nextPassword ? { newPassword: nextPassword } : {}) });
      const updated = payload?.adminAccountMutation?.account;
      setCurrentAuthAdminAccount(updated); setAdminAccounts((prev) => (prev || []).map((item) => item.id === updated.id ? updated : item)); setAdminMyProfileForm((prev) => ({ ...prev, newPassword: '', newPasswordConfirm: '' })); triggerToast('관리자 내 정보가 Clerk/PostgreSQL에 저장되었습니다.', 'success');
    } catch (error) { console.error('Admin profile update error:', error); triggerToast(adminErrorMessage(error), 'error'); }
    finally { setAdminMyProfileSaving(false); }
  };

  useEffect(() => { if (authenticatedAdminId) void refreshAdminAccounts().catch((error) => console.warn('Administrator account list refresh failed.', { code: error?.code })); }, [authenticatedAdminId]);

  return { adminAccountTotalPages, adminAccountUserOptions, cancelEditAdminAccount, deleteAdminAccount, paginatedAdminAccounts, registerAdminAccount, safeAdminAccountPage, saveAdminAccountEdit, saveMyAdminProfile, sendAdminAccountPasswordResetEmail, startEditAdminAccount, toggleAdminAccountLock };
}
