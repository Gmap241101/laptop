import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  ADMIN_ACCOUNTS_COLLECTION_REF,
  adminAccountCreationAuth,
  db,
  firebaseAuth,
} from '../../firebase.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishMemberAuthorityObservation, readMemberAuthorityCutoverConfig } from '../members/memberAuthorityCutover.js';

export const ADMIN_CUSTOM_OPTION_VALUE = '__ADMIN_CUSTOM_INPUT__';
export const ADMIN_ACCOUNT_PAGE_SIZE = 10;

export const createDefaultAdminAccountForm = () => ({
  adminLoginId: '',
  password: '',
  organizationName: '',
  customOrganizationName: '',
  userName: '',
  customUserName: '',
  email: '',
  phone: '',
  adminRole: 'admin',
});

export const createDefaultAdminAccountEditForm = () => ({
  adminLoginId: '',
  organizationName: '',
  userName: '',
  email: '',
  phone: '',
  adminRole: 'admin',
  newPassword: '',
  newPasswordConfirm: '',
});

export const useAdminAccountManagementState = ({ adminTab }) => {
  const [adminAccountForm, setAdminAccountForm] = useState(
    createDefaultAdminAccountForm
  );
  const [adminAccountPage, setAdminAccountPage] = useState(1);
  const [editingAdminAccountId, setEditingAdminAccountId] = useState('');
  const [adminAccountEditForm, setAdminAccountEditForm] = useState(
    createDefaultAdminAccountEditForm
  );
  const [adminMyProfileForm, setAdminMyProfileForm] = useState(
    createDefaultAdminAccountEditForm
  );
  const [adminMyProfileSaving, setAdminMyProfileSaving] = useState(false);

  useEffect(() => {
    if (adminTab !== 'adminAccounts') return;

    setAdminAccountForm(createDefaultAdminAccountForm());
    setAdminAccountPage(1);
  }, [adminTab]);

  return {
    adminAccountEditForm,
    adminAccountForm,
    adminAccountPage,
    adminMyProfileForm,
    adminMyProfileSaving,
    editingAdminAccountId,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    setAdminMyProfileForm,
    setAdminMyProfileSaving,
    setEditingAdminAccountId,
  };
};

export default function useAdminAccountManagementController({
  adminAccountEditForm,
  adminAccountForm,
  adminAccountPage,
  adminMyProfileForm,
  authenticatedAdminAccount,
  authenticatedAdminId,
  currentAuthAdminAccount,
  dataBorrowers,
  editingAdminAccountId,
  firebaseAuthUser,
  getAdminFirebaseAuthErrorMessage,
  registeredAdminAccounts,
  setAdminAccountEditForm,
  setAdminAccountForm,
  setAdminAccountPage,
  setAdminAccounts,
  setAdminMyProfileForm,
  setAdminMyProfileSaving,
  setCurrentAuthAdminAccount,
  setEditingAdminAccountId,
  triggerConfirm,
  triggerToast,
}) {
  useEffect(() => {
    if (!authenticatedAdminAccount) {
      setAdminMyProfileForm(createDefaultAdminAccountEditForm());
      return;
    }

    setAdminMyProfileForm({
      adminLoginId: authenticatedAdminAccount.adminLoginId || '',
      organizationName: authenticatedAdminAccount.organizationName || '',
      userName: authenticatedAdminAccount.userName || '',
      email:
        authenticatedAdminAccount.authEmail ||
        authenticatedAdminAccount.email ||
        '',
      phone: authenticatedAdminAccount.phone || '',
      newPassword: '',
      newPasswordConfirm: '',
    });
  }, [
    authenticatedAdminAccount?.id,
    authenticatedAdminAccount?.adminLoginId,
    authenticatedAdminAccount?.organizationName,
    authenticatedAdminAccount?.userName,
    authenticatedAdminAccount?.authEmail,
    authenticatedAdminAccount?.email,
    authenticatedAdminAccount?.phone,
    setAdminMyProfileForm,
  ]);

  useEffect(() => {
    const config = readMemberAuthorityCutoverConfig();
    if (!config.adminRegistryRequested) return undefined;
    if (!authenticatedAdminAccount?.id || !firebaseAuthUser || typeof firebaseAuthUser.getIdToken !== 'function') return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        const firebaseIdToken = await firebaseAuthUser.getIdToken();
        const payload = await clerkStagingClient.bootstrapAdminIdentityRegistry(firebaseIdToken);
        if (cancelled) return;
        publishMemberAuthorityObservation({
          memberWriteRequested: config.memberRequested,
          restrictionWriteRequested: config.restrictionRequested,
          adminRegistryRequested: true,
          adminRegistrySource: payload?.adminIdentityRegistry?.target || 'postgresql-admin-registry',
          adminRegistryCount: Number(payload?.adminIdentityRegistry?.count || 0),
          adminRegistryError: '',
        });
      } catch (error) {
        if (cancelled) return;
        publishMemberAuthorityObservation({
          memberWriteRequested: config.memberRequested,
          restrictionWriteRequested: config.restrictionRequested,
          adminRegistryRequested: true,
          adminRegistrySource: 'failed',
          adminRegistryCount: 0,
          adminRegistryError: error?.code || error?.message || 'admin-identity-registry-failed',
        });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [authenticatedAdminAccount?.id, firebaseAuthUser?.uid]);

  const syncAdminIdentityRegistryIfRequested = async () => {
    const config = readMemberAuthorityCutoverConfig();
    if (!config.adminRegistryRequested || !firebaseAuthUser || typeof firebaseAuthUser.getIdToken !== 'function') return;
    try {
      const firebaseIdToken = await firebaseAuthUser.getIdToken();
      const payload = await clerkStagingClient.bootstrapAdminIdentityRegistry(firebaseIdToken);
      publishMemberAuthorityObservation({
        memberWriteRequested: config.memberRequested,
        restrictionWriteRequested: config.restrictionRequested,
        adminRegistryRequested: true,
        adminRegistrySource: payload?.adminIdentityRegistry?.target || 'postgresql-admin-registry',
        adminRegistryCount: Number(payload?.adminIdentityRegistry?.count || 0),
        adminRegistryError: '',
      });
    } catch (error) {
      console.warn('Admin identity registry synchronization failed.', { code: error?.code, status: error?.status });
      publishMemberAuthorityObservation({
        adminRegistryRequested: true,
        adminRegistrySource: 'failed',
        adminRegistryCount: 0,
        adminRegistryError: error?.code || error?.message || 'admin-identity-registry-failed',
      });
    }
  };

  const selectedAdminOrganizationName =
    adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE
      ? adminAccountForm.customOrganizationName.trim()
      : adminAccountForm.organizationName;

  const adminAccountUserOptions = (dataBorrowers || []).filter(
    (borrower) => borrower.team === selectedAdminOrganizationName
  );

  const selectedAdminUserName =
    adminAccountForm.userName === ADMIN_CUSTOM_OPTION_VALUE ||
    adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE
      ? adminAccountForm.customUserName.trim()
      : adminAccountForm.userName;

  const adminAccountTotalPages = Math.max(
    1,
    Math.ceil((registeredAdminAccounts || []).length / ADMIN_ACCOUNT_PAGE_SIZE)
  );

  const safeAdminAccountPage = Math.min(
    adminAccountPage,
    adminAccountTotalPages
  );

  const paginatedAdminAccounts = (registeredAdminAccounts || []).slice(
    (safeAdminAccountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE,
    safeAdminAccountPage * ADMIN_ACCOUNT_PAGE_SIZE
  );

  const registerAdminAccount = async () => {
    const adminLoginId = adminAccountForm.adminLoginId.trim();
    const password = adminAccountForm.password;
    const organizationName = selectedAdminOrganizationName;
    const userName = selectedAdminUserName;
    const email = adminAccountForm.email.trim();
    const phone = adminAccountForm.phone.trim();
    const adminRole = adminAccountForm.adminRole === 'owner' ? 'owner' : 'admin';

    if (!adminLoginId) {
      triggerToast('관리자 ID를 입력해 주세요.', 'error');
      return;
    }

    if (!email) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('초기 비밀번호를 입력해 주세요.', 'error');
      return;
    }

    if (password.length < 6) {
      triggerToast('초기 비밀번호는 6자 이상으로 입력해 주세요.', 'error');
      return;
    }

    if (!organizationName) {
      triggerToast('조직명을 선택하거나 직접 입력해 주세요.', 'error');
      return;
    }

    if (!userName) {
      triggerToast('사용자명을 선택하거나 직접 입력해 주세요.', 'error');
      return;
    }

    if (
      adminRole === 'owner' &&
      (authenticatedAdminAccount?.adminRole || 'owner') !== 'owner'
    ) {
      triggerToast('최고 관리자만 다른 최고 관리자 계정을 등록할 수 있습니다.', 'error');
      return;
    }

    const duplicatedAdminId = (registeredAdminAccounts || []).some(
      (account) =>
        String(account.adminLoginId || '').trim().toLowerCase() ===
        adminLoginId.toLowerCase()
    );

    if (duplicatedAdminId) {
      triggerToast('이미 등록된 관리자 ID입니다.', 'error');
      return;
    }

    const duplicatedAdminEmail = (registeredAdminAccounts || []).some((account) => {
      const accountEmail = String(account.email || '').trim().toLowerCase();
      const accountAuthEmail = String(account.authEmail || '').trim().toLowerCase();

      return (
        accountEmail === email.toLowerCase() ||
        accountAuthEmail === email.toLowerCase()
      );
    });

    if (duplicatedAdminEmail) {
      triggerToast('이미 등록된 관리자 로그인 이메일입니다.', 'error');
      return;
    }

    let createdAdminUser = null;

    try {
      const nowText = new Date().toLocaleString('ko-KR');

      const credential = await createUserWithEmailAndPassword(
        adminAccountCreationAuth,
        email,
        password
      );

      createdAdminUser = credential.user;

      await updateProfile(credential.user, {
        displayName: userName || adminLoginId,
      });

      const nextAdminAccount = {
        id: credential.user.uid,
        adminLoginId,
        authUid: credential.user.uid,
        authEmail: email,
        authProvider: 'firebase-auth',
        authLinkedAt: nowText,
        passwordHash: '',
        passwordSalt: '',
        passwordHashAlgorithm: 'Firebase Auth',
        passwordHashIterations: 0,
        failedLoginCount: 0,
        lockUntil: 0,
        lastLoginAt: '',
        passwordChangedAt: nowText,
        organizationName,
        userName,
        email,
        phone,
        adminRole,
        createdAt: nowText,
        updatedAt: nowText,
      };

      await setDoc(doc(db, 'adminAccounts', credential.user.uid), {
        ...nextAdminAccount,
        syncedAt: serverTimestamp(),
      });
      await syncAdminIdentityRegistryIfRequested();

      await signOut(adminAccountCreationAuth).catch((error) => {
        console.error('Secondary admin auth sign-out error:', error);
      });

      setAdminAccounts((prev) => [
        nextAdminAccount,
        ...(prev || []).filter(
          (account) => account.id !== nextAdminAccount.id
        ),
      ]);

      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);

      triggerToast(
        `[${adminLoginId}] Firebase Auth 관리자 계정이 등록되었습니다.`,
        'success'
      );
    } catch (error) {
      if (createdAdminUser) {
        await deleteUser(createdAdminUser).catch((rollbackError) => {
          console.error('Admin Auth rollback error:', rollbackError);
        });
      }

      await signOut(adminAccountCreationAuth).catch(() => {});

      console.error('Admin Firebase Auth account creation error:', error);
      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    }
  };

  const startEditAdminAccount = (account) => {
    setEditingAdminAccountId(account.id);
    setAdminAccountEditForm({
      adminLoginId: account.adminLoginId || '',
      organizationName: account.organizationName || '',
      userName: account.userName || '',
      email: account.authEmail || account.email || '',
      phone: account.phone || '',
      adminRole: ['owner', 'admin'].includes(account.adminRole) ? account.adminRole : 'owner',
      newPassword: '',
      newPasswordConfirm: '',
    });
  };

  const cancelEditAdminAccount = () => {
    setEditingAdminAccountId('');
    setAdminAccountEditForm(createDefaultAdminAccountEditForm());
  };

  const sendAdminAccountPasswordResetEmail = async (account) => {
    const email = String(account.authEmail || account.email || '').trim();

    if (!account.authUid) {
      triggerToast('기존 해시 계정은 수정 화면의 새 비밀번호 입력으로 직접 변경할 수 있습니다.', 'error');
      return;
    }

    if (!email) {
      triggerToast('비밀번호 재설정 메일을 보낼 관리자 이메일이 없습니다.', 'error');
      return;
    }

    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      triggerToast(`[${account.adminLoginId}] 관리자에게 비밀번호 재설정 메일을 발송했습니다.`, 'success');
    } catch (error) {
      console.error('Admin password reset email error:', error);
      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    }
  };

  const saveAdminAccountEdit = async (account) => {
    const adminLoginId = adminAccountEditForm.adminLoginId.trim();
    const organizationName = adminAccountEditForm.organizationName.trim();
    const userName = adminAccountEditForm.userName.trim();
    const phone = adminAccountEditForm.phone.trim();
    const adminRole = adminAccountEditForm.adminRole === 'owner' ? 'owner' : 'admin';
    const email = String(account.authEmail || account.email || '').trim();

    const newPassword = adminAccountEditForm.newPassword || '';
    const newPasswordConfirm = adminAccountEditForm.newPasswordConfirm || '';
    const shouldChangePassword = Boolean(newPassword || newPasswordConfirm);

    if (!account.id || !account.authUid || account.id !== account.authUid) {
      triggerToast(
        '관리자 UID 문서 구조가 올바르지 않습니다. 문서 ID와 authUid가 같은지 확인해 주세요.',
        'error'
      );
      return;
    }

    if (!adminLoginId) {
      triggerToast('관리자 ID를 입력해 주세요.', 'error');
      return;
    }

    if (!organizationName) {
      triggerToast('조직명을 입력해 주세요.', 'error');
      return;
    }

    if (!userName) {
      triggerToast('사용자명을 입력해 주세요.', 'error');
      return;
    }

    if (!email) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (
      adminRole !== (account.adminRole || 'owner') &&
      (authenticatedAdminAccount?.adminRole || 'owner') !== 'owner'
    ) {
      triggerToast('최고 관리자만 관리자 권한 등급을 변경할 수 있습니다.', 'error');
      return;
    }

    if (
      (account.adminRole || 'owner') === 'owner' &&
      adminRole !== 'owner' &&
      (registeredAdminAccounts || []).filter((item) => (item.adminRole || 'owner') === 'owner').length <= 1
    ) {
      triggerToast('마지막 최고 관리자 권한은 변경할 수 없습니다.', 'error');
      return;
    }

    if (shouldChangePassword) {
      if (newPassword.length < 6) {
        triggerToast('새 비밀번호는 6자 이상으로 입력해 주세요.', 'error');
        return;
      }

      if (newPassword !== newPasswordConfirm) {
        triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
        return;
      }

      if (account.id !== authenticatedAdminId) {
        triggerToast(
          '다른 Firebase Auth 관리자 계정의 비밀번호는 직접 지정할 수 없습니다. 비밀번호 재설정 메일 발송 기능을 사용해 주세요.',
          'error'
        );
        return;
      }

      if (firebaseAuthUser?.uid !== account.authUid) {
        triggerToast(
          '현재 Firebase Auth 관리자 세션을 확인할 수 없습니다. 로그아웃 후 다시 로그인한 다음 비밀번호를 변경해 주세요.',
          'error'
        );
        return;
      }
    }

    const duplicatedAdminId = (registeredAdminAccounts || []).some(
      (item) =>
        item.id !== account.id &&
        String(item.adminLoginId || '').trim().toLowerCase() ===
          adminLoginId.toLowerCase()
    );

    if (duplicatedAdminId) {
      triggerToast('이미 등록된 관리자 ID입니다.', 'error');
      return;
    }

    const duplicatedAdminEmail = (registeredAdminAccounts || []).some((item) => {
      if (item.id === account.id) return false;

      const itemEmail = String(item.email || '').trim().toLowerCase();
      const itemAuthEmail = String(item.authEmail || '').trim().toLowerCase();

      return (
        itemEmail === email.toLowerCase() ||
        itemAuthEmail === email.toLowerCase()
      );
    });

    if (duplicatedAdminEmail) {
      triggerToast('이미 등록된 관리자 로그인 이메일입니다.', 'error');
      return;
    }

    if (
      adminAccountEditForm.email.trim() &&
      adminAccountEditForm.email.trim().toLowerCase() !== email.toLowerCase()
    ) {
      triggerToast(
        'Firebase Auth 연결 계정의 로그인 이메일은 이 화면에서 변경하지 않습니다.',
        'error'
      );
      return;
    }

    let firebasePasswordChanged = false;

    try {
      const nowText = new Date().toLocaleString('ko-KR');
      let passwordUpdateFields = {};

      if (shouldChangePassword) {
        await updatePassword(firebaseAuthUser, newPassword);
        firebasePasswordChanged = true;

        passwordUpdateFields = {
          passwordChangedAt: nowText,
        };
      }

      const nextAdminAccount = {
        ...account,
        ...passwordUpdateFields,
        id: account.id,
        authUid: account.id,
        adminLoginId,
        organizationName,
        userName,
        email,
        phone,
        adminRole,
        updatedAt: nowText,
      };

      await setDoc(
        doc(db, 'adminAccounts', account.id),
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await syncAdminIdentityRegistryIfRequested();

      setAdminAccounts((prev) =>
        (prev || []).map((item) =>
          item.id === account.id ? nextAdminAccount : item
        )
      );

      if (currentAuthAdminAccount?.id === account.id) {
        setCurrentAuthAdminAccount(nextAdminAccount);
      }

      cancelEditAdminAccount();

      triggerToast(
        shouldChangePassword
          ? `[${adminLoginId}] 관리자 정보와 비밀번호가 수정되었습니다.`
          : `[${adminLoginId}] 관리자 정보가 수정되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error('Admin account edit error:', error);

      if (firebasePasswordChanged) {
        triggerToast(
          '비밀번호는 변경되었지만 관리자 정보 저장에 실패했습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
          'error'
        );
        return;
      }

      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    }
  };

  const deleteAdminAccount = (account) => {
    if ((registeredAdminAccounts || []).length <= 1) {
      triggerToast('마지막 관리자 ID는 삭제할 수 없습니다.', 'error');
      return;
    }

    if (
      (account.adminRole || 'owner') === 'owner' &&
      (registeredAdminAccounts || []).filter((item) => (item.adminRole || 'owner') === 'owner').length <= 1
    ) {
      triggerToast('마지막 최고 관리자 계정은 삭제할 수 없습니다.', 'error');
      return;
    }

    if (account.id === authenticatedAdminId) {
      triggerToast(
        '현재 로그인 중인 본인 관리자 ID는 관리자 ID 현황에서 삭제할 수 없습니다. 로그아웃 후 다른 관리자로 삭제해 주세요.',
        'error'
      );
      return;
    }

    if (!account.id || !account.authUid || account.id !== account.authUid) {
      triggerToast(
        '관리자 UID 문서 구조가 올바르지 않습니다. 문서 ID와 authUid가 같은지 확인해 주세요.',
        'error'
      );
      return;
    }

    triggerConfirm(
      '관리자 ID 삭제',
      `[${account.adminLoginId}] 관리자 권한을 삭제합니다. Firebase Auth 계정 자체는 Spark 무료/클라이언트 환경에서는 삭제하지 않고, 이 시스템의 관리자 권한만 제거됩니다.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'adminAccounts', account.id));
          await syncAdminIdentityRegistryIfRequested();

          setAdminAccounts((prev) =>
            (prev || []).filter((item) => item.id !== account.id)
          );

          if (editingAdminAccountId === account.id) {
            cancelEditAdminAccount();
          }

          triggerToast(
            `[${account.adminLoginId}] 관리자 ID가 삭제되었습니다.`,
            'success'
          );
        } catch (error) {
          console.error('Admin account delete error:', error);
          triggerToast(
            '관리자 ID 삭제에 실패했습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
            'error'
          );
        }
      }
    );
  };

  const toggleAdminAccountLock = (account) => {
    if ((authenticatedAdminAccount?.adminRole || 'owner') !== 'owner') {
      triggerToast('최고 관리자만 관리자 계정을 잠그거나 해제할 수 있습니다.', 'error');
      return;
    }

    if (!account?.id || account.id === authenticatedAdminId) {
      triggerToast('현재 로그인 중인 본인 계정은 잠글 수 없습니다.', 'error');
      return;
    }

    const isLocked = Number(account.lockUntil || 0) > Date.now();
    const actionLabel = isLocked ? '잠금 해제' : '수동 잠금';

    triggerConfirm(
      `관리자 계정 ${actionLabel}`,
      isLocked
        ? `[${account.adminLoginId}] 관리자 계정의 잠금을 해제합니다.`
        : `[${account.adminLoginId}] 관리자 계정을 수동 잠금합니다. 잠금 해제 전까지 로그인할 수 없습니다.`,
      async () => {
        try {
          const nowText = new Date().toLocaleString('ko-KR');
          const nextLockUntil = isLocked ? 0 : 4102444800000;
          const nextLockReason = isLocked ? '' : '최고 관리자 수동 잠금';
          await setDoc(
            doc(db, 'adminAccounts', account.id),
            {
              lockUntil: nextLockUntil,
              lockReason: nextLockReason,
              updatedAt: nowText,
              syncedAt: serverTimestamp(),
            },
            { merge: true }
          );
          setAdminAccounts((prev) =>
            (prev || []).map((item) =>
              item.id === account.id
                ? { ...item, lockUntil: nextLockUntil, lockReason: nextLockReason, updatedAt: nowText }
                : item
            )
          );
          triggerToast(
            `[${account.adminLoginId}] 관리자 계정이 ${isLocked ? '잠금 해제' : '잠금'}되었습니다.`,
            'success'
          );
        } catch (error) {
          console.error('Admin account lock update error:', error);
          triggerToast('관리자 계정 잠금 상태 변경에 실패했습니다.', 'error');
        }
      }
    );
  };

  const saveMyAdminProfile = async () => {
    if (!authenticatedAdminAccount) {
      triggerToast('관리자 인증 후 내 정보를 수정할 수 있습니다.', 'error');
      return;
    }

    if (
      !authenticatedAdminAccount.id ||
      !authenticatedAdminAccount.authUid ||
      authenticatedAdminAccount.id !== authenticatedAdminAccount.authUid ||
      firebaseAuthUser?.uid !== authenticatedAdminAccount.authUid
    ) {
      triggerToast(
        '현재 관리자 UID 문서와 Firebase Auth 세션이 일치하지 않습니다. 로그아웃 후 다시 로그인해 주세요.',
        'error'
      );
      return;
    }

    const adminLoginId = adminMyProfileForm.adminLoginId.trim();
    const organizationName = adminMyProfileForm.organizationName.trim();
    const userName = adminMyProfileForm.userName.trim();
    const email = String(
      authenticatedAdminAccount.authEmail ||
        authenticatedAdminAccount.email ||
        adminMyProfileForm.email ||
        ''
    ).trim();
    const phone = adminMyProfileForm.phone.trim();

    if (!adminLoginId) {
      triggerToast('관리자 ID를 입력해 주세요.', 'error');
      return;
    }

    if (!organizationName) {
      triggerToast('조직명을 입력해 주세요.', 'error');
      return;
    }

    if (!userName) {
      triggerToast('사용자명을 입력해 주세요.', 'error');
      return;
    }

    let adminAccountsForValidation = registeredAdminAccounts || [];

    try {
      const adminAccountsSnapshot = await getDocs(
        ADMIN_ACCOUNTS_COLLECTION_REF
      );
      adminAccountsForValidation = adminAccountsSnapshot.docs.map(
        (accountDocument) => ({
          ...accountDocument.data(),
          id: accountDocument.id,
        })
      );
    } catch (error) {
      console.error('Admin profile duplicate validation read error:', error);
      triggerToast(
        '관리자 ID 중복 확인에 실패했습니다. 네트워크와 Firestore 권한을 확인해 주세요.',
        'error'
      );
      return;
    }

    const duplicatedAdminId = adminAccountsForValidation.some(
      (account) =>
        account.id !== authenticatedAdminAccount.id &&
        String(account.adminLoginId || '').trim().toLowerCase() ===
          adminLoginId.toLowerCase()
    );

    if (duplicatedAdminId) {
      triggerToast('이미 등록된 관리자 ID입니다.', 'error');
      return;
    }

    setAdminMyProfileSaving(true);

    try {
      const nowText = new Date().toLocaleString('ko-KR');

      const nextAdminAccount = {
        ...authenticatedAdminAccount,
        id: authenticatedAdminAccount.id,
        authUid: authenticatedAdminAccount.id,
        authProvider: 'firebase-auth',
        passwordHash: '',
        passwordSalt: '',
        passwordHashAlgorithm: 'Firebase Auth',
        passwordHashIterations: 0,
        adminLoginId,
        organizationName,
        userName,
        email,
        phone,
        updatedAt: nowText,
      };

      await setDoc(
        doc(db, 'adminAccounts', authenticatedAdminAccount.id),
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCurrentAuthAdminAccount(nextAdminAccount);

      setAdminAccounts((prev) =>
        (prev || []).map((account) =>
          account.id === authenticatedAdminAccount.id
            ? nextAdminAccount
            : account
        )
      );

      setAdminMyProfileForm((prev) => ({
        ...prev,
        newPassword: '',
        newPasswordConfirm: '',
      }));

      triggerToast('관리자 내 정보가 수정되었습니다.', 'success');
    } catch (error) {
      console.error('Admin my profile save error:', error);
      triggerToast(getAdminFirebaseAuthErrorMessage(error), 'error');
    } finally {
      setAdminMyProfileSaving(false);
    }
  };

  return {
    adminAccountTotalPages,
    adminAccountUserOptions,
    cancelEditAdminAccount,
    deleteAdminAccount,
    paginatedAdminAccounts,
    registerAdminAccount,
    safeAdminAccountPage,
    saveAdminAccountEdit,
    saveMyAdminProfile,
    sendAdminAccountPasswordResetEmail,
    startEditAdminAccount,
    toggleAdminAccountLock,
  };
}
