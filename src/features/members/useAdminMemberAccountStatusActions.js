import { useCallback, useEffect, useRef, useState } from 'react';

import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishMemberAuthorityObservation } from './memberAuthorityCutover.js';
import { getUserAccountStatusLabel } from './memberAccountPolicy.js';

export default function useAdminMemberAccountStatusActions({
  isAdminAuthenticated,
  triggerConfirm,
  triggerToast,
  onStatusChanged,
}) {
  const triggerConfirmRef = useRef(triggerConfirm);
  const triggerToastRef = useRef(triggerToast);
  const onStatusChangedRef = useRef(onStatusChanged);
  const [adminUserAccountSavingUid, setAdminUserAccountSavingUid] = useState('');

  useEffect(() => { triggerConfirmRef.current = triggerConfirm; }, [triggerConfirm]);
  useEffect(() => { triggerToastRef.current = triggerToast; }, [triggerToast]);
  useEffect(() => { onStatusChangedRef.current = onStatusChanged; }, [onStatusChanged]);

  const execute = useCallback(async (account, operation, nextStatus = '') => {
    const uid = account?.uid || '';
    if (!isAdminAuthenticated || !uid) {
      triggerToastRef.current('관리자 인증과 회원 UID를 확인해 주세요.', 'error');
      return;
    }
    setAdminUserAccountSavingUid(uid);
    try {
      let response;
      if (operation === 'status') response = await clerkStagingClient.writeAdminMemberStatus('', uid, nextStatus);
      else if (operation === 'reject') response = await clerkStagingClient.rejectAdminPendingMember(uid);
      else if (operation === 'retire') response = await clerkStagingClient.retireAdminMember(uid);
      else if (operation === 'purge') response = await clerkStagingClient.purgeAdminRetiredMember(uid);
      else throw new Error('unsupported-member-lifecycle-operation');

      publishMemberAuthorityObservation({
        memberWriteRequested: true,
        memberWriteSource: response?.adminMemberStatusWrite?.authority || response?.adminMemberLifecycle?.authority || 'postgresql',
        memberFirestoreMirror: response?.adminMemberStatusWrite?.firestoreMirror || 'retired',
        memberMutationId: response?.adminMemberStatusWrite?.mutationId || '',
        operation: `admin-member-${operation}`,
        error: '',
      });

      const label = account.name || account.email || uid;
      if (operation === 'reject') triggerToastRef.current(`${label} 회원의 가입을 거절하고 대기 계정을 삭제했습니다.`, 'success');
      else if (operation === 'retire') triggerToastRef.current(`${label} 회원의 이용을 종료하고 로그인 계정을 삭제했습니다.`, 'success');
      else if (operation === 'purge') triggerToastRef.current(`${label} 탈퇴 회원과 연결된 업무기록을 완전히 삭제했습니다.`, 'success');
      else if (account?.rejoinedAccount && nextStatus === USER_PROFILE_STATUS.ACTIVE) triggerToastRef.current(`${label} 회원의 재가입을 승인했습니다. 이전 업무기록은 현재 계정으로 이관되고 기존 탈퇴 계정은 삭제되었습니다.`, 'success');
      else triggerToastRef.current(`${label} 회원을 ${getUserAccountStatusLabel(nextStatus)} 상태로 변경했습니다.`, 'success');
      onStatusChangedRef.current?.({ uid, status: nextStatus, operation });
    } catch (error) {
      console.error('Member lifecycle mutation error:', error);
      const messages = {
        rejoined_member_active_requests: '이전 계정에 진행 중인 신청 또는 대여가 남아 있어 가입을 승인할 수 없습니다. 기존 신청을 먼저 정리해 주세요.',
        rejoin_consolidation_orphan_reference: '재가입 승인 중 이전 계정 참조가 남아 전체 처리를 취소했습니다. 관리자에게 문의해 주세요.',
        rejoin_consolidation_identity_reference: '재가입 승인 중 이전 계정의 업무 참조가 정리되지 않아 전체 처리를 취소했습니다.',
        rejoin_consolidation_identity_orphan: '재가입 승인 중 이전 로그인 식별정보가 남아 전체 처리를 취소했습니다.',
        member_purge_active_business_blocked: '처리되지 않은 대여 업무가 있어 회원을 완전히 삭제할 수 없습니다. 관련 업무를 먼저 완료해 주세요.',
        member_purge_pending_rejoin_blocked: '이 탈퇴 회원과 연결된 재가입 승인 대기 계정이 있습니다. 재가입 승인 또는 가입 거절을 먼저 처리해 주세요.',
        user_withdrawal_active_rental_blocked: '진행 중인 대여 업무가 있어 이용을 종료할 수 없습니다.',
        user_withdrawal_pending_action_blocked: '처리 중인 대여 변경 요청이 있어 이용을 종료할 수 없습니다.',
        user_withdrawal_overdue_penalty_pending: '미처리 연체 정산이 있어 이용을 종료할 수 없습니다.',
      };
      triggerToastRef.current(messages[error?.code] || `회원 처리에 실패했습니다. 오류 코드: ${error?.code || error?.message || 'unknown-error'}`, 'error');
    } finally {
      setAdminUserAccountSavingUid('');
    }
  }, [isAdminAuthenticated]);

  const confirmUserAccountStatusChange = useCallback((account, nextStatus) => {
    const label = account?.name || account?.email || account?.uid || '선택한 회원';
    if (nextStatus === USER_PROFILE_STATUS.ACTIVE && account?.status === USER_PROFILE_STATUS.PENDING && account?.rejoinedAccount) {
      triggerConfirmRef.current(
        '재가입 승인',
        `${label} 회원의 재가입을 승인하시겠습니까? 기존 탈퇴 계정의 대여·제재 등 업무기록을 현재 계정으로 이관한 뒤 기존 탈퇴 계정과 과거 개인정보·약관·계정 연결 기록을 자동 삭제합니다. 이관이 하나라도 실패하면 전체 처리를 취소합니다.`,
        () => execute(account, 'status', nextStatus),
      );
      return;
    }
    triggerConfirmRef.current('회원 상태 변경', `${label} 회원을 ${getUserAccountStatusLabel(nextStatus)} 상태로 변경하시겠습니까?`, () => execute(account, 'status', nextStatus));
  }, [execute]);

  const confirmPendingMemberRejection = useCallback((account) => {
    const label = account?.name || account?.email || account?.uid || '선택한 회원';
    triggerConfirmRef.current('가입 거절', `${label} 회원의 가입을 거절하시겠습니까? 대기 중인 신규 계정만 삭제되며, 연결된 과거 탈퇴 계정과 기록은 유지됩니다.`, () => execute(account, 'reject'));
  }, [execute]);

  const confirmMemberRetirement = useCallback((account) => {
    const label = account?.name || account?.email || account?.uid || '선택한 회원';
    triggerConfirmRef.current('이용 종료', `${label} 회원의 이용을 종료하시겠습니까? Clerk 로그인 계정이 삭제되고 탈퇴 회원으로 이동하며, 회원정보와 업무기록은 보존됩니다.`, () => execute(account, 'retire', USER_PROFILE_STATUS.RETIRED));
  }, [execute]);

  const confirmRetiredMemberPurge = useCallback((account) => {
    const label = account?.name || account?.email || account?.uid || '선택한 회원';
    triggerConfirmRef.current('회원 완전 삭제', `${label} 탈퇴 회원을 완전히 삭제하시겠습니까? 회원정보와 대여·제재·약관 동의·계정 연결 기록이 모두 삭제되며 복구할 수 없습니다. 삭제 후 동일 이메일은 완전한 신규 회원으로 처리됩니다.`, () => execute(account, 'purge'));
  }, [execute]);

  return { adminUserAccountSavingUid, confirmUserAccountStatusChange, confirmPendingMemberRejection, confirmMemberRetirement, confirmRetiredMemberPurge };
}
