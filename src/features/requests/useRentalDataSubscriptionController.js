import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, onSnapshot, query as firestoreQuery, where } from '../../platform/retiredLegacyDataCompat.js';

import { RENTAL_REQUESTS_COLLECTION_REF } from '../../platform/appDataRefs.js';
import { publishRentalRequestReadObservation } from './rentalRequestReadParity.js';
import {
  chooseRentalRequestReadSource,
  loadRentalRequestsWithoutFirestoreWatcher,
  publishRentalRequestCutoverObservation,
  readRentalRequestCandidatePayload,
  readRentalRequestCutoverConfig,
  shouldUseRentalRequestFirestoreWatcher,
} from './rentalRequestReadCutover.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  normalizeAssetReservations,
  normalizePublicCatalogAssets,
} from '../../services/publicAssetCatalog.js';
import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import { normalizeEmailAddress } from '../../utils/memberPolicy.js';
import {
  publishAssetDomainCutoverObservation,
  readAssetDomainCutoverConfig,
} from '../assets/assetDomainCutover.js';
import {
  POLICY_CONTENT_DOMAINS,
  getPolicyContentDocument,
  publishPolicyContentObservation,
  readPolicyContentCutoverConfig,
  requestPolicyContentDomain,
} from '../content/policyContentCutover.js';
import {
  isLegacyFirestoreReadFallbackAllowed,
  readLegacyFirestoreReadFallbackConfig,
  recordLegacyFirestoreReadFallbackBlocked,
} from '../compatibility/legacyFirestoreReadFallbackCutover.js';
import { readUserAccountLifecycleCutoverConfig } from '../auth/userAccountLifecycleCutover.js';
import useSiteContentRefreshRevision from '../content/useSiteContentRefreshRevision.js';

const createDefaultSplitSourceReady = () => ({
  config: false,
  assets: false,
  availability: false,
  borrowers: false,
});

const createDefaultSplitSourceErrors = () => ({
  config: '',
  assets: '',
  availability: '',
  borrowers: '',
});

export const useRentalDataSubscriptionState = () => {
  const [splitPublicConfig, setSplitPublicConfig] = useState(null);
  const [splitRentalAssets, setSplitRentalAssets] = useState([]);
  const [publicCatalogAssets, setPublicCatalogAssets] = useState([]);
  const [publicCatalogAssetsReady, setPublicCatalogAssetsReady] = useState(false);
  const [splitRentalAvailability, setSplitRentalAvailability] = useState([]);
  const [splitRentalBorrowers, setSplitRentalBorrowers] = useState([]);
  const [splitStorageVersion, setSplitStorageVersion] = useState(0);
  const [splitSourceReady, setSplitSourceReady] = useState(
    createDefaultSplitSourceReady
  );
  const [splitSourceErrors, setSplitSourceErrors] = useState(
    createDefaultSplitSourceErrors
  );
  const [rentalRequests, setRentalRequests] = useState([]);
  const [rentalRequestsReady, setRentalRequestsReady] = useState(false);
  const [rentalRequestsLoadErrorMessage, setRentalRequestsLoadErrorMessage] =
    useState('');

  return {
    publicCatalogAssets,
    publicCatalogAssetsReady,
    rentalRequests,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    setPublicCatalogAssets,
    setPublicCatalogAssetsReady,
    setRentalRequests,
    setRentalRequestsLoadErrorMessage,
    setRentalRequestsReady,
    setSplitPublicConfig,
    setSplitRentalAssets,
    setSplitRentalAvailability,
    setSplitRentalBorrowers,
    setSplitSourceErrors,
    setSplitSourceReady,
    setSplitStorageVersion,
    splitPublicConfig,
    splitRentalAssets,
    splitRentalAvailability,
    splitRentalBorrowers,
    splitSourceErrors,
    splitSourceReady,
    splitStorageVersion,
  };
};

export function useOwnRentalRequestsSubscriptionController({
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  firebaseAuthReady,
  firebaseAuthUser,
  isAdminAuthenticated,
  setRentalRequests,
  setRentalRequestsLoadErrorMessage,
  setRentalRequestsReady,
  triggerToast,
  userAuthSessionUid,
  userProfile,
  userProfileReady,
}) {
  const triggerToastRef = useRef(triggerToast);
  const previousAccountUidsKey = useMemo(
    () =>
      JSON.stringify(
        (Array.isArray(userProfile?.previousAccountUids)
          ? userProfile.previousAccountUids
          : []
        )
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .sort()
      ),
    [userProfile?.previousAccountUids]
  );

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady || !userProfileReady) {
      setRentalRequestsReady(false);
      return undefined;
    }

    const lifecycleConfig = readUserAccountLifecycleCutoverConfig();
    const clerkUserSessionReady = Boolean(
      !lifecycleConfig.userAuthRequested ||
      (firebaseAuthUser?.uid && userAuthSessionUid === firebaseAuthUser.uid)
    );
    const canReadOwnRentalRequests = Boolean(
      firebaseAuthUser &&
        clerkUserSessionReady &&
        !currentAuthRoleErrorMessage &&
        [
          USER_PROFILE_STATUS.ACTIVE,
          USER_PROFILE_STATUS.PROFILE_REQUIRED,
        ].includes(userProfile?.status)
    );

    if (isAdminAuthenticated) {
      setRentalRequests([]);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
      return undefined;
    }

    if (firebaseAuthUser && !clerkUserSessionReady) {
      setRentalRequests([]);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(false);
      return undefined;
    }

    if (!canReadOwnRentalRequests) {
      setRentalRequests([]);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
      return undefined;
    }

    setRentalRequestsReady(false);
    setRentalRequestsLoadErrorMessage('');

    const linkedRequesterUids = [
      ...new Set(
        [
          firebaseAuthUser.uid,
          ...(Array.isArray(userProfile?.previousAccountUids)
            ? userProfile.previousAccountUids
            : []),
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      ),
    ];
    const requesterEmail = normalizeEmailAddress(
      firebaseAuthUser.email || userProfile?.email || ''
    );
    const sourceDefinitions = linkedRequesterUids.map((requesterUid, index) => ({
      key: `uid:${index}`,
      required: true,
      source: firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('requesterUid', '==', requesterUid)
      ),
    }));

    if (requesterEmail) {
      sourceDefinitions.push({
        key: 'email',
        required: false,
        source: firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterEmail', '==', requesterEmail)
        ),
      });
    }

    if (sourceDefinitions.length === 0) {
      setRentalRequests([]);
      setRentalRequestsReady(true);
      return undefined;
    }

    let disposed = false;
    const cutoverConfig = readRentalRequestCutoverConfig();
    const legacyFallbackConfig = readLegacyFirestoreReadFallbackConfig();
    const legacyFallbackAllowed = isLegacyFirestoreReadFallbackAllowed(legacyFallbackConfig);

    const mergeRequestLists = (requestLists) => {
      const requestMap = new Map();
      requestLists.forEach((requests) => {
        requests.forEach((request) => {
          requestMap.set(request.id, {
            ...(requestMap.get(request.id) || {}),
            ...request,
          });
        });
      });
      return Array.from(requestMap.values());
    };

    const loadPostgresCandidate = async () => {
      const payload = await clerkStagingClient.getRentalRequestReadCandidate();
      return Object.freeze({
        ...readRentalRequestCandidatePayload(payload),
        sourceRefreshes: 0,
      });
    };

    const loadFirestoreOnce = async () => {
      const requestLists = [];
      let firestoreFallbackReads = 0;

      for (const { key, required, source } of sourceDefinitions) {
        firestoreFallbackReads += 1;
        try {
          const snapshot = await getDocs(source);
          requestLists.push(
            snapshot.docs.map((requestDocument) => ({
              ...requestDocument.data(),
              id: requestDocument.id,
            }))
          );
        } catch (error) {
          console.error(`Own rental requests ${key} one-time fallback error:`, error);
          if (required) {
            const fallbackError = new Error(
              'Required Firestore rental request fallback query failed.'
            );
            fallbackError.code =
              error?.code || 'rental-request-firestore-fallback-failed';
            fallbackError.firestoreFallbackReads = firestoreFallbackReads;
            throw fallbackError;
          }
        }
      }

      return {
        requests: mergeRequestLists(requestLists),
        firestoreFallbackReads,
      };
    };

    if (!shouldUseRentalRequestFirestoreWatcher(cutoverConfig)) {
      let refreshInFlight = false;
      let initialLoadComplete = false;
      let wasAwayFromWindow = false;
      const refreshPostgresRequests = () => {
        if (disposed || refreshInFlight) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        refreshInFlight = true;
        void loadRentalRequestsWithoutFirestoreWatcher({
          loadPostgresCandidate: () =>
            loadPostgresCandidate({ refreshSource: true }),
          loadFirestoreFallback: loadFirestoreOnce,
          allowFirestoreFallback: legacyFallbackAllowed,
        })
          .then((result) => {
            if (disposed) return;
            setRentalRequests(result.requests);
            setRentalRequestsLoadErrorMessage('');
            setRentalRequestsReady(true);
            initialLoadComplete = true;
            publishRentalRequestCutoverObservation({
              requested: cutoverConfig.requested,
              enabled: cutoverConfig.enabled,
              activeSource: result.source,
              equivalent: result.equivalent,
              changedRequestIds: result.changedRequestIds,
              changedFields: result.changedFields,
              fallbackReason: result.fallbackReason,
              firestoreWatcherDisabled: true,
              firestoreFallbackReads: result.firestoreFallbackReads,
              shadowSyncedAt: result.shadowSyncedAt,
              sourceRefreshes: result.sourceRefreshes,
            });
          })
          .catch((error) => {
            if (disposed) return;
            if (!legacyFallbackAllowed) {
              recordLegacyFirestoreReadFallbackBlocked('rental-requests', error?.code || 'rental-request-postgres-unavailable');
            }
            console.error('Rental request authoritative read failed:', error);
            const message = legacyFallbackAllowed
              ? '나의 대여신청 내역을 불러오지 못했습니다. PostgreSQL 및 Firestore 연결 상태를 확인해 주세요.'
              : '나의 대여신청 내역을 PostgreSQL에서 불러오지 못했습니다. legacy Firestore fallback은 비활성화되어 있습니다.';
            if (!initialLoadComplete) {
              setRentalRequests([]);
              setRentalRequestsReady(true);
              triggerToastRef.current?.(message, 'error');
            }
            setRentalRequestsLoadErrorMessage(message);
            publishRentalRequestCutoverObservation({
              requested: cutoverConfig.requested,
              enabled: cutoverConfig.enabled,
              activeSource: 'unavailable',
              equivalent: null,
              changedRequestIds: [],
              changedFields: [],
              fallbackReason: error?.code || 'rental-request-read-unavailable',
              firestoreWatcherDisabled: true,
              firestoreFallbackReads: legacyFallbackAllowed ? (Number(error?.firestoreFallbackReads) || 1) : 0,
              shadowSyncedAt: '',
              sourceRefreshes: 0,
            });
          })
          .finally(() => {
            refreshInFlight = false;
          });
      };
      const markWindowAway = () => {
        wasAwayFromWindow = true;
      };
      const refreshAfterWindowReturn = () => {
        if (!wasAwayFromWindow) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        wasAwayFromWindow = false;
        refreshPostgresRequests();
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          markWindowAway();
          return;
        }
        refreshAfterWindowReturn();
      };

      refreshPostgresRequests();
      window.addEventListener('blur', markWindowAway);
      window.addEventListener('focus', refreshAfterWindowReturn);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        disposed = true;
        window.removeEventListener('blur', markWindowAway);
        window.removeEventListener('focus', refreshAfterWindowReturn);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    const sourceState = new Map(
      sourceDefinitions.map(({ key }) => [
        key,
        {
          ready: false,
          requests: [],
        },
      ])
    );
    let postgresRequests = null;
    let postgresCandidateState = cutoverConfig.requested ? 'pending' : 'disabled';
    let postgresCandidateError = '';
    let postgresShadowSyncedAt = '';

    const publishRequests = () => {
      if (disposed) return;

      const states = Array.from(sourceState.values());
      if (!states.every((state) => state.ready)) return;

      const firestoreRequests = mergeRequestLists(
        states.map((state) => state.requests)
      );
      publishRentalRequestReadObservation({ requests: firestoreRequests });

      const decision = chooseRentalRequestReadSource({
        firestoreRequests,
        postgresRequests,
        requested:
          cutoverConfig.requested && postgresCandidateState !== 'pending',
      });
      const fallbackReason = cutoverConfig.requested
        ? postgresCandidateState === 'error'
          ? postgresCandidateError || 'postgres-candidate-error'
          : postgresCandidateState === 'pending'
            ? 'postgres-candidate-pending'
            : decision.fallbackReason
        : decision.fallbackReason;

      setRentalRequests(decision.requests);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
      publishRentalRequestCutoverObservation({
        requested: cutoverConfig.requested,
        enabled: cutoverConfig.enabled,
        activeSource: decision.source,
        equivalent: decision.equivalent,
        changedRequestIds: decision.changedRequestIds,
        changedFields: decision.changedFields,
        fallbackReason,
        firestoreWatcherDisabled: false,
        firestoreFallbackReads: 0,
        shadowSyncedAt: postgresShadowSyncedAt,
        sourceRefreshes: 0,
      });
    };

    if (cutoverConfig.requested) {
      void loadPostgresCandidate()
        .then((candidate) => {
          if (disposed) return;
          postgresRequests = candidate.requests;
          postgresCandidateState = 'ready';
          postgresCandidateError = '';
          postgresShadowSyncedAt = candidate.shadowSyncedAt;
          publishRequests();
        })
        .catch((error) => {
          if (disposed) return;
          console.warn(
            'PostgreSQL rental request cutover candidate unavailable; Firestore watcher remains active.',
            { code: error?.code, status: error?.status }
          );
          postgresRequests = null;
          postgresCandidateState = 'error';
          postgresCandidateError =
            error?.code || 'rental-request-candidate-error';
          publishRequests();
        });
    }

    const unsubscribers = sourceDefinitions.map(
      ({ key, required, source }) =>
        onSnapshot(
          source,
          (snapshot) => {
            sourceState.set(key, {
              ready: true,
              requests: snapshot.docs.map((requestDocument) => ({
                ...requestDocument.data(),
                id: requestDocument.id,
              })),
            });
            publishRequests();
          },
          (error) => {
            console.error(`Own rental requests ${key} sync error:`, error);
            sourceState.set(key, {
              ready: true,
              requests: [],
            });

            if (required) {
              const message =
                '나의 대여신청 내역을 불러오지 못했습니다. Firestore Rules의 rentalRequests 본인 및 이전 계정 조회 권한을 확인해 주세요.';
              setRentalRequestsLoadErrorMessage(message);
              setRentalRequestsReady(true);
              triggerToastRef.current?.(message, 'error');
              return;
            }

            publishRequests();
          }
        )
    );

    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser?.email,
    firebaseAuthUser?.uid,
    isAdminAuthenticated,
    setRentalRequests,
    setRentalRequestsLoadErrorMessage,
    setRentalRequestsReady,
    userProfile?.email,
    previousAccountUidsKey,
    userAuthSessionUid,
    userProfile?.status,
    userProfileReady,
  ]);

}

export default function useRentalDataSubscriptionController({
  adminTab,
  authenticatedAdminId,
  createDefaultRequestForm,
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  firebaseAuthReady,
  mergePersistedData,
  publicCatalogAssets,
  publicCatalogAssetsReady,
  setData,
  setFirebaseLoadErrorMessage,
  setFirebaseReady,
  setForm,
  setPublicCatalogAssets,
  setPublicCatalogAssetsReady,
  setSplitPublicConfig,
  setSplitRentalAssets,
  setSplitRentalAvailability,
  setSplitRentalBorrowers,
  setSplitSourceErrors,
  setSplitSourceReady,
  setSplitStorageVersion,
  setTempSettings,
  setToast,
  splitPublicConfig,
  splitRentalAssets,
  splitRentalAvailability,
  splitRentalBorrowers,
  splitSourceErrors,
  splitSourceReady,
  userTab,
  view,
}) {
  const rentalConfigRefreshRevision = useSiteContentRefreshRevision(
    POLICY_CONTENT_DOMAINS.RENTAL_CONFIG
  );
  const initializedRemoteFormRef = useRef(false);
  // Runtime-only bridge from the PostgreSQL asset catalog into the merged app data.
  // Asset categories are no longer persisted/read from rental-config.
  const authoritativeAssetCategoriesRef = useRef([]);

  useEffect(() => {
    setSplitSourceReady((previous) => ({
      ...previous,
      config: false,
    }));

    const policyContentConfig = readPolicyContentCutoverConfig();
    const assetCutoverConfig = readAssetDomainCutoverConfig();
    let active = true;

    const applyConfigData = (configData, source) => {
      if (!active) return;
      setSplitPublicConfig(() =>
        assetCutoverConfig.readRequested
          ? { ...configData, assetCategories: authoritativeAssetCategoriesRef.current }
          : configData
      );
      setSplitStorageVersion(Number(configData.storageVersion || 0));
      setSplitSourceErrors((previous) => ({ ...previous, config: '' }));
      setSplitSourceReady((previous) => ({ ...previous, config: true }));
      publishPolicyContentObservation({
        readRequested: policyContentConfig.readRequested,
        domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
        readSource: source,
        documentCount: 1,
        error: null,
      });
    };

    const applyMissingConfig = (message, error = null) => {
      if (!active) return;
      if (error) console.error('Public config sync error:', error);
      setSplitPublicConfig(null);
      setSplitStorageVersion(0);
      setSplitSourceErrors((previous) => ({ ...previous, config: message }));
      setSplitSourceReady((previous) => ({ ...previous, config: true }));
      setFirebaseReady(true);
      setToast({ message, type: 'error' });
    };

    if (!policyContentConfig.readRequested) {
      applyMissingConfig('PostgreSQL 공개 설정 API가 구성되지 않았습니다. VITE_API_URL 설정을 확인해 주세요.');
      return () => { active = false; };
    }

    const loadPublicConfig = () => {
      void requestPolicyContentDomain({
        domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
        config: policyContentConfig,
        useCache: true,
      })
        .then((domainResult) => {
          const document = getPolicyContentDocument(
            domainResult,
            'rentalSystem/publicConfig'
          );
          if (!document?.payload) {
            throw Object.assign(
              new Error('PostgreSQL canonical public config document is unavailable.'),
              { code: 'policy_content_public_config_missing' }
            );
          }
          applyConfigData(document.payload, 'postgresql');
        })
        .catch((error) => {
          publishPolicyContentObservation({
            readRequested: true,
            domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
            readSource: 'postgresql-authoritative',
            error: error?.code || 'policy_content_read_failed',
          });
          const errorCode = error?.code || error?.name || 'policy_content_read_failed';
          const message = errorCode === 'site_content_network_unavailable'
            ? 'PostgreSQL 데이터 서버에 연결할 수 없습니다. 기존 원격 데이터를 보호하기 위해 저장을 차단했습니다. 오류 코드: site_content_network_unavailable'
            : `공개 설정을 PostgreSQL에서 불러오지 못했습니다. 오류 코드: ${errorCode}`;
          applyMissingConfig(message, error);
        });
    };

    let firstPaintFrameId = 0;
    let secondPaintFrameId = 0;
    if (view === 'user' && userTab === 'home' && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      firstPaintFrameId = window.requestAnimationFrame(() => {
        secondPaintFrameId = window.requestAnimationFrame(loadPublicConfig);
      });
    } else {
      loadPublicConfig();
    }

    return () => {
      active = false;
      if (firstPaintFrameId) window.cancelAnimationFrame?.(firstPaintFrameId);
      if (secondPaintFrameId) window.cancelAnimationFrame?.(secondPaintFrameId);
    };
  }, [
    currentAuthAdminAccount?.id,
    setFirebaseReady,
    setSplitPublicConfig,
    setSplitSourceErrors,
    setSplitSourceReady,
    setSplitStorageVersion,
    setToast,
    userTab,
    view,
    rentalConfigRefreshRevision,
  ]);

  useEffect(() => {
    const shouldLoadUserCatalog =
      view === 'user' && ['home', 'rental'].includes(userTab);
    const shouldLoadAdminAssets =
      view === 'admin' &&
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id) &&
      ['laptops', 'requests', 'categories', 'dataManagement'].includes(adminTab);

    if (!shouldLoadUserCatalog && !shouldLoadAdminAssets) {
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(false);
      setSplitRentalAssets([]);
      setSplitRentalAvailability([]);
      setSplitSourceErrors((previous) => ({ ...previous, assets: '', availability: '' }));
      setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
      setFirebaseReady(true);
      return undefined;
    }

    const assetCutoverConfig = readAssetDomainCutoverConfig();
    let cancelled = false;
    setFirebaseReady(false);
    setSplitSourceReady((previous) => ({ ...previous, assets: false, availability: false }));
    setSplitSourceErrors((previous) => ({ ...previous, assets: '', availability: '' }));

    const applyCatalogPayload = (catalog, source, bootstrapped = false) => {
      if (cancelled) return;
      const assets = Array.isArray(catalog?.assets) ? catalog.assets : [];
      const availability = Array.isArray(catalog?.availability) ? catalog.availability : [];
      const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
      setPublicCatalogAssets(normalizePublicCatalogAssets(assets));
      setPublicCatalogAssetsReady(true);
      setSplitRentalAssets(assets.map((asset) => ({ ...asset, reservations: normalizeAssetReservations(asset.reservations || []) })));
      setSplitRentalAvailability(availability);
      if (categories.length > 0) {
        authoritativeAssetCategoriesRef.current = categories;
        setSplitPublicConfig((previous) => previous ? { ...previous, assetCategories: categories } : previous);
      }
      setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
      setSplitSourceErrors((previous) => ({ ...previous, assets: '', availability: '' }));
      publishAssetDomainCutoverObservation({
        readRequested: assetCutoverConfig.readRequested,
        writeRequested: assetCutoverConfig.writeRequested,
        activeSource: source,
        assetWatcherDisabled: true,
        availabilityWatcherDisabled: true,
        assetCount: assets.length,
        categoryCount: categories.length,
        availabilityCount: availability.length,
        firestoreFallbackReads: 0,
        bootstrapped,
        syncAt: catalog?.sync?.syncedAt || '',
        error: '',
      });
    };

    if (!assetCutoverConfig.readRequested) {
      const message = 'PostgreSQL 자산 API가 구성되지 않았습니다. VITE_API_URL 설정을 확인해 주세요.';
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(true);
      setSplitRentalAssets([]);
      setSplitRentalAvailability([]);
      setSplitSourceErrors((previous) => ({ ...previous, assets: message, availability: message }));
      setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
      setFirebaseReady(true);
      setToast({ message, type: 'error' });
      return () => { cancelled = true; };
    }

    let refreshInFlight = false;
    let initialLoadComplete = false;
    let wasAwayFromWindow = false;
    const refreshPostgresCatalog = () => {
      if (cancelled || refreshInFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshInFlight = true;
      void (async () => {
        try {
          let payload = null;
          let bootstrapped = false;
          if (shouldLoadAdminAssets && !initialLoadComplete) {
            const sessionKey = 'mk_asset_postgres_bootstrap:clerk-postgresql-admin';
            let shouldBootstrap = true;
            try { shouldBootstrap = globalThis.sessionStorage?.getItem?.(sessionKey) !== '1'; } catch { /* no-op */ }
            if (shouldBootstrap) {
              const bootstrapPayload = await clerkStagingClient.bootstrapAdminAssets('');
              payload = { assetCatalog: bootstrapPayload?.adminAssetBootstrap?.catalog };
              bootstrapped = true;
              try { globalThis.sessionStorage?.setItem?.(sessionKey, '1'); } catch { /* no-op */ }
            }
          }
          if (!payload?.assetCatalog) payload = await clerkStagingClient.getAssetCatalog();
          applyCatalogPayload(payload.assetCatalog, 'postgresql', bootstrapped);
          initialLoadComplete = true;
        } catch (error) {
          recordLegacyFirestoreReadFallbackBlocked('assets', error?.code || error?.message || 'postgresql-asset-read-failed');
          if (cancelled) return;
          const errorCode = error?.code || error?.name || 'asset_postgresql_read_failed';
          const message = `대여 자산 및 예약 현황을 PostgreSQL에서 불러오지 못했습니다. 오류 코드: ${errorCode}`;
          if (!initialLoadComplete) {
            setPublicCatalogAssets([]);
            setPublicCatalogAssetsReady(true);
            setSplitRentalAssets([]);
            setSplitRentalAvailability([]);
            setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
            setFirebaseReady(true);
            setToast({ message, type: 'error' });
          }
          setSplitSourceErrors((previous) => ({ ...previous, assets: message, availability: message }));
          publishAssetDomainCutoverObservation({
            readRequested: assetCutoverConfig.readRequested,
            writeRequested: assetCutoverConfig.writeRequested,
            activeSource: 'unavailable',
            assetWatcherDisabled: true,
            availabilityWatcherDisabled: true,
            assetCount: 0,
            categoryCount: 0,
            availabilityCount: 0,
            firestoreFallbackReads: 0,
            bootstrapped: false,
            syncAt: '',
            error: errorCode,
          });
        } finally {
          refreshInFlight = false;
        }
      })();
    };
    const markWindowAway = () => {
      wasAwayFromWindow = true;
    };
    const refreshAfterWindowReturn = () => {
      if (!wasAwayFromWindow) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      wasAwayFromWindow = false;
      refreshPostgresCatalog();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markWindowAway();
        return;
      }
      refreshAfterWindowReturn();
    };

    let firstPaintFrameId = 0;
    let secondPaintFrameId = 0;
    const scheduleInitialCatalogRefresh = () => {
      const shouldDeferUntilAfterFirstPaint =
        view === 'user' &&
        userTab === 'home' &&
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function';

      if (!shouldDeferUntilAfterFirstPaint) {
        refreshPostgresCatalog();
        return;
      }

      firstPaintFrameId = window.requestAnimationFrame(() => {
        secondPaintFrameId = window.requestAnimationFrame(refreshPostgresCatalog);
      });
    };

    scheduleInitialCatalogRefresh();
    window.addEventListener('blur', markWindowAway);
    window.addEventListener('focus', refreshAfterWindowReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (firstPaintFrameId) window.cancelAnimationFrame?.(firstPaintFrameId);
      if (secondPaintFrameId) window.cancelAnimationFrame?.(secondPaintFrameId);
      window.removeEventListener('blur', markWindowAway);
      window.removeEventListener('focus', refreshAfterWindowReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    setFirebaseReady,
    setPublicCatalogAssets,
    setPublicCatalogAssetsReady,
    setSplitPublicConfig,
    setSplitRentalAssets,
    setSplitRentalAvailability,
    setSplitSourceErrors,
    setSplitSourceReady,
    setToast,
    userTab,
    view,
  ]);

  useEffect(() => {
    const shouldLoadRentalBorrowers =
      firebaseAuthReady &&
      currentAuthRoleReady &&
      !currentAuthRoleErrorMessage &&
      view === 'admin' &&
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id) &&
      ['people', 'signupPolicy', 'memberAccounts', 'adminAccounts'].includes(adminTab);

    if (!shouldLoadRentalBorrowers) {
      setSplitRentalBorrowers([]);
      setSplitSourceErrors((previous) => ({ ...previous, borrowers: '' }));
      setSplitSourceReady((previous) => ({ ...previous, borrowers: true }));
      return undefined;
    }

    let cancelled = false;
    setSplitSourceReady((previous) => ({ ...previous, borrowers: false }));
    setSplitSourceErrors((previous) => ({ ...previous, borrowers: '' }));

    void clerkStagingClient.getAdminMemberDirectory()
      .then((payload) => {
        if (cancelled) return;
        const entries = Array.isArray(payload?.memberDirectory?.entries)
          ? payload.memberDirectory.entries
          : [];
        const borrowers = entries
          .filter((entry) => entry?.enabled !== false)
          .map((entry, index) => ({
            id: String(entry?.directoryMemberId || entry?.identityKey || `directory-${index}`),
            name: String(entry?.name || ''),
            team: String(entry?.team || ''),
            sortOrder: Number.isFinite(Number(entry?.sortOrder))
              ? Number(entry.sortOrder)
              : index,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder);
        setSplitRentalBorrowers(borrowers);
        setSplitSourceErrors((previous) => ({ ...previous, borrowers: '' }));
        setSplitSourceReady((previous) => ({ ...previous, borrowers: true }));
      })
      .catch((error) => {
        if (cancelled) return;
        const message = '부서·사용자 명부를 PostgreSQL에서 불러오지 못했습니다.';
        console.error('PostgreSQL member directory read error:', error);
        setSplitRentalBorrowers([]);
        setSplitSourceErrors((previous) => ({ ...previous, borrowers: message }));
        setSplitSourceReady((previous) => ({ ...previous, borrowers: true }));
        setFirebaseReady(true);
        setToast({ message, type: 'error' });
      });

    return () => { cancelled = true; };
  }, [
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    setFirebaseReady,
    setSplitRentalBorrowers,
    setSplitSourceErrors,
    setSplitSourceReady,
    setToast,
    view,
  ]);

  useEffect(() => {
    const allSplitSourcesReady =
      splitSourceReady.config &&
      splitSourceReady.assets &&
      splitSourceReady.availability &&
      splitSourceReady.borrowers;

    if (!allSplitSourcesReady) {
      return;
    }

    const splitLoadError = Object.values(splitSourceErrors).find(Boolean);

    if (splitLoadError) {
      setFirebaseLoadErrorMessage(splitLoadError);
      setFirebaseReady(true);
      return;
    }

    if (!splitPublicConfig) {
      return;
    }

    const remoteData = mergePersistedData({
      laptops: splitRentalAssets,
      requests: splitRentalAvailability,
      assetCategories: splitPublicConfig.assetCategories || [],
      teams: splitPublicConfig.teams || [],
      borrowers: splitRentalBorrowers,
      settings: splitPublicConfig.settings || {},
    });

    setData(remoteData);
    setFirebaseLoadErrorMessage('');
    setFirebaseReady(true);

    if (!initializedRemoteFormRef.current) {
      setForm(createDefaultRequestForm(remoteData.settings));
      setTempSettings(remoteData.settings);
      initializedRemoteFormRef.current = true;
    }
  }, [
    createDefaultRequestForm,
    initializedRemoteFormRef,
    mergePersistedData,
    setData,
    setFirebaseLoadErrorMessage,
    setFirebaseReady,
    setForm,
    setTempSettings,
    splitPublicConfig,
    splitRentalAssets,
    splitRentalAvailability,
    splitRentalBorrowers,
    splitSourceErrors,
    splitSourceReady,
  ]);
}
