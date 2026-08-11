import { useEffect, useMemo, useRef, useState } from 'react';
import { getDoc, getDocs, onSnapshot, query as firestoreQuery, where } from 'firebase/firestore';

import {
  PUBLIC_ASSET_CATALOG_DOC_REF,
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_BORROWERS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
} from '../../firebase.js';
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
  PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
  hydratePublicCatalogAssets,
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
  syncPolicyContentDomainFromFirestore,
} from '../content/policyContentCutover.js';
import {
  isLegacyFirestoreReadFallbackAllowed,
  readLegacyFirestoreReadFallbackConfig,
  recordLegacyFirestoreReadFallbackBlocked,
} from '../compatibility/legacyFirestoreReadFallbackCutover.js';
import {
  readRentalRequestWriteMirrorRetirementConfig,
} from '../compatibility/rentalRequestWriteMirrorRetirement.js';

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

    const canReadOwnRentalRequests = Boolean(
      firebaseAuthUser &&
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
    const rentalWriteMirrorRetirementConfig = readRentalRequestWriteMirrorRetirementConfig();

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

    const loadPostgresCandidate = async ({ refreshSource = false } = {}) => {
      let payload = null;
      let sourceRefreshes = 0;

      if (rentalWriteMirrorRetirementConfig.enabled) {
        payload = await clerkStagingClient.getRentalRequestReadCandidate();
      } else if (refreshSource) {
        const firebaseIdToken = await firebaseAuthUser.getIdToken();
        payload = await clerkStagingClient.syncRentalRequestShadow(firebaseIdToken);
        sourceRefreshes = 1;
      } else {
        payload = await clerkStagingClient.getRentalRequestReadCandidate();
        if (!payload) {
          const firebaseIdToken = await firebaseAuthUser.getIdToken();
          payload = await clerkStagingClient.syncRentalRequestShadow(firebaseIdToken);
          sourceRefreshes = 1;
        }
      }

      return Object.freeze({
        ...readRentalRequestCandidatePayload(payload),
        sourceRefreshes,
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
          setRentalRequests([]);
          setRentalRequestsLoadErrorMessage(message);
          setRentalRequestsReady(true);
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
          triggerToastRef.current?.(message, 'error');
        });

      return () => {
        disposed = true;
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
  const initializedRemoteFormRef = useRef(false);
  const splitAssetCategoriesRef = useRef(splitPublicConfig?.assetCategories || []);

  useEffect(() => {
    splitAssetCategoriesRef.current = splitPublicConfig?.assetCategories || [];
  }, [splitPublicConfig?.assetCategories]);

  useEffect(() => {
    setSplitSourceReady((previous) => ({
      ...previous,
      config: false,
    }));

    const policyContentConfig = readPolicyContentCutoverConfig();
    const assetCutoverConfig = readAssetDomainCutoverConfig();
    const legacyFallbackConfig = readLegacyFirestoreReadFallbackConfig();
    const legacyFallbackAllowed = isLegacyFirestoreReadFallbackAllowed(legacyFallbackConfig);
    let active = true;

    const applyConfigData = (configData, source) => {
      if (!active) return;
      setSplitPublicConfig((previous) =>
        assetCutoverConfig.readRequested && Array.isArray(previous?.assetCategories)
          ? { ...configData, assetCategories: previous.assetCategories }
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

    if (policyContentConfig.readRequested && view !== 'admin') {
      void requestPolicyContentDomain({
        domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
        config: policyContentConfig,
        useCache: false,
      })
        .then((domainResult) => {
          const document = getPolicyContentDocument(
            domainResult,
            'rentalSystem/publicConfig'
          );
          if (!document?.payload) {
            throw Object.assign(new Error('PostgreSQL public config document is unavailable.'), { code: 'policy_content_public_config_missing' });
          }
          applyConfigData(document.payload, 'postgresql');
        })
        .catch(async (error) => {
          publishPolicyContentObservation({
            readRequested: true,
            domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
            readSource: 'firestore-one-time-fallback',
            error: error?.code || 'policy_content_read_failed',
          });
          try {
            const snapshot = await getDoc(PUBLIC_CONFIG_DOC_REF);
            if (!snapshot.exists()) {
              applyMissingConfig('Firestore 공개 설정 문서가 없습니다. rentalSystem/publicConfig 마이그레이션 상태를 확인해 주세요.');
              return;
            }
            applyConfigData(snapshot.data(), 'firestore-one-time-fallback');
          } catch (fallbackError) {
            applyMissingConfig(
              '공개 설정을 불러오지 못했습니다. PostgreSQL과 Firestore fallback 상태를 확인해 주세요.',
              fallbackError
            );
          }
        });

      return () => { active = false; };
    }

    const unsubscribe = onSnapshot(
      PUBLIC_CONFIG_DOC_REF,
      (snapshot) => {
        if (!snapshot.exists()) {
          applyMissingConfig(
            'Firestore 공개 설정 문서가 없습니다. rentalSystem/publicConfig 마이그레이션 상태를 확인해 주세요.'
          );
          return;
        }

        applyConfigData(snapshot.data(), 'firestore-onSnapshot');
        if (
          policyContentConfig.writeThroughRequested &&
          view === 'admin' &&
          currentAuthAdminAccount?.id
        ) {
          void syncPolicyContentDomainFromFirestore({
            domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
            config: policyContentConfig,
          }).catch((error) => {
            console.error('Public config PostgreSQL write-through error:', error);
          });
        }
      },
      (error) => {
        applyMissingConfig(
          'Firestore 공개 설정을 불러오지 못했습니다. rentalSystem/publicConfig 읽기 권한을 확인해 주세요.',
          error
        );
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    currentAuthAdminAccount?.id,
    setFirebaseReady,
    setSplitPublicConfig,
    setSplitSourceErrors,
    setSplitSourceReady,
    setSplitStorageVersion,
    setToast,
    view,
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
      return undefined;
    }

    const assetCutoverConfig = readAssetDomainCutoverConfig();
    let cancelled = false;
    const unsubscribers = [];
    setFirebaseReady(false);
    setSplitSourceReady((previous) => ({ ...previous, assets: false, availability: false }));
    setSplitSourceErrors((previous) => ({ ...previous, assets: '', availability: '' }));

    const applyCatalogPayload = (catalog, source, fallbackReads = 0, bootstrapped = false) => {
      if (cancelled) return;
      const assets = Array.isArray(catalog?.assets) ? catalog.assets : [];
      const availability = Array.isArray(catalog?.availability) ? catalog.availability : [];
      const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
      setPublicCatalogAssets(normalizePublicCatalogAssets(assets));
      setPublicCatalogAssetsReady(true);
      setSplitRentalAssets(assets.map((asset) => ({ ...asset, reservations: normalizeAssetReservations(asset.reservations || []) })));
      setSplitRentalAvailability(availability);
      if (categories.length > 0) {
        setSplitPublicConfig((previous) => previous ? { ...previous, assetCategories: categories } : previous);
      }
      setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
      setSplitSourceErrors((previous) => ({ ...previous, assets: '', availability: '' }));
      publishAssetDomainCutoverObservation({
        readRequested: assetCutoverConfig.readRequested,
        writeRequested: assetCutoverConfig.writeRequested,
        activeSource: source,
        assetWatcherDisabled: source === 'postgresql' || source === 'firestore-one-time-fallback',
        availabilityWatcherDisabled: source === 'postgresql' || source === 'firestore-one-time-fallback',
        assetCount: assets.length,
        categoryCount: categories.length,
        availabilityCount: availability.length,
        firestoreFallbackReads: fallbackReads,
        bootstrapped,
        syncAt: catalog?.sync?.syncedAt || '',
        error: '',
      });
    };

    const loadOneTimeFirestoreFallback = async (reason) => {
      let reads = 0;
      try {
        reads += 1;
        const assetSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
        reads += 1;
        const availabilitySnapshot = await getDocs(RENTAL_AVAILABILITY_COLLECTION_REF);
        const availability = availabilitySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const rawAssets = assetSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const publicAssets = normalizePublicCatalogAssets(rawAssets);
        const assets = shouldLoadAdminAssets
          ? rawAssets.map((asset) => ({ ...asset, reservations: normalizeAssetReservations(asset.reservations || []) }))
          : hydratePublicCatalogAssets(publicAssets, availability);
        applyCatalogPayload({
          assets,
          availability,
          categories: splitAssetCategoriesRef.current,
          sync: null,
        }, 'firestore-one-time-fallback', reads, false);
        if (reason) console.warn('Phase 20 PostgreSQL asset catalog fallback activated:', reason);
      } catch (error) {
        if (cancelled) return;
        const message = '대여 자산 및 예약 현황을 불러오지 못했습니다. PostgreSQL 및 Firestore 연결 상태를 확인해 주세요.';
        console.error('Phase 20 asset catalog fallback error:', error);
        setPublicCatalogAssets([]);
        setPublicCatalogAssetsReady(true);
        setSplitRentalAssets([]);
        setSplitRentalAvailability([]);
        setSplitSourceErrors((previous) => ({ ...previous, assets: message, availability: message }));
        setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
        setFirebaseReady(true);
        setToast({ message, type: 'error' });
        publishAssetDomainCutoverObservation({
          readRequested: assetCutoverConfig.readRequested,
          writeRequested: assetCutoverConfig.writeRequested,
          activeSource: 'unavailable', assetWatcherDisabled: true, availabilityWatcherDisabled: true,
          assetCount: 0, categoryCount: 0, availabilityCount: 0,
          firestoreFallbackReads: reads, bootstrapped: false, syncAt: '', error: error?.code || 'asset-read-unavailable',
        });
      }
    };

    if (assetCutoverConfig.readRequested) {
      void (async () => {
        try {
          let payload = null;
          let bootstrapped = false;
          if (shouldLoadAdminAssets) {
            const firebaseUser = (await import('../../firebase.js')).firebaseAuth.currentUser;
            if (!firebaseUser) throw new Error('firebase-admin-session-missing');
            const firebaseIdToken = await firebaseUser.getIdToken();
            const sessionKey = `mk_asset_postgres_bootstrap:${firebaseUser.uid}`;
            let shouldBootstrap = true;
            try { shouldBootstrap = globalThis.sessionStorage?.getItem?.(sessionKey) !== '1'; } catch { /* no-op */ }
            if (shouldBootstrap) {
              const bootstrapPayload = await clerkStagingClient.bootstrapAdminAssets(firebaseIdToken);
              payload = { assetCatalog: bootstrapPayload?.adminAssetBootstrap?.catalog };
              bootstrapped = true;
              try { globalThis.sessionStorage?.setItem?.(sessionKey, '1'); } catch { /* no-op */ }
            }
          }
          if (!payload?.assetCatalog) payload = await clerkStagingClient.getAssetCatalog();
          applyCatalogPayload(payload.assetCatalog, 'postgresql', 0, bootstrapped);
        } catch (error) {
          if (legacyFallbackAllowed) {
            await loadOneTimeFirestoreFallback(error?.code || error?.message || 'postgresql-asset-read-failed');
            return;
          }
          recordLegacyFirestoreReadFallbackBlocked('assets', error?.code || error?.message || 'postgresql-asset-read-failed');
          if (cancelled) return;
          const message = '대여 자산 및 예약 현황을 PostgreSQL에서 불러오지 못했습니다. legacy Firestore fallback은 비활성화되어 있습니다.';
          setPublicCatalogAssets([]);
          setPublicCatalogAssetsReady(true);
          setSplitRentalAssets([]);
          setSplitRentalAvailability([]);
          setSplitSourceErrors((previous) => ({ ...previous, assets: message, availability: message }));
          setSplitSourceReady((previous) => ({ ...previous, assets: true, availability: true }));
          setFirebaseReady(true);
          setToast({ message, type: 'error' });
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
            error: error?.code || 'asset-postgres-read-unavailable',
          });
        }
      })();

      return () => { cancelled = true; };
    }

    // Legacy/production path: preserve the existing Firestore realtime behavior.
    if (shouldLoadAdminAssets) {
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(false);
      unsubscribers.push(onSnapshot(
        RENTAL_ASSETS_COLLECTION_REF,
        (snapshot) => {
          if (cancelled) return;
          const assets = snapshot.docs.map((assetDocument) => ({
            ...assetDocument.data(), id: assetDocument.id,
            reservations: normalizeAssetReservations(assetDocument.data().reservations || []),
          }));
          setSplitRentalAssets(assets);
          setSplitSourceReady((previous) => ({ ...previous, assets: true }));
        },
        (error) => {
          if (cancelled) return;
          const message = '대여 자산 컬렉션을 불러오지 못했습니다. rentalAssets 읽기 권한을 확인해 주세요.';
          console.error('Rental assets sync error:', error);
          setSplitRentalAssets([]);
          setSplitSourceErrors((previous) => ({ ...previous, assets: message }));
          setSplitSourceReady((previous) => ({ ...previous, assets: true }));
          setToast({ message, type: 'error' });
        }
      ));
    } else {
      setPublicCatalogAssetsReady(false);
      unsubscribers.push(onSnapshot(
        PUBLIC_ASSET_CATALOG_DOC_REF,
        async (snapshot) => {
          if (cancelled) return;
          const catalogData = snapshot.exists() ? snapshot.data() : null;
          const current = Number(catalogData?.schemaVersion || 0) === PUBLIC_ASSET_CATALOG_SCHEMA_VERSION && Array.isArray(catalogData?.assets);
          if (current) {
            setPublicCatalogAssets(normalizePublicCatalogAssets(catalogData.assets));
            setPublicCatalogAssetsReady(true);
            return;
          }
          try {
            const fallbackSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
            if (cancelled) return;
            setPublicCatalogAssets(normalizePublicCatalogAssets(fallbackSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))));
            setPublicCatalogAssetsReady(true);
          } catch (error) {
            if (cancelled) return;
            const message = '공개 자산 카탈로그와 기존 자산 목록을 모두 불러오지 못했습니다.';
            setPublicCatalogAssets([]); setPublicCatalogAssetsReady(true);
            setSplitSourceErrors((previous) => ({ ...previous, assets: message }));
          }
        },
        (error) => { if (!cancelled) console.error('Public asset catalog sync error:', error); }
      ));
    }

    unsubscribers.push(onSnapshot(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      (snapshot) => {
        if (cancelled) return;
        const availability = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        setSplitRentalAvailability(availability);
        setSplitSourceReady((previous) => ({ ...previous, availability: true }));
      },
      (error) => {
        if (cancelled) return;
        const message = '공개 예약 현황을 불러오지 못했습니다. rentalAvailability 읽기 권한을 확인해 주세요.';
        console.error('Rental availability sync error:', error);
        setSplitRentalAvailability([]);
        setSplitSourceErrors((previous) => ({ ...previous, availability: message }));
        setSplitSourceReady((previous) => ({ ...previous, availability: true }));
      }
    ));

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
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
    const assetCutoverConfig = readAssetDomainCutoverConfig();
    if (assetCutoverConfig.readRequested) return;
    const shouldHydrateUserCatalog =
      view === 'user' && ['home', 'rental'].includes(userTab) && publicCatalogAssetsReady && splitSourceReady.availability;
    if (!shouldHydrateUserCatalog) return;
    setSplitRentalAssets(hydratePublicCatalogAssets(publicCatalogAssets, splitRentalAvailability));
    setSplitSourceErrors((previous) => ({ ...previous, assets: '' }));
    setSplitSourceReady((previous) => ({ ...previous, assets: true }));
  }, [
    publicCatalogAssets, publicCatalogAssetsReady, setSplitRentalAssets, setSplitSourceErrors,
    setSplitSourceReady, splitRentalAvailability, splitSourceReady.availability, userTab, view,
  ]);

  useEffect(() => {
    const shouldLoadRentalBorrowers =
      firebaseAuthReady &&
      currentAuthRoleReady &&
      !currentAuthRoleErrorMessage &&
      view === 'admin' &&
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id) &&
      ['people', 'signupPolicy', 'adminAccounts'].includes(adminTab);

    if (!shouldLoadRentalBorrowers) {
      setSplitRentalBorrowers([]);
      setSplitSourceErrors((previous) => ({
        ...previous,
        borrowers: '',
      }));
      setSplitSourceReady((previous) => ({
        ...previous,
        borrowers: true,
      }));
      return undefined;
    }

    setSplitSourceReady((previous) => ({
      ...previous,
      borrowers: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_BORROWERS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
      (snapshot) => {
        const borrowers = snapshot.docs
          .map((borrowerDocument, index) => ({
            ...borrowerDocument.data(),
            id: borrowerDocument.id,
            sortOrder: Number.isFinite(
              Number(borrowerDocument.data().sortOrder)
            )
              ? Number(borrowerDocument.data().sortOrder)
              : index,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder);

        setSplitRentalBorrowers(borrowers);
        setSplitSourceErrors((previous) => ({
          ...previous,
          borrowers: '',
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          borrowers: true,
        }));
      },
      (error) => {
        const message =
          '대여자 목록을 불러오지 못했습니다. rentalBorrowers 조회 권한을 확인해 주세요.';

        console.error('Rental borrowers sync error:', error);
        setSplitRentalBorrowers([]);
        setSplitSourceErrors((previous) => ({
          ...previous,
          borrowers: message,
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          borrowers: true,
        }));
        setFirebaseReady(true);
        setToast({ message, type: 'error' });
      }
    );

    return unsubscribe;
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
