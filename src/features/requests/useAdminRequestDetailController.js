import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  where,
} from 'firebase/firestore';

import { RENTAL_REQUEST_LOGS_COLLECTION_REF, firebaseAuth } from '../../firebase.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  publishAdminRentalRequestCutoverObservation,
  readAdminRentalRequestCutoverConfig,
} from './adminRentalRequestCutover.js';
import {
  RENTAL_REQUEST_AUDIT_ACTION,
  RENTAL_REQUEST_RESTORE_TARGETS,
  RENTAL_REQUEST_STATUS_TRANSITIONS,
} from '../../constants/appConstants.js';

export const createDefaultAdminRequestEditForm = (request = {}) => ({
  team: request.team || '',
  borrower: request.borrower || '',
  startDate: request.startDate || '',
  dueDate: request.dueDate || '',
  purpose: request.purpose || '',
  adminMemo: request.adminMemo || '',
});

export const getAdminRequestRestoreTargetsForLogs = (request, requestLogs = []) => {
  if (!request?.id) return [];

  const latestStatusLog = requestLogs.find(
    (log) =>
      [
        RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED,
        RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
      ].includes(log.action) &&
      log.nextStatus === request.status &&
      log.previousStatus &&
      log.previousStatus !== request.status
  );

  const fallbackTargets =
    RENTAL_REQUEST_RESTORE_TARGETS[request.status] || [];

  return [
    ...new Set(
      [latestStatusLog?.previousStatus, ...fallbackTargets].filter(Boolean)
    ),
  ].filter((targetStatus) =>
    (RENTAL_REQUEST_STATUS_TRANSITIONS[request.status] || []).includes(
      targetStatus
    )
  );
};

export default function useAdminRequestDetailController({
  commitAdminRequestEdit,
  commitAdminRequestStatusRestore,
  enabled,
  mutationVersion,
  resetPage,
  selectedRequestId,
  setSelectedRequestId,
  triggerToast,
}) {
  const [requestLogs, setRequestLogs] = useState([]);
  const [requestLogsReady, setRequestLogsReady] = useState(false);
  const [requestLogsLoadErrorMessage, setRequestLogsLoadErrorMessage] =
    useState('');

  const [editDialog, setEditDialog] = useState(null);
  const [editForm, setEditForm] = useState(createDefaultAdminRequestEditForm);
  const [editSaving, setEditSaving] = useState(false);

  const [restoreDialog, setRestoreDialog] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState('');
  const [restoreReason, setRestoreReason] = useState('');
  const [restoreSaving, setRestoreSaving] = useState(false);

  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    if (!enabled || !selectedRequestId) {
      setRequestLogs([]);
      setRequestLogsLoadErrorMessage('');
      setRequestLogsReady(true);
      return undefined;
    }

    setRequestLogs([]);
    setRequestLogsReady(false);
    setRequestLogsLoadErrorMessage('');

    const cutoverConfig = readAdminRentalRequestCutoverConfig();
    if (cutoverConfig.readRequested) {
      let cancelled = false;
      const loadPostgresEvents = async () => {
        try {
          const firebaseUser = firebaseAuth.currentUser;
          if (!firebaseUser) throw new Error('admin-firebase-sign-in-required');
          const firebaseIdToken = await firebaseUser.getIdToken();
          const payload = await clerkStagingClient.getAdminRentalRequestEvents(
            firebaseIdToken,
            selectedRequestId
          );
          if (cancelled) return;
          const events = payload?.adminRentalRequestEvents?.events || [];
          setRequestLogs(events);
          setRequestLogsLoadErrorMessage('');
          setRequestLogsReady(true);
          publishAdminRentalRequestCutoverObservation({
            readRequested: true,
            readSource: 'postgresql',
            firestoreWatcher: 'disabled',
            auditSource: 'postgresql',
            auditCount: events.length,
            error: '',
          });
        } catch (error) {
          if (cancelled) return;
          console.error('PostgreSQL selected rental request events error:', error);
          setRequestLogs([]);
          setRequestLogsLoadErrorMessage('선택한 대여 신청의 PostgreSQL 처리 이력을 불러오지 못했습니다.');
          setRequestLogsReady(true);
          publishAdminRentalRequestCutoverObservation({
            readRequested: true,
            readSource: 'postgresql',
            firestoreWatcher: 'disabled',
            auditSource: 'postgresql-error',
            auditCount: 0,
            error: error?.code || error?.message || 'admin-rental-request-events-read-failed',
          });
        }
      };
      void loadPostgresEvents();
      return () => {
        cancelled = true;
      };
    }

    return onSnapshot(
      firestoreQuery(
        RENTAL_REQUEST_LOGS_COLLECTION_REF,
        where('requestId', '==', selectedRequestId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(100)
      ),
      (snapshot) => {
        setRequestLogs(
          snapshot.docs.map((logDoc) => ({
            ...logDoc.data(),
            id: logDoc.id,
          }))
        );
        setRequestLogsLoadErrorMessage('');
        setRequestLogsReady(true);
      },
      (error) => {
        const message = '선택한 대여 신청의 처리 이력을 불러오지 못했습니다.';
        console.error('Selected rental request logs sync error:', error);
        setRequestLogs([]);
        setRequestLogsLoadErrorMessage(message);
        setRequestLogsReady(true);
      }
    );
  }, [enabled, mutationVersion, selectedRequestId]);

  useEffect(() => {
    if (selectedRequestId) return;

    setEditDialog(null);
    setEditForm(createDefaultAdminRequestEditForm());
    setEditSaving(false);
    setRestoreDialog(null);
    setRestoreTarget('');
    setRestoreReason('');
    setRestoreSaving(false);
  }, [selectedRequestId]);

  const requestLogsByRequestId = useMemo(() => {
    const map = new Map();

    if (selectedRequestId) {
      map.set(selectedRequestId, requestLogs);
    }

    return map;
  }, [requestLogs, selectedRequestId]);

  const getAdminRequestRestoreTargets = useCallback(
    (request) => getAdminRequestRestoreTargetsForLogs(request, requestLogs),
    [requestLogs]
  );

  const openAdminRequestEditDialog = useCallback(
    (request) => {
      if (!enabled || !request?.id || request.id !== selectedRequestId) {
        triggerToastRef.current?.(
          '관리자 인증과 정식 신청 문서를 확인해 주세요.',
          'error'
        );
        return;
      }

      setEditDialog({ requestId: request.id });
      setEditForm(createDefaultAdminRequestEditForm(request));
    },
    [enabled, selectedRequestId]
  );

  const closeAdminRequestEditDialog = useCallback(() => {
    if (editSaving) return;

    setEditDialog(null);
    setEditForm(createDefaultAdminRequestEditForm());
  }, [editSaving]);

  const saveAdminRequestEdit = useCallback(async () => {
    if (editSaving || !editDialog?.requestId) return false;

    if (typeof commitAdminRequestEdit !== 'function') {
      triggerToastRef.current?.(
        '신청 정보 수정 기능을 불러오지 못했습니다.',
        'error'
      );
      return false;
    }

    setEditSaving(true);

    try {
      const saved = await commitAdminRequestEdit({
        form: editForm,
        requestId: editDialog.requestId,
      });

      if (saved === true) {
        setEditDialog(null);
        setEditForm(createDefaultAdminRequestEditForm());
      }

      return saved === true;
    } finally {
      setEditSaving(false);
    }
  }, [commitAdminRequestEdit, editDialog, editForm, editSaving]);

  const openAdminRequestRestoreDialog = useCallback(
    (request) => {
      if (!enabled || !request?.id || request.id !== selectedRequestId) {
        triggerToastRef.current?.(
          '관리자 인증과 정식 신청 문서를 확인해 주세요.',
          'error'
        );
        return;
      }

      const targetOptions = getAdminRequestRestoreTargetsForLogs(request, requestLogs);

      if (targetOptions.length === 0) {
        triggerToastRef.current?.(
          '현재 신청은 되돌릴 수 있는 이전 상태가 없습니다.',
          'error'
        );
        return;
      }

      setRestoreDialog({
        requestId: request.id,
        targetOptions,
      });
      setRestoreTarget(targetOptions[0]);
      setRestoreReason('');
    },
    [enabled, requestLogs, selectedRequestId]
  );

  const closeAdminRequestRestoreDialog = useCallback(() => {
    if (restoreSaving) return;

    setRestoreDialog(null);
    setRestoreTarget('');
    setRestoreReason('');
  }, [restoreSaving]);

  const restoreAdminRequestStatus = useCallback(async () => {
    if (restoreSaving || !restoreDialog?.requestId) return false;

    if (typeof commitAdminRequestStatusRestore !== 'function') {
      triggerToastRef.current?.(
        '신청 상태 복구 기능을 불러오지 못했습니다.',
        'error'
      );
      return false;
    }

    setRestoreSaving(true);

    try {
      const restored = await commitAdminRequestStatusRestore({
        nextStatus: restoreTarget,
        requestId: restoreDialog.requestId,
        restoreReason,
      });

      if (restored === true) {
        setRestoreDialog(null);
        setRestoreTarget('');
        setRestoreReason('');
        setSelectedRequestId('');
        resetPage?.();
      }

      return restored === true;
    } finally {
      setRestoreSaving(false);
    }
  }, [
    commitAdminRequestStatusRestore,
    resetPage,
    restoreDialog,
    restoreReason,
    restoreSaving,
    restoreTarget,
    setSelectedRequestId,
  ]);

  return {
    adminRequestEditDialog: editDialog,
    adminRequestEditForm: editForm,
    adminRequestEditSaving: editSaving,
    adminRequestRestoreDialog: restoreDialog,
    adminRequestRestoreReason: restoreReason,
    adminRequestRestoreSaving: restoreSaving,
    adminRequestRestoreTarget: restoreTarget,
    closeAdminRequestEditDialog,
    closeAdminRequestRestoreDialog,
    getAdminRequestRestoreTargets,
    openAdminRequestEditDialog,
    openAdminRequestRestoreDialog,
    rentalRequestLogsByRequestId: requestLogsByRequestId,
    rentalRequestLogsLoadErrorMessage: requestLogsLoadErrorMessage,
    rentalRequestLogsReady: requestLogsReady,
    restoreAdminRequestStatus,
    saveAdminRequestEdit,
    setAdminRequestEditForm: setEditForm,
    setAdminRequestRestoreReason: setRestoreReason,
    setAdminRequestRestoreTarget: setRestoreTarget,
  };
}
