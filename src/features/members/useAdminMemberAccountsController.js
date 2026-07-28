import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCountFromServer,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  startAfter,
  where,
} from 'firebase/firestore';

import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import { USER_ACCOUNTS_COLLECTION_REF } from '../../firebase.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
  scanFirestoreMatches,
} from '../../services/progressiveFirestoreSearch.js';

export const ADMIN_MEMBER_ACCOUNT_PAGE_SIZE = 20;

const memberAccountsSessionState = {
  lastNavigationRequestId: 0,
  page: 1,
  query: '',
  statusFilter: 'all',
};

const createEmptySearchCache = (key) => ({
  key,
  cursor: null,
  exhausted: false,
  matches: [],
});

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
  const [query, setQuery] = useState(() => memberAccountsSessionState.query);
  const [statusFilter, setStatusFilter] = useState(
    () => memberAccountsSessionState.statusFilter
  );
  const [statusCounts, setStatusCounts] = useState({
    pending: 0,
    active: 0,
    profileRequired: 0,
    blocked: 0,
    retired: 0,
  });

  const cursorByPageRef = useRef(new Map([[1, null]]));
  const cursorKeyRef = useRef('');
  const searchCacheRef = useRef(null);
  const triggerToastRef = useRef(triggerToast);
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    memberAccountsSessionState.page = page;
    memberAccountsSessionState.query = query;
    memberAccountsSessionState.statusFilter = statusFilter;
  }, [page, query, statusFilter]);

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
    cursorByPageRef.current = new Map([[1, null]]);
    searchCacheRef.current = null;
  }, [navigationRequest, navigationRequestId]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    void Promise.all([
      [
        'pending',
        getCountFromServer(
          firestoreQuery(
            USER_ACCOUNTS_COLLECTION_REF,
            where('status', '==', USER_PROFILE_STATUS.PENDING)
          )
        ),
      ],
      [
        'active',
        getCountFromServer(
          firestoreQuery(
            USER_ACCOUNTS_COLLECTION_REF,
            where('status', '==', USER_PROFILE_STATUS.ACTIVE)
          )
        ),
      ],
      [
        'profileRequired',
        getCountFromServer(
          firestoreQuery(
            USER_ACCOUNTS_COLLECTION_REF,
            where('status', '==', USER_PROFILE_STATUS.PROFILE_REQUIRED)
          )
        ),
      ],
      [
        'blocked',
        getCountFromServer(
          firestoreQuery(
            USER_ACCOUNTS_COLLECTION_REF,
            where('status', '==', USER_PROFILE_STATUS.BLOCKED)
          )
        ),
      ],
      [
        'retired',
        getCountFromServer(
          firestoreQuery(
            USER_ACCOUNTS_COLLECTION_REF,
            where('status', '==', USER_PROFILE_STATUS.RETIRED)
          )
        ),
      ],
    ])
      .then((entries) => {
        if (cancelled) return;

        setStatusCounts(
          Object.fromEntries(
            entries.map(([key, countSnapshot]) => [
              key,
              countSnapshot.data().count,
            ])
          )
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('User account status counts error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    setPage(1);
    cursorByPageRef.current = new Map([[1, null]]);
  }, [query, statusFilter]);

  useEffect(() => {
    if (!prerequisitesReady) {
      setReady(false);
      return undefined;
    }

    if (!enabled) {
      cursorKeyRef.current = '';
      cursorByPageRef.current = new Map([[1, null]]);
      searchCacheRef.current = null;
      setAccounts([]);
      setHasNextPage(false);
      setTotalCount(0);
      setReady(true);
      setLoadErrorMessage('');
      return undefined;
    }

    setReady(false);
    setLoadErrorMessage('');

    const normalizedSearch = String(debouncedQuery || '')
      .trim()
      .toLowerCase();
    const searchMode = Boolean(normalizedSearch);
    const statusConstraints =
      statusFilter === 'all'
        ? []
        : [where('status', '==', statusFilter)];

    if (searchMode) {
      const searchKey = [statusFilter, normalizedSearch].join('|');
      const previousCache = searchCacheRef.current;
      const cache =
        previousCache?.key === searchKey
          ? previousCache
          : createEmptySearchCache(searchKey);

      searchCacheRef.current = cache;
      let cancelled = false;

      void scanFirestoreMatches({
        collectionRef: USER_ACCOUNTS_COLLECTION_REF,
        constraints: [
          ...statusConstraints,
          orderBy('createdAt', 'desc'),
        ],
        startCursor: cache.cursor,
        existingMatches: cache.matches,
        targetMatchCount: page * ADMIN_MEMBER_ACCOUNT_PAGE_SIZE + 1,
        batchSize: DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
        mapDocument: (userDoc) => ({
          ...userDoc.data(),
          uid: userDoc.data().uid || userDoc.id,
        }),
        matchesDocument: (account) =>
          matchesMemberSearch(account, normalizedSearch),
        isCancelled: () => cancelled,
      })
        .then((result) => {
          if (cancelled || result.cancelled) return;

          searchCacheRef.current = {
            key: searchKey,
            cursor: result.cursor,
            exhausted: result.exhausted,
            matches: result.matches,
          };
          setAccounts(result.matches);
          setHasNextPage(
            result.matches.length > page * ADMIN_MEMBER_ACCOUNT_PAGE_SIZE ||
              !result.exhausted
          );
          setTotalCount(result.matches.length);
          setReady(true);
          setLoadErrorMessage('');
        })
        .catch((error) => {
          if (cancelled) return;

          const message =
            '회원 계정 검색 결과를 불러오지 못했습니다. Firestore Rules와 필요한 인덱스를 확인해 주세요.';

          console.error('User accounts progressive search error:', error);
          setAccounts([]);
          setHasNextPage(false);
          setReady(true);
          setLoadErrorMessage(message);
          triggerToastRef.current(message, 'error');
        });

      return () => {
        cancelled = true;
      };
    }

    searchCacheRef.current = null;
    const cursorKey = `${statusFilter}|browse`;
    const cursorKeyChanged = cursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      cursorKeyRef.current = cursorKey;
      cursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = cursorByPageRef.current.get(page);

    if (page > 1 && !pageCursor) {
      setPage(1);
      return undefined;
    }

    const memberSource = firestoreQuery(
      USER_ACCOUNTS_COLLECTION_REF,
      ...statusConstraints,
      orderBy('createdAt', 'desc'),
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(ADMIN_MEMBER_ACCOUNT_PAGE_SIZE + 1)
    );

    const unsubscribe = onSnapshot(
      memberSource,
      (snapshot) => {
        const sourceDocs = snapshot.docs;
        const visibleDocs = sourceDocs.slice(
          0,
          ADMIN_MEMBER_ACCOUNT_PAGE_SIZE
        );
        const hasNext = sourceDocs.length > ADMIN_MEMBER_ACCOUNT_PAGE_SIZE;

        if (visibleDocs.length > 0) {
          cursorByPageRef.current.set(
            page + 1,
            visibleDocs[visibleDocs.length - 1]
          );
        }

        setAccounts(
          visibleDocs.map((userDoc) => ({
            ...userDoc.data(),
            uid: userDoc.data().uid || userDoc.id,
          }))
        );
        setHasNextPage(hasNext);
        setReady(true);
        setLoadErrorMessage('');
      },
      (error) => {
        const message =
          '회원 계정 목록을 불러오지 못했습니다. Firestore Rules와 필요한 인덱스를 확인해 주세요.';

        console.error('User accounts paged sync error:', error);
        setAccounts([]);
        setHasNextPage(false);
        setReady(true);
        setLoadErrorMessage(message);
        triggerToastRef.current(message, 'error');
      }
    );

    if (cursorKeyChanged && statusFilter === 'all') {
      void getCountFromServer(USER_ACCOUNTS_COLLECTION_REF)
        .then((countSnapshot) => {
          setTotalCount(countSnapshot.data().count);
        })
        .catch((error) => {
          console.error('User accounts count error:', error);
        });
    }

    return unsubscribe;
  }, [
    debouncedQuery,
    enabled,
    page,
    prerequisitesReady,
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

  const totalPages = Math.max(
    1,
    Math.ceil(
      (searchMode ? matchedManagedAccounts.length : totalCount) /
        ADMIN_MEMBER_ACCOUNT_PAGE_SIZE
    )
  );

  const safePage = Math.min(page, totalPages);

  const filteredAccounts = useMemo(
    () =>
      searchMode
        ? matchedManagedAccounts.slice(
            (safePage - 1) * ADMIN_MEMBER_ACCOUNT_PAGE_SIZE,
            safePage * ADMIN_MEMBER_ACCOUNT_PAGE_SIZE
          )
        : matchedManagedAccounts,
    [matchedManagedAccounts, safePage, searchMode]
  );

  return {
    adminUserAccountHasNextPage: hasNextPage,
    adminUserAccountPage: page,
    adminUserAccountQuery: query,
    adminUserAccountSearchMode: searchMode,
    adminUserAccountStatusCounts: statusCounts,
    adminUserAccountStatusFilter: statusFilter,
    adminUserAccountTotalPages: totalPages,
    adminUserAccountsLoadErrorMessage: loadErrorMessage,
    adminUserAccountsReady: ready,
    filteredManagedUserAccounts: filteredAccounts,
    safeAdminUserAccountPage: safePage,
    setAdminUserAccountPage: setPage,
    setAdminUserAccountQuery: setQuery,
    setAdminUserAccountStatusFilter: setStatusFilter,
  };
}
