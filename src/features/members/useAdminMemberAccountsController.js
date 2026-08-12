import { useEffect, useMemo, useRef, useState } from 'react';
import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishMemberAuthorityObservation } from './memberAuthorityCutover.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';

export const ADMIN_MEMBER_ACCOUNT_PAGE_SIZE_OPTIONS = Object.freeze([10, 30, 50]);
export const DEFAULT_ADMIN_MEMBER_ACCOUNT_PAGE_SIZE = 10;

const memberAccountsSessionState = {
  lastNavigationRequestId: 0,
  page: 1,
  query: '',
  statusFilter: 'all',
  pageSize: DEFAULT_ADMIN_MEMBER_ACCOUNT_PAGE_SIZE,
};

const matchesMemberSearch = (account, normalizedSearch) =>
  [
    account.name,
    account.email,
    account.team,
    account.phone,
    account.uid,
  ].some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(normalizedSearch)
  );

const getAdminUidSet = (registeredAdminAccounts) =>
  new Set(
    (registeredAdminAccounts || [])
      .flatMap((account) => [account.id, account.authUid])
      .filter(Boolean)
  );

const STATUS_COUNT_KEY_BY_VALUE = {
  [USER_PROFILE_STATUS.PENDING]: 'pending',
  [USER_PROFILE_STATUS.ACTIVE]: 'active',
  [USER_PROFILE_STATUS.PROFILE_REQUIRED]: 'profileRequired',
  [USER_PROFILE_STATUS.BLOCKED]: 'blocked',
  [USER_PROFILE_STATUS.RETIRED]: 'retired',
};

export default function useAdminMemberAccountsController({
  prerequisitesReady,
  enabled,
  navigationRequest,
  registeredAdminAccounts,
  triggerToast,
}) {
  const navigationRequestId = Number(navigationRequest?.requestId || 0);
  const initialNavigationRequestIdRef = useRef(null);

  if (initialNavigationRequestIdRef.current === null) {
    initialNavigationRequestIdRef.current = navigationRequestId;

    if (
      navigationRequestId >
      memberAccountsSessionState.lastNavigationRequestId
    ) {
      memberAccountsSessionState.lastNavigationRequestId =
        navigationRequestId;
      memberAccountsSessionState.page = 1;
      memberAccountsSessionState.query = String(
        navigationRequest?.query || ''
      );
      memberAccountsSessionState.statusFilter = String(
        navigationRequest?.statusFilter || 'all'
      );
    }
  }

  const [accounts, setAccounts] = useState([]);
  const [page, setPage] = useState(() => memberAccountsSessionState.page);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [query, setQuery] = useState(() => memberAccountsSessionState.query);
  const [statusFilter, setStatusFilter] = useState(
    () => memberAccountsSessionState.statusFilter
  );
  const [pageSize, setPageSize] = useState(
    () => memberAccountsSessionState.pageSize
  );
  const [statusCounts, setStatusCounts] = useState({
    pending: 0,
    active: 0,
    profileRequired: 0,
    blocked: 0,
    retired: 0,
  });

  const triggerToastRef = useRef(triggerToast);
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    memberAccountsSessionState.page = page;
    memberAccountsSessionState.query = query;
    memberAccountsSessionState.statusFilter = statusFilter;
    memberAccountsSessionState.pageSize = pageSize;
  }, [page, pageSize, query, statusFilter]);

  useEffect(() => {
    if (
      !navigationRequestId ||
      memberAccountsSessionState.lastNavigationRequestId ===
        navigationRequestId
    ) {
      return;
    }

    const nextQuery = String(navigationRequest?.query || '');
    const nextStatusFilter = String(
      navigationRequest?.statusFilter || 'all'
    );

    memberAccountsSessionState.lastNavigationRequestId =
      navigationRequestId;
    memberAccountsSessionState.page = 1;
    memberAccountsSessionState.query = nextQuery;
    memberAccountsSessionState.statusFilter = nextStatusFilter;
    setPage(1);
    setQuery(nextQuery);
    setStatusFilter(nextStatusFilter);
  }, [navigationRequest, navigationRequestId]);



  useEffect(() => {
    setPage(1);
  }, [pageSize, query, statusFilter]);

  useEffect(() => {
    if (!prerequisitesReady) {
      setReady(false);
      return undefined;
    }
    if (!enabled) {
      setAccounts([]);
      setHasNextPage(false);
      setTotalCount(0);
      setReady(true);
      setLoadErrorMessage('');
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    setLoadErrorMessage('');
    void clerkStagingClient.getAdminMembers('', {
      status: statusFilter,
      q: String(debouncedQuery || '').trim(),
      page,
      pageSize,
    })
      .then((payload) => {
        if (cancelled) return;
        const result = payload?.adminMembers || {};
        setAccounts(Array.isArray(result.accounts) ? result.accounts : []);
        setHasNextPage(Boolean(result.hasNextPage));
        setTotalCount(Number(result.totalCount || 0));
        setStatusCounts(result.statusCounts || { pending: 0, active: 0, profileRequired: 0, blocked: 0, retired: 0 });
        setReady(true);
        setLoadErrorMessage('');
        publishMemberAuthorityObservation({ adminMemberReadSource: 'postgresql', adminMemberReadCount: Number(result.totalCount || 0), error: '' });
      })
      .catch((error) => {
        if (cancelled) return;
        const message = '회원 계정 목록을 PostgreSQL에서 불러오지 못했습니다.';
        console.error('Admin PostgreSQL member accounts read error:', error);
        setAccounts([]);
        setHasNextPage(false);
        setTotalCount(0);
        setReady(true);
        setLoadErrorMessage(message);
        publishMemberAuthorityObservation({ adminMemberReadSource: 'unavailable', adminMemberReadCount: 0, error: error?.code || 'admin_member_postgresql_read_failed' });
        triggerToastRef.current(message, 'error');
      });
    return () => { cancelled = true; };
  }, [
    debouncedQuery,
    enabled,
    page,
    pageSize,
    prerequisitesReady,
    refreshRevision,
    statusFilter,
  ]);

  useEffect(() => {
    if (
      enabled &&
      statusFilter !== 'all' &&
      !String(debouncedQuery || '').trim()
    ) {
      const countKey = STATUS_COUNT_KEY_BY_VALUE[statusFilter];

      setTotalCount(
        countKey ? Number(statusCounts?.[countKey]) || 0 : 0
      );
    }
  }, [debouncedQuery, enabled, statusCounts, statusFilter]);

  const managedAccounts = useMemo(() => {
    const adminUidSet = getAdminUidSet(registeredAdminAccounts);

    return (accounts || []).filter(
      (account) => !adminUidSet.has(account.uid)
    );
  }, [accounts, registeredAdminAccounts]);

  const searchMode = Boolean(String(query || '').trim());

  const matchedManagedAccounts = useMemo(() => {
    const normalizedQuery = String(query || '')
      .trim()
      .toLowerCase();

    return managedAccounts.filter((account) => {
      const accountStatus = account.status || '';
      const matchesStatus =
        statusFilter === 'all' || accountStatus === statusFilter;

      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      return matchesMemberSearch(account, normalizedQuery);
    });
  }, [managedAccounts, query, statusFilter]);

  const serverPaged = true;
  const totalPages = Math.max(
    1,
    Math.ceil(
      (serverPaged ? totalCount : searchMode ? matchedManagedAccounts.length : totalCount) /
        pageSize
    )
  );

  const safePage = Math.min(page, totalPages);

  const filteredAccounts = useMemo(
    () => {
      if (serverPaged) return matchedManagedAccounts;
      return searchMode
        ? matchedManagedAccounts.slice(
            (safePage - 1) * pageSize,
            safePage * pageSize
          )
        : matchedManagedAccounts;
    },
    [matchedManagedAccounts, pageSize, safePage, searchMode, serverPaged]
  );

  const refreshAdminUserAccounts = () => {
    setRefreshRevision((revision) => revision + 1);
  };

  const resultCount = serverPaged ? totalCount : searchMode ? matchedManagedAccounts.length : totalCount;

  return {
    adminUserAccountHasNextPage: hasNextPage,
    adminUserAccountPage: page,
    adminUserAccountResultCount: resultCount,
    adminUserAccountPageSize: pageSize,
    adminUserAccountQuery: query,
    adminUserAccountSearchMode: searchMode,
    adminUserAccountStatusCounts: statusCounts,
    adminUserAccountStatusFilter: statusFilter,
    adminUserAccountTotalPages: totalPages,
    adminUserAccountsLoadErrorMessage: loadErrorMessage,
    adminUserAccountsReady: ready,
    filteredManagedUserAccounts: filteredAccounts,
    refreshAdminUserAccounts,
    safeAdminUserAccountPage: safePage,
    setAdminUserAccountPage: setPage,
    setAdminUserAccountPageSize: setPageSize,
    setAdminUserAccountQuery: setQuery,
    setAdminUserAccountStatusFilter: setStatusFilter,
  };
}
