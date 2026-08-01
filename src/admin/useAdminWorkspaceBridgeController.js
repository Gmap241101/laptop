import { useCallback, useRef, useState } from 'react';

import {
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
} from '../constants/appConstants.js';

const createInitialMemberAccountsNavigationRequest = () => ({
  requestId: 0,
  query: '',
  statusFilter: 'all',
});

const createInitialRequestsNavigationRequest = () => ({
  requestId: 0,
  query: '',
  quickFilter: ADMIN_REQUEST_QUICK_FILTER.ALL,
  requestTab: ADMIN_REQUEST_TAB.PENDING,
  selectedRequestId: '',
});

const createEmptyRequestsController = () => ({
  clearSelection: null,
  getRequestById: null,
  resetPage: null,
  updateRequests: null,
});

export default function useAdminWorkspaceBridgeController() {
  const [adminMemberAccountsNavigationRequest, setAdminMemberAccountsNavigationRequest] =
    useState(createInitialMemberAccountsNavigationRequest);
  const [adminRequestsNavigationRequest, setAdminRequestsNavigationRequest] = useState(
    createInitialRequestsNavigationRequest
  );
  const [adminRequestsMutationVersion, setAdminRequestsMutationVersion] = useState(0);
  const adminRequestsControllerRef = useRef(createEmptyRequestsController());

  const handleAdminRequestsControllerStateChange = useCallback((nextState) => {
    adminRequestsControllerRef.current = {
      clearSelection:
        typeof nextState?.clearSelection === 'function'
          ? nextState.clearSelection
          : null,
      getRequestById:
        typeof nextState?.getRequestById === 'function'
          ? nextState.getRequestById
          : null,
      resetPage:
        typeof nextState?.resetPage === 'function'
          ? nextState.resetPage
          : null,
      updateRequests:
        typeof nextState?.updateRequests === 'function'
          ? nextState.updateRequests
          : null,
    };
  }, []);

  const getAdminRequestById = useCallback(
    (requestId) =>
      adminRequestsControllerRef.current.getRequestById?.(requestId) || null,
    []
  );

  const updateAdminRequestPanelRequests = useCallback((updater) => {
    adminRequestsControllerRef.current.updateRequests?.(updater);
  }, []);

  const resetAdminRequestPanelPage = useCallback(() => {
    adminRequestsControllerRef.current.resetPage?.();
  }, []);

  const clearAdminRequestPanelSelection = useCallback(() => {
    adminRequestsControllerRef.current.clearSelection?.();
  }, []);

  const notifyAdminRequestMutation = useCallback(() => {
    setAdminRequestsMutationVersion((currentVersion) => currentVersion + 1);
  }, []);

  return {
    adminMemberAccountsNavigationRequest,
    adminRequestsMutationVersion,
    adminRequestsNavigationRequest,
    clearAdminRequestPanelSelection,
    getAdminRequestById,
    handleAdminRequestsControllerStateChange,
    notifyAdminRequestMutation,
    resetAdminRequestPanelPage,
    setAdminMemberAccountsNavigationRequest,
    setAdminRequestsNavigationRequest,
    updateAdminRequestPanelRequests,
  };
}
