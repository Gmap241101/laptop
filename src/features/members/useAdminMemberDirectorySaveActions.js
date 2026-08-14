import {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { readPolicyContentCutoverConfig } from '../content/policyContentCutover.js';

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
    try {
      const { saveMemberDirectory } = await loadMemberDirectorySaveService();
      const {
        directoryEntries,
        nextBorrowers,
        nextSettings,
        nextTeams,
      } = await saveMemberDirectory({
        currentBorrowers,
        settings,
        tempBorrowers,
        tempTeams,
      });

      const policyConfig = readPolicyContentCutoverConfig();
      if (!policyConfig.adminAuthorityRequested) {
        const error = new Error('PostgreSQL member-directory authority is unavailable.');
        error.code = 'member_directory_postgresql_authority_unavailable';
        throw error;
      }

      await clerkStagingClient.syncAdminMemberDirectory({
        entries: directoryEntries,
        version: nextSettings.memberDirectoryVersion,
        teams: nextTeams,
        settings: nextSettings,
      });

      setData((previousData) => ({
        ...previousData,
        teams: nextTeams,
        borrowers: nextBorrowers,
        settings: nextSettings,
      }));
      replaceTempPeopleDraft({ nextTeams, nextBorrowers });

      triggerToastRef.current(
        '부서·사용자 명부가 성공적으로 저장 및 반영되었습니다. 명부 버전이 변경되어 기존 회원은 다음 로그인 시 순차적으로 재검증됩니다.',
        'success'
      );
      return true;
    } catch (error) {
      if (error?.name === 'MemberDirectoryValidationError' && error?.userMessage) {
        triggerToastRef.current(error.userMessage, 'error');
        return false;
      }
      console.error('People data save error:', error);
      triggerToastRef.current(
        `부서·사용자 PostgreSQL 저장에 실패했습니다. 기존 데이터는 유지됩니다. 오류 코드: ${error?.code || error?.name || 'member_directory_save_failed'}`,
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

  return { saveTempPeopleChanges };
}
