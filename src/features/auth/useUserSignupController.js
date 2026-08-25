import { useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '../../platform/retiredLegacyDataCompat.js';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  firebaseAuth,
  userSignupAuth,
  userSignupDb,
} from '../../platform/appDataRefs.js';
import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import {
  TERMS_CONSENT_SOURCE,
  TERMS_DECISION,
  normalizeTermsPolicy,
} from '../terms/termsConstants.js';
import { preloadSignupTermsPolicy } from '../terms/termsService.js';
import {
  getClaimCurrentUid,
  getClaimFormerUids,
  getClaimStatus,
  getSafeMemberDirectoryVersion,
  isAutoApproveNewMembersEnabled,
  isRegisteredMemberSignupRequired,
} from '../members/memberAccountPolicy.js';
import { normalizeRentalPolicySettings } from '../../domain/rentalPolicy.js';
import {
  clearUserLoginReturnTarget,
  pushAppPath,
  replaceAppPath,
} from '../../routing/appRoutes.js';
import {
  buildDomesticPhoneNumber,
  createAccountRecoveryEmailVerifier,
  createAccountRecoveryKey,
  createMemberIdentityKey,
  isValidDomesticPhoneNumber,
  isValidEmailAddress,
  isValidMemberName,
  isValidMemberPassword,
  maskEmailAddress,
  normalizeEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import {
  getServiceBlockReason,
  normalizeUserSessionPolicy,
} from '../../utils/systemSettings.js';
import {
  createDefaultUserAuthForm,
} from './useUserLoginController.js';
import { resolveEffectiveUserSessionPolicy } from './userSessionPolicyService.js';
import { clerkUserClient as clerkStagingClient } from '../../clerk/clerkUserClient.js';
import {
  publishUserAccountLifecycleObservation,
  readUserAccountLifecycleCutoverConfig,
} from './userAccountLifecycleCutover.js';
import {
  publishAccountLifecycleAuthorityObservation,
  readAccountLifecycleAuthorityConfig,
  readAccountLifecycleAuthorityFromPayload,
} from './accountLifecycleAuthority.js';
import {
  createClerkPostgresqlUserPrincipal,
  publishUserFirebaseAuthRetirementObservation,
  readUserFirebaseAuthRetirementConfig,
} from './userFirebaseAuthRetirement.js';

const DEFAULT_TERMS_SUBMISSION = Object.freeze({
  ready: false,
  enabled: false,
  valid: false,
  policyRevision: 0,
  requiredRevision: 0,
  decisions: [],
});

export default function useUserSignupController({
  clearAdminAuthenticatedSession,
  clearUserAuthenticatedSession,
  configureFirebaseAuthPersistence,
  createMemberPolicyError,
  dataSettings,
  dataTeams,
  firebaseAuthReady,
  getUserAuthErrorMessage,
  initialSettings,
  pendingProtectedUserTabRef,
  saveCurrentUserLoginReturnTarget,
  setIsCommunityMenuOpen,
  setUserAuthenticatedSession,
  setFirebaseAuthUser,
  setUserAuthForm,
  setUserAuthLoading,
  setUserTab,
  setView,
  showUserAccountStatus,
  siteSettings,
  triggerToast,
  userAuthForm,
  userAuthLoading,
  userSessionPolicy,
  userSessionPolicyReady,
  userTab,
}) {
  const goToUserSignup = useCallback(() => {
    pendingProtectedUserTabRef.current = '';

    if (
      !['login', 'signup', 'findEmail', 'resetPassword', 'accountStatus'].includes(
        userTab
      )
    ) {
      saveCurrentUserLoginReturnTarget();
    }

    setUserAuthForm(createDefaultUserAuthForm());
    void preloadSignupTermsPolicy().catch(() => {});
    pushAppPath('user', 'signup');
    setView('user');
    setUserTab('signup');
    setIsCommunityMenuOpen(false);
  }, [
    pendingProtectedUserTabRef,
    saveCurrentUserLoginReturnTarget,
    setIsCommunityMenuOpen,
    setUserAuthForm,
    setUserTab,
    setView,
    userTab,
  ]);

  const cancelUserSignup = useCallback(() => {
    if (userAuthLoading) {
      return;
    }

    void clerkStagingClient.cancelUserSignupEmailVerification().catch(() => {});
    setUserAuthForm(createDefaultUserAuthForm());
    clearUserLoginReturnTarget();
    replaceAppPath('user', 'login');
    setView('user');
    setUserTab('login');
    setIsCommunityMenuOpen(false);
  }, [
    setIsCommunityMenuOpen,
    setUserAuthForm,
    setUserTab,
    setView,
    userAuthLoading,
  ]);

  const submitUserSignupForm = useCallback(async (
    event,
    providedTermsSubmission = null
  ) => {
    event.preventDefault();

    const signupTermsSubmission =
      providedTermsSubmission || DEFAULT_TERMS_SUBMISSION;
    const signupBlockReason = getServiceBlockReason(siteSettings, 'signup');

    if (signupBlockReason) {
      triggerToast(signupBlockReason, 'error');
      return;
    }

    const email = normalizeEmailAddress(userAuthForm.email);
    const password = userAuthForm.password;
    const passwordConfirm = userAuthForm.passwordConfirm;
    const name = normalizeMemberName(userAuthForm.name);
    const team = normalizeMemberTeam(userAuthForm.team);
    const phoneParts = {
      prefix: userAuthForm.phonePrefix,
      middle: userAuthForm.phoneMiddle,
      last: userAuthForm.phoneLast,
    };
    const phone = buildDomesticPhoneNumber(phoneParts);

    if (!email) {
      triggerToast('이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!isValidEmailAddress(email)) {
      triggerToast('이메일 주소 형식이 정확하지 않습니다.\n인증받을 이메일 주소를 정확히 입력해 주세요.', 'error');
      return;
    }

    const firebaseRetirement = readUserFirebaseAuthRetirementConfig();
    if (
      firebaseRetirement.requested &&
      (userAuthForm.signupEmailVerified !== true ||
        normalizeEmailAddress(userAuthForm.signupVerifiedEmail) !== email)
    ) {
      triggerToast('회원가입에 사용할 이메일 인증을 먼저 완료해 주세요.', 'error');
      return;
    }

    if (!name) {
      triggerToast('이름을 입력해 주세요.', 'error');
      return;
    }

    if (!isValidMemberName(name)) {
      triggerToast(
        '이름은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!team) {
      triggerToast(
        isRegisteredMemberSignupRequired(dataSettings)
          ? '부서 / 팀을 선택해 주세요.'
          : '부서 / 팀을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!isValidDomesticPhoneNumber(phoneParts)) {
      triggerToast('올바른 국내 연락처를 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    if (!isValidMemberPassword(password)) {
      triggerToast(
        '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.',
        'error'
      );
      return;
    }

    if (!passwordConfirm) {
      triggerToast('비밀번호 확인을 입력해 주세요.', 'error');
      return;
    }

    if (password !== passwordConfirm) {
      triggerToast('비밀번호 확인이 일치하지 않습니다.', 'error');
      return;
    }

    if (
      signupTermsSubmission.enabled &&
      (!signupTermsSubmission.ready || !signupTermsSubmission.valid)
    ) {
      triggerToast('필수 회원가입 약관을 확인하고 동의해 주세요.', 'error');
      return;
    }

    if (!firebaseAuthReady) {
      triggerToast('회원가입 인증 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
      return;
    }

    if (!dataSettings?.memberIdentityClaimsReady) {
      triggerToast('회원 중복 확인 정보가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.', 'error');
      return;
    }

    let createdSignupUser = null;
    let signupFirestoreCommitted = false;
    let effectiveUserSessionPolicy = normalizeUserSessionPolicy(
      userSessionPolicy
    );
    const lifecycleConfig = readUserAccountLifecycleCutoverConfig();
    const accountLifecycleConfig = readAccountLifecycleAuthorityConfig();

    setUserAuthLoading(true);

    try {
      if (firebaseRetirement.requested) {
        effectiveUserSessionPolicy = await resolveEffectiveUserSessionPolicy({
          policy: userSessionPolicy,
          policyReady: userSessionPolicyReady,
        });
        clearAdminAuthenticatedSession();

        await clerkStagingClient.completeUserSignupEmailVerification({
          email,
          password,
          name,
        });

        let signupPayload;
        try {
          signupPayload = await clerkStagingClient.signupVerifiedUser({
            email,
            name,
            team,
            phone,
            terms: {
              policyRevision: Number(signupTermsSubmission.policyRevision || 0),
              requiredRevision: Number(signupTermsSubmission.requiredRevision || 0),
              decisions: Array.isArray(signupTermsSubmission.decisions) ? signupTermsSubmission.decisions : [],
            },
          });
        } catch (signupError) {
          await clerkStagingClient.signOut().catch(() => {});
          throw signupError;
        }

        const createdAccountStatus = signupPayload?.signupLifecycle?.status || USER_PROFILE_STATUS.PENDING;
        publishAccountLifecycleAuthorityObservation({
          ...readAccountLifecycleAuthorityFromPayload(signupPayload, { requested: true }),
          signupFirestoreBootstrap: 'retired',
          error: null,
        });
        publishUserFirebaseAuthRetirementObservation({ requested: true, signup: 'clerk-postgresql-verified-email', userFirebaseCompatibility: 'retired', error: '' });
        publishUserAccountLifecycleObservation({
          userAuthRequested: true,
          userLifecycleRequested: true,
          signupClerkProvision: 'verified-email',
          userFirebaseCompatibility: 'retired',
          error: '',
        });

        if (createdAccountStatus === USER_PROFILE_STATUS.ACTIVE) {
          const sessionPayload = await clerkStagingClient.getUserClerkSession();
          const authority = sessionPayload?.userAuthentication || {};
          const principal = createClerkPostgresqlUserPrincipal({
            uid: authority.legacyMemberKey || authority.firebaseUid,
            email: authority.email || email,
            displayName: authority.displayName || name,
          });
          if (!principal) throw new Error('Clerk/PostgreSQL signup session did not return a member key.');
          setFirebaseAuthUser(principal);
          setUserAuthenticatedSession(principal.uid, effectiveUserSessionPolicy);
        } else {
          await clerkStagingClient.signOut().catch(() => {});
          setFirebaseAuthUser(null);
          clearUserAuthenticatedSession();
        }

        setUserAuthForm(createDefaultUserAuthForm());
        clearUserLoginReturnTarget();
        showUserAccountStatus(createdAccountStatus === USER_PROFILE_STATUS.ACTIVE ? 'signupAutoApprovedComplete' : 'signupPendingComplete');
        return;
      }

      effectiveUserSessionPolicy = await resolveEffectiveUserSessionPolicy({
        policy: userSessionPolicy,
        policyReady: userSessionPolicyReady,
      });
      await configureFirebaseAuthPersistence(
        firebaseAuth,
        effectiveUserSessionPolicy.userLogoutOnBrowserClose
      );
      clearAdminAuthenticatedSession();

      await setPersistence(userSignupAuth, inMemoryPersistence);

      if (userSignupAuth.currentUser) {
        await signOut(userSignupAuth);
      }

      if (!accountLifecycleConfig.requested && !dataSettings.memberIdentityClaimsReady) {
        throw createMemberPolicyError('member/identity-index-not-ready');
      }

      const identityKey = await createMemberIdentityKey(team, name);
      const recoveryKey = await createAccountRecoveryKey({ team, name, phone });
      const recoveryEmailVerifier = await createAccountRecoveryEmailVerifier({
        email,
        team,
        name,
        phone,
      });
      const maskedEmail = maskEmailAddress(email);
      const initialPolicyEnabled = isRegisteredMemberSignupRequired(
        dataSettings
      );

      if (!accountLifecycleConfig.requested && initialPolicyEnabled) {
        if ((dataTeams || []).length === 0) {
          throw createMemberPolicyError('member/directory-not-ready');
        }

        const directorySnapshot = await getDoc(
          doc(MEMBER_DIRECTORY_KEYS_COLLECTION_REF, identityKey)
        );
        const directoryData = directorySnapshot.exists()
          ? directorySnapshot.data()
          : null;

        if (
          !directoryData ||
          directoryData.enabled === false ||
          normalizeMemberName(directoryData.name || '') !== name ||
          normalizeMemberTeam(directoryData.team || '') !== team
        ) {
          throw createMemberPolicyError('member/directory-mismatch');
        }
      }

      const credential = await createUserWithEmailAndPassword(
        userSignupAuth,
        email,
        password
      );

      createdSignupUser = credential.user;

      await updateProfile(credential.user, {
        displayName: name,
      });

      let createdAccountStatus = USER_PROFILE_STATUS.PENDING;
      let createdAccountRejoined = false;

      if (accountLifecycleConfig.requested) {
        const firebaseIdToken = await credential.user.getIdToken();
        const signupPayload = await clerkStagingClient.bootstrapUserSignup(firebaseIdToken, {
          email,
          name,
          team,
          phone,
          terms: {
            policyRevision: Number(signupTermsSubmission.policyRevision || 0),
            requiredRevision: Number(signupTermsSubmission.requiredRevision || 0),
            decisions: Array.isArray(signupTermsSubmission.decisions) ? signupTermsSubmission.decisions : [],
          },
        });
        createdAccountStatus = signupPayload?.signupLifecycle?.status || USER_PROFILE_STATUS.PENDING;
        signupFirestoreCommitted = true;
        createdSignupUser = null;
        publishAccountLifecycleAuthorityObservation({
          ...readAccountLifecycleAuthorityFromPayload(signupPayload, { requested: true }),
          signupFirestoreBootstrap: signupPayload?.signupLifecycle?.firestoreBootstrap || 'retired',
          error: null,
        });
      } else {
        const signupPublicConfigRef = doc(
          userSignupDb,
          'rentalSystem',
          'publicConfig'
        );
        const signupClaimRef = doc(
          userSignupDb,
          'memberIdentityClaims',
          identityKey
        );
        const signupRecoveryRef = doc(
          userSignupDb,
          'accountRecoveryKeys',
          recoveryKey
        );
        const signupUserAccountRef = doc(
          userSignupDb,
          USER_ACCOUNTS_COLLECTION_NAME,
          credential.user.uid
        );
        const signupTermsPolicyRef = doc(
          userSignupDb,
          'signupTermsPolicy',
          'current'
        );
        const submittedTermsById = new Map(
          (Array.isArray(signupTermsSubmission.decisions)
            ? signupTermsSubmission.decisions
            : []
          ).map((decision) => [String(decision.termId || ''), decision])
        );
        const signupConsentRefs = new Map(
          [...submittedTermsById.keys()].map((termId) => [
            termId,
            {
              stateRef: doc(
                userSignupDb,
                'userTermConsentStates',
                `${credential.user.uid}__${termId}`
              ),
              logRef: doc(collection(userSignupDb, 'userTermConsentLogs')),
            },
          ])
        );

        await runTransaction(userSignupDb, async (transaction) => {
          const [configSnapshot, termsPolicySnapshot] = await Promise.all([
            transaction.get(signupPublicConfigRef),
            transaction.get(signupTermsPolicyRef),
          ]);
          const claimRef = signupClaimRef;
          const recoveryRef = signupRecoveryRef;
          const claimSnapshot = await transaction.get(claimRef);
          const latestSettings = normalizeRentalPolicySettings({
            ...initialSettings,
            ...(configSnapshot.exists()
              ? configSnapshot.data()?.settings || {}
              : {}),
          });
          const latestPolicyEnabled = isRegisteredMemberSignupRequired(
            latestSettings
          );
          const latestTermsPolicy = normalizeTermsPolicy(
            termsPolicySnapshot.exists() ? termsPolicySnapshot.data() : {}
          );
          const termsEnabled =
            latestTermsPolicy.enabled;
          const activeTerms = termsEnabled ? latestTermsPolicy.activeTerms : [];

          if (termsEnabled) {
            if (
              !signupTermsSubmission.ready ||
              Number(signupTermsSubmission.policyRevision || 0) !==
                latestTermsPolicy.revision ||
              submittedTermsById.size !== activeTerms.length
            ) {
              throw createMemberPolicyError('terms/policy-changed');
            }

            activeTerms.forEach((term) => {
              const decision = submittedTermsById.get(term.id);
              const exactVersion =
                Number(decision?.termVersion || 0) === Number(term.version || 0);
              const exactVersionId =
                String(decision?.termVersionId || '') ===
                String(term.versionId || '');
              const exactHash =
                String(decision?.contentHash || '') ===
                String(term.contentHash || '');
              const accepted = decision?.decision === TERMS_DECISION.ACCEPTED;
              const viewed = Number(decision?.viewedAtMs || 0) > 0;

              if (!decision || !exactVersion || !exactVersionId || !exactHash) {
                throw createMemberPolicyError('terms/policy-changed');
              }

              if (term.required && (!accepted || !viewed)) {
                throw createMemberPolicyError('terms/required-not-accepted');
              }

              if (!term.required && accepted && !viewed) {
                throw createMemberPolicyError('terms/decision-required');
              }
            });
          }

          if (!latestSettings.memberIdentityClaimsReady) {
            throw createMemberPolicyError('member/identity-index-not-ready');
          }

          const directoryVersion = getSafeMemberDirectoryVersion(
            latestSettings
          );
          let directoryData = null;

          if (latestPolicyEnabled) {
            const directoryRef = doc(
              userSignupDb,
              'memberDirectoryKeys',
              identityKey
            );
            const directorySnapshot = await transaction.get(directoryRef);
            directoryData = directorySnapshot.exists()
              ? directorySnapshot.data()
              : null;

            if (
              !directoryData ||
              directoryData.enabled === false ||
              normalizeMemberName(directoryData.name || '') !== name ||
              normalizeMemberTeam(directoryData.team || '') !== team
            ) {
              throw createMemberPolicyError('member/directory-mismatch');
            }
          }

          const claimData = claimSnapshot.exists()
            ? claimSnapshot.data()
            : {};
          const claimCurrentUid = getClaimCurrentUid(claimData);
          const claimFormerUids = getClaimFormerUids(claimData);
          const claimStatus = getClaimStatus(claimData);
          const isReleasedClaim =
            claimSnapshot.exists() &&
            claimStatus === 'released' &&
            !claimCurrentUid;

          if (
            claimSnapshot.exists() &&
            (claimData.conflict === true ||
              (claimCurrentUid && claimCurrentUid !== credential.user.uid) ||
              (!isReleasedClaim &&
                !claimCurrentUid &&
                claimStatus !== 'released'))
          ) {
            throw createMemberPolicyError('member/identity-already-claimed');
          }

          createdAccountRejoined =
            isReleasedClaim || claimFormerUids.length > 0;
          createdAccountStatus =
            isAutoApproveNewMembersEnabled(latestSettings) &&
            !createdAccountRejoined
              ? USER_PROFILE_STATUS.ACTIVE
              : USER_PROFILE_STATUS.PENDING;

          transaction.set(claimRef, {
            identityKey,
            uid: credential.user.uid,
            currentUid: credential.user.uid,
            status: 'active',
            name,
            team,
            conflict: false,
            conflictingUids: [],
            formerUids: claimFormerUids,
            directoryMemberId:
              latestPolicyEnabled && directoryData
                ? directoryData.directoryMemberId || ''
                : claimData.directoryMemberId || '',
            restrictionSnapshot: claimData.restrictionSnapshot || {},
            createdAt: claimSnapshot.exists()
              ? claimData.createdAt || serverTimestamp()
              : serverTimestamp(),
            releasedAt: '',
            updatedAt: serverTimestamp(),
          });

          transaction.set(signupUserAccountRef, {
            uid: credential.user.uid,
            email: credential.user.email || email,
            maskedEmail,
            name,
            team,
            phone,
            status: createdAccountStatus,
            identityKey,
            recoveryKey,
            directoryMemberId:
              latestPolicyEnabled && directoryData
                ? directoryData.directoryMemberId || ''
                : '',
            directoryVerifiedVersion: latestPolicyEnabled ? directoryVersion : 0,
            directoryVerifiedAt: latestPolicyEnabled ? serverTimestamp() : '',
            profileRequiredReason: '',
            profileRequiredAt: '',
            statusBeforeProfileRequired: '',
            rejoinedAccount: createdAccountRejoined,
            previousAccountUids: claimFormerUids,
            inheritedRestriction: claimData.restrictionSnapshot || {},
            termsConsentRevision: termsEnabled ? latestTermsPolicy.revision : 0,
            termsConsentCompletedAt: termsEnabled ? serverTimestamp() : '',
            termsConsentPolicyVersion: termsEnabled
              ? latestTermsPolicy.revision
              : 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (termsEnabled) {
            activeTerms.forEach((term) => {
              const decision = submittedTermsById.get(term.id);
              const refs = signupConsentRefs.get(term.id);
              const decisionValue =
                decision.decision === TERMS_DECISION.ACCEPTED
                  ? TERMS_DECISION.ACCEPTED
                  : TERMS_DECISION.DECLINED;
              const consentPayload = {
                uid: credential.user.uid,
                termId: term.id,
                termVersion: term.version,
                termVersionId: term.versionId || '',
                policyRevision: latestTermsPolicy.revision,
                decision: decisionValue,
                requiredSnapshot: Boolean(term.required),
                titleSnapshot: term.title,
                contentHash: term.contentHash,
                viewedAtMs: Number(decision.viewedAtMs || 0),
                decidedAt: serverTimestamp(),
                source: TERMS_CONSENT_SOURCE.SIGNUP,
                updatedAt: serverTimestamp(),
              };

              transaction.set(refs.stateRef, consentPayload);
              transaction.set(refs.logRef, {
                ...consentPayload,
                previousDecision: '',
                createdAt: serverTimestamp(),
              });
            });
          }

          transaction.set(recoveryRef, {
            recoveryKey,
            maskedEmail,
            emailVerifier: recoveryEmailVerifier,
            accountStatus: createdAccountStatus,
            enabled: true,
            updatedAt: serverTimestamp(),
          });
        });

        signupFirestoreCommitted = true;
        createdSignupUser = null;
      }

      let clerkProvisioned = !lifecycleConfig.userLifecycleRequested;
      if (lifecycleConfig.userLifecycleRequested) {
        try {
          const firebaseIdToken = await credential.user.getIdToken();
          const provisionPayload = await clerkStagingClient.provisionUserClerkIdentity(
            firebaseIdToken,
            password
          );
          clerkProvisioned = Boolean(provisionPayload?.userAuthentication?.provisioned);
          publishUserAccountLifecycleObservation({
            userAuthRequested: lifecycleConfig.userAuthRequested,
            userLifecycleRequested: true,
            signupClerkProvision: clerkProvisioned ? 'provisioned' : 'invalid-response',
            userClerkUser: provisionPayload?.userAuthentication?.clerkUserId || '',
            error: clerkProvisioned ? '' : 'user-clerk-provision-invalid-response',
          });
        } catch (provisionError) {
          clerkProvisioned = false;
          console.error('User signup Clerk provision error:', provisionError);
          publishUserAccountLifecycleObservation({
            userAuthRequested: lifecycleConfig.userAuthRequested,
            userLifecycleRequested: true,
            signupClerkProvision: 'failed',
            error: provisionError?.code || provisionError?.message || 'user-clerk-provision-failed',
          });
        }
      }

      await signOut(userSignupAuth).catch((logoutError) => {
        console.error('Signup secondary auth sign-out error:', logoutError);
      });

      if (createdAccountStatus === USER_PROFILE_STATUS.ACTIVE) {
        if (lifecycleConfig.userAuthRequested && !clerkProvisioned) {
          clearUserAuthenticatedSession();
          setUserAuthForm(createDefaultUserAuthForm());
          clearUserLoginReturnTarget();
          showUserAccountStatus('signupAutoApprovedComplete');
          triggerToast(
            '회원가입은 완료됐지만 Clerk 계정 연결을 완료하지 못했습니다. 로그인 화면에서 다시 로그인하면 자동 연결을 재시도합니다.',
            'error'
          );
          return;
        }

        const primaryCredential = await signInWithEmailAndPassword(
          firebaseAuth,
          email,
          password
        );

        if (lifecycleConfig.userAuthRequested) {
          try {
            const signInResult = await clerkStagingClient.signInUserWithPassword(email, password);
            if (signInResult?.status === 'needs_client_trust') {
              setUserAuthForm({
                ...createDefaultUserAuthForm(),
                email,
                clientTrustCode: '',
                clientTrustRequired: true,
                clientTrustStrategy: signInResult.clientTrustStrategy || '',
                clientTrustDestination: signInResult.clientTrustDestination || email,
                clientTrustMigration: 'signup-provisioned',
              });
              clearUserAuthenticatedSession();
              clearUserLoginReturnTarget();
              replaceAppPath('user', 'login');
              setView('user');
              setUserTab('login');
              setIsCommunityMenuOpen(false);
              publishUserAccountLifecycleObservation({
                userAuthRequested: true,
                userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
                userAuthSource: 'client-trust-required',
                userFirebaseCompatibility: 'signed-in',
                userClerkMigration: 'signup-provisioned',
                signupClerkProvision: 'provisioned',
                userClientTrustStatus: 'code-sent',
                userClientTrustStrategy: signInResult.clientTrustStrategy || '',
                userClientTrustDestination: signInResult.clientTrustDestination || '',
                error: '',
              });
              triggerToast(
                `회원가입이 완료되었습니다. Clerk 새 기기 확인을 위해 ${signInResult.clientTrustDestination || '등록된 연락처'}로 보낸 인증코드를 입력해 주세요.`,
                'success'
              );
              return;
            }

            const sessionPayload = await clerkStagingClient.getUserClerkSession();
            const authority = sessionPayload?.userAuthentication;
            if (authority?.firebaseUid !== primaryCredential.user.uid) {
              const identityError = new Error('Clerk and Firebase signup identities do not match.');
              identityError.code = 'user_clerk_session_identity_mismatch';
              throw identityError;
            }
            publishUserAccountLifecycleObservation({
              userAuthRequested: true,
              userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
              userAuthSource: 'clerk',
              userFirebaseCompatibility: 'signed-in',
              userClerkMigration: 'signup-provisioned',
              userClerkUser: authority?.clerkUserId || '',
              signupClerkProvision: 'provisioned',
              userClientTrustStatus: 'not-required',
              error: '',
            });
          } catch (signInError) {
            console.error('User signup Clerk sign-in error:', signInError);
            await clerkStagingClient.signOut().catch(() => {});
            await signOut(firebaseAuth).catch(() => {});
            clearUserAuthenticatedSession();
            setUserAuthForm(createDefaultUserAuthForm());
            clearUserLoginReturnTarget();
            showUserAccountStatus('signupAutoApprovedComplete');
            publishUserAccountLifecycleObservation({
              userAuthRequested: true,
              userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
              userAuthSource: 'failed',
              userFirebaseCompatibility: 'signed-out',
              signupClerkProvision: 'provisioned',
              error: signInError?.code || signInError?.message || 'user-clerk-signin-after-signup-failed',
            });
            triggerToast(
              '회원가입과 Clerk 계정 생성은 완료됐지만 자동 로그인을 완료하지 못했습니다. 로그인 화면에서 다시 로그인해 주세요.',
              'error'
            );
            return;
          }
        }

        setUserAuthenticatedSession(
          primaryCredential.user.uid,
          effectiveUserSessionPolicy
        );
      } else {
        clearUserAuthenticatedSession();
      }

      setUserAuthForm(createDefaultUserAuthForm());
      clearUserLoginReturnTarget();

      if (createdAccountStatus === USER_PROFILE_STATUS.ACTIVE) {
        showUserAccountStatus('signupAutoApprovedComplete');
      } else {
        showUserAccountStatus('signupPendingComplete');
      }
    } catch (error) {
      let signupRollbackFailed = false;
      let firebaseAuthCleanupFailed = false;

      setUserAuthForm((prev) => ({
        ...prev,
        password: '',
        passwordConfirm: '',
        ...(firebaseRetirement.requested
          ? { signupEmailVerified: false, signupVerifiedEmail: '' }
          : {}),
      }));

      if (
        !signupFirestoreCommitted &&
        createdSignupUser &&
        userSignupAuth.currentUser?.uid === createdSignupUser.uid
      ) {
        try {
          await deleteUser(createdSignupUser);
        } catch (rollbackError) {
          signupRollbackFailed = true;
          console.error('User signup rollback error:', rollbackError);

          try {
            await signOut(userSignupAuth);
          } catch (cleanupError) {
            firebaseAuthCleanupFailed = true;
            console.error(
              'Failed signup secondary Auth cleanup error:',
              cleanupError
            );
          }
        }
      }

      clearUserAuthenticatedSession();
      clearAdminAuthenticatedSession();
      if (accountLifecycleConfig.requested) {
        publishAccountLifecycleAuthorityObservation({
          requested: true,
          error: error?.code || error?.message || 'phase32-signup-failed',
        });
      }
      console.error('User auth error:', error);

      const baseErrorMessage = firebaseRetirement.requested
        ? getUserAuthErrorMessage(error)
        : signupRollbackFailed
        ? '회원 프로필 저장과 생성된 인증 계정 정리에 실패했습니다. Firebase Authentication과 userAccounts 컬렉션을 확인해 주세요.'
        : signupFirestoreCommitted
          ? '회원가입 데이터는 저장됐지만 후속 인증 연결을 완료하지 못했습니다. 로그인 화면에서 다시 로그인해 주세요.'
          : getUserAuthErrorMessage(error);

      triggerToast(
        firebaseAuthCleanupFailed && !firebaseRetirement.requested
          ? `${baseErrorMessage} Firebase Auth 로그아웃에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.`
          : baseErrorMessage,
        'error'
      );
    } finally {
      setUserAuthLoading(false);
    }
  }, [
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    configureFirebaseAuthPersistence,
    createMemberPolicyError,
    dataSettings,
    dataTeams,
    firebaseAuthReady,
    getUserAuthErrorMessage,
    initialSettings,
    setUserAuthenticatedSession,
    setFirebaseAuthUser,
    setUserAuthForm,
    setUserAuthLoading,
    setIsCommunityMenuOpen,
    setUserTab,
    setView,
    showUserAccountStatus,
    siteSettings,
    triggerToast,
    userAuthForm.email,
    userAuthForm.signupEmailVerified,
    userAuthForm.signupVerifiedEmail,
    userAuthForm.name,
    userAuthForm.password,
    userAuthForm.passwordConfirm,
    userAuthForm.phoneLast,
    userAuthForm.phoneMiddle,
    userAuthForm.phonePrefix,
    userAuthForm.team,
    userSessionPolicy,
    userSessionPolicyReady,
  ]);

  return {
    cancelUserSignup,
    goToUserSignup,
    submitUserSignupForm,
  };
}
