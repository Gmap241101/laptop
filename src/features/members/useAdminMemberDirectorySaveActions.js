import {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { firebaseAuth } from '../../firebase.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { readMemberProfileIdentityAuthorityConfig } from '../compatibility/memberProfileIdentityAuthority.js';
import { syncSiteContentDomainFromFirestore } from '../content/siteContentCutover.js';

let memberDirectorySaveServicePromise = null;

const loadMemberDirectorySaveService = () => {
  if (!memberDirectorySaveServicePromise) {
    memberDirectorySaveServicePromise = import(
      './memberDirectorySaveService.js'
    ).catch((error) => {
      memberDirectorySaveServicePromise = null;
      throw error;
    });
  }

  return memberDirectorySaveServicePromise;
};

export default function useAdminMemberDirectorySaveActions({
  currentBorrowers,
  isSplitStorageReady,
  replaceTempPeopleDraft,
  setData,
  settings,
  tempBorrowers,
  tempTeams,
  triggerToast,
}) {
  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const saveTempPeopleChanges = useCallback(async () => {
    if (!isSplitStorageReady) {
      triggerToastRef.current(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 부서·사용자 정보를 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    try {
      const {
        saveMemberDirectory,
      } = await loadMemberDirectorySaveService();

      const {
        nextBorrowers,
        nextSettings,
        nextTeams,
      } = await saveMemberDirectory({
        currentBorrowers,
        settings,
        tempBorrowers,
        tempTeams,
      });

      const profileAuthorityConfig = readMemberProfileIdentityAuthorityConfig();
      if (profileAuthorityConfig.requested) {
        const adminUser = firebaseAuth.currentUser;
        if (!adminUser) throw new Error('Firebase 관리자 compatibility 세션이 필요합니다.');
        await syncSiteContentDomainFromFirestore({ domain: 'rental-config' });
        const firebaseIdToken = await adminUser.getIdToken();
        await clerkStagingClient.syncAdminMemberDirectory(firebaseIdToken);
      }

      setData((previousData) => ({
        ...previousData,
        teams: nextTeams,
        borrowers: nextBorrowers,
        settings: nextSettings,
      }));
      replaceTempPeopleDraft({
        nextTeams,
        nextBorrowers,
      });

      triggerToastRef.current(
        '부서·사용자 명부가 저장되었습니다. 명부 버전이 변경되어 기존 회원은 다음 로그인 시 순차적으로 재검증됩니다.',
        'success'
      );

      return true;
    } catch (error) {
      if (
        error?.name === 'MemberDirectoryValidationError' &&
        error?.userMessage
      ) {
        triggerToastRef.current(error.userMessage, 'error');
        return false;
      }

      console.error('People data save error:', error);
      triggerToastRef.current(
        '부서·사용자 저장에 실패했습니다. 기존 데이터는 유지됩니다.',
        'error'
      );
      return false;
    }
  }, [
      currentBorrowers,
    isSplitStorageReady,
    replaceTempPeopleDraft,
    setData,
    settings,
    tempBorrowers,
    tempTeams,
  ]);

  return {
    saveTempPeopleChanges,
  };
}
