import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, onSnapshot, query as firestoreQuery, where } from 'firebase/firestore';

import {
  PUBLIC_ASSET_CATALOG_DOC_REF,
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_BORROWERS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
} from '../../firebase.js';
import {
  PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
  hydratePublicCatalogAssets,
  normalizeAssetReservations,
  normalizePublicCatalogAssets,
} from '../../services/publicAssetCatalog.js';
import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import { normalizeEmailAddress } from '../../utils/memberPolicy.js';

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
    const sourceState = new Map(
      sourceDefinitions.map(({ key }) => [
        key,
        {
          ready: false,
          requests: [],
        },
      ])
    );

    const publishRequests = () => {
      if (disposed) return;

      const states = Array.from(sourceState.values());

      if (!states.every((state) => state.ready)) return;

      const requestMap = new Map();

      states.forEach((state) => {
        state.requests.forEach((request) => {
          requestMap.set(request.id, {
            ...(requestMap.get(request.id) || {}),
            ...request,
          });
        });
      });

      setRentalRequests(Array.from(requestMap.values()));
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
    };

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

  useEffect(() => {
    setSplitSourceReady((previous) => ({
      ...previous,
      config: false,
    }));

    const unsubscribe = onSnapshot(
      PUBLIC_CONFIG_DOC_REF,
      (snapshot) => {
        if (!snapshot.exists()) {
          const message =
            'Firestore 공개 설정 문서가 없습니다. rentalSystem/publicConfig 마이그레이션 상태를 확인해 주세요.';

          setSplitPublicConfig(null);
          setSplitStorageVersion(0);
          setSplitSourceErrors((previous) => ({
            ...previous,
            config: message,
          }));
          setSplitSourceReady((previous) => ({
            ...previous,
            config: true,
          }));
          setFirebaseReady(true);
          setToast({ message, type: 'error' });
          return;
        }

        const configData = snapshot.data();

        setSplitPublicConfig(configData);
        setSplitStorageVersion(Number(configData.storageVersion || 0));
        setSplitSourceErrors((previous) => ({
          ...previous,
          config: '',
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          config: true,
        }));
      },
      (error) => {
        const message =
          'Firestore 공개 설정을 불러오지 못했습니다. rentalSystem/publicConfig 읽기 권한을 확인해 주세요.';

        console.error('Public config sync error:', error);
        setSplitPublicConfig(null);
        setSplitStorageVersion(0);
        setSplitSourceErrors((previous) => ({
          ...previous,
          config: message,
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          config: true,
        }));
        setFirebaseReady(true);
        setToast({ message, type: 'error' });
      }
    );

    return unsubscribe;
  }, [
    setFirebaseReady,
    setSplitPublicConfig,
    setSplitSourceErrors,
    setSplitSourceReady,
    setSplitStorageVersion,
    setToast,
  ]);

  useEffect(() => {
    const shouldLoadUserCatalog =
      view === 'user' && ['home', 'rental'].includes(userTab);
    const shouldSubscribeAdminAssets =
      view === 'admin' &&
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id) &&
      ['laptops', 'requests', 'categories', 'dataManagement'].includes(adminTab);

    if (!shouldLoadUserCatalog && !shouldSubscribeAdminAssets) {
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(false);
      setSplitSourceErrors((previous) => ({
        ...previous,
        assets: '',
      }));
      setSplitSourceReady((previous) => ({
        ...previous,
        assets: true,
      }));
      return undefined;
    }

    setFirebaseReady(false);
    setSplitSourceReady((previous) => ({
      ...previous,
      assets: false,
    }));

    if (shouldSubscribeAdminAssets) {
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(false);

      const unsubscribe = onSnapshot(
        RENTAL_ASSETS_COLLECTION_REF,
        (snapshot) => {
          const assets = snapshot.docs.map((assetDocument) => ({
            ...assetDocument.data(),
            id: assetDocument.id,
            reservations: normalizeAssetReservations(
              assetDocument.data().reservations || []
            ),
          }));

          setSplitRentalAssets(assets);
          setSplitSourceErrors((previous) => ({
            ...previous,
            assets: '',
          }));
          setSplitSourceReady((previous) => ({
            ...previous,
            assets: true,
          }));
        },
        (error) => {
          const message =
            '대여 자산 컬렉션을 불러오지 못했습니다. rentalAssets 읽기 권한을 확인해 주세요.';

          console.error('Rental assets sync error:', error);
          setSplitRentalAssets([]);
          setSplitSourceErrors((previous) => ({
            ...previous,
            assets: message,
          }));
          setSplitSourceReady((previous) => ({
            ...previous,
            assets: true,
          }));
          setFirebaseReady(true);
          setToast({ message, type: 'error' });
        }
      );

      return unsubscribe;
    }

    let cancelled = false;
    setPublicCatalogAssetsReady(false);

    const loadLegacyAssetFallback = async (reason = '') => {
      try {
        const fallbackSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
        if (cancelled) return;

        const fallbackAssets = normalizePublicCatalogAssets(
          fallbackSnapshot.docs.map((assetDocument) => ({
            ...assetDocument.data(),
            id: assetDocument.id,
          }))
        );

        setPublicCatalogAssets(fallbackAssets);
        setPublicCatalogAssetsReady(true);
        setSplitSourceErrors((previous) => ({
          ...previous,
          assets: '',
        }));

        if (reason) {
          console.warn('Public asset catalog fallback activated:', reason);
        }
      } catch (fallbackError) {
        if (cancelled) return;

        const message =
          '공개 자산 카탈로그와 기존 자산 목록을 모두 불러오지 못했습니다.';
        console.error('Public asset catalog fallback error:', fallbackError);
        setPublicCatalogAssets([]);
        setPublicCatalogAssetsReady(true);
        setSplitRentalAssets([]);
        setSplitSourceErrors((previous) => ({
          ...previous,
          assets: message,
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          assets: true,
        }));
        setFirebaseReady(true);
        setToast({ message, type: 'error' });
      }
    };

    const unsubscribe = onSnapshot(
      PUBLIC_ASSET_CATALOG_DOC_REF,
      (snapshot) => {
        if (cancelled) return;

        const catalogData = snapshot.exists() ? snapshot.data() : null;
        const hasCurrentCatalogSchema =
          Number(catalogData?.schemaVersion || 0) ===
            PUBLIC_ASSET_CATALOG_SCHEMA_VERSION &&
          Array.isArray(catalogData?.assets);

        if (!hasCurrentCatalogSchema) {
          void loadLegacyAssetFallback(
            snapshot.exists()
              ? 'publicCatalog/main 문서가 이전 스키마입니다.'
              : 'publicCatalog/main 문서가 없습니다.'
          );
          return;
        }

        const catalogAssets = normalizePublicCatalogAssets(
          snapshot.data().assets
        );
        setPublicCatalogAssets(catalogAssets);
        setPublicCatalogAssetsReady(true);
        setSplitSourceErrors((previous) => ({
          ...previous,
          assets: '',
        }));
      },
      (error) => {
        if (cancelled) return;
        console.error('Public asset catalog sync error:', error);
        void loadLegacyAssetFallback(
          error?.code || error?.message || 'unknown-error'
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    setFirebaseReady,
    setPublicCatalogAssets,
    setPublicCatalogAssetsReady,
    setSplitRentalAssets,
    setSplitSourceErrors,
    setSplitSourceReady,
    setToast,
    userTab,
    view,
  ]);

  useEffect(() => {
    const shouldHydrateUserCatalog =
      view === 'user' &&
      ['home', 'rental'].includes(userTab) &&
      publicCatalogAssetsReady &&
      splitSourceReady.availability;

    if (!shouldHydrateUserCatalog) {
      return;
    }

    setSplitRentalAssets(
      hydratePublicCatalogAssets(
        publicCatalogAssets,
        splitRentalAvailability
      )
    );
    setSplitSourceErrors((previous) => ({
      ...previous,
      assets: '',
    }));
    setSplitSourceReady((previous) => ({
      ...previous,
      assets: true,
    }));
  }, [
    publicCatalogAssets,
    publicCatalogAssetsReady,
    setSplitRentalAssets,
    setSplitSourceErrors,
    setSplitSourceReady,
    splitRentalAvailability,
    splitSourceReady.availability,
    userTab,
    view,
  ]);

  useEffect(() => {
    const shouldSubscribeAvailability =
      (view === 'user' && ['home', 'rental'].includes(userTab)) ||
      (view === 'admin' &&
        Boolean(authenticatedAdminId) &&
        Boolean(currentAuthAdminAccount?.id) &&
        ['laptops', 'requests'].includes(adminTab));

    if (!shouldSubscribeAvailability) {
      setSplitSourceErrors((previous) => ({
        ...previous,
        availability: '',
      }));
      setSplitSourceReady((previous) => ({
        ...previous,
        availability: true,
      }));
      return undefined;
    }

    setFirebaseReady(false);
    setSplitSourceReady((previous) => ({
      ...previous,
      availability: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      (snapshot) => {
        const availabilityRequests = snapshot.docs.map(
          (availabilityDocument) => ({
            ...availabilityDocument.data(),
            id: availabilityDocument.id,
          })
        );

        setSplitRentalAvailability(availabilityRequests);
        setSplitSourceErrors((previous) => ({
          ...previous,
          availability: '',
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          availability: true,
        }));
      },
      (error) => {
        const message =
          '공개 예약 현황을 불러오지 못했습니다. rentalAvailability 읽기 권한을 확인해 주세요.';

        console.error('Rental availability sync error:', error);
        setSplitRentalAvailability([]);
        setSplitSourceErrors((previous) => ({
          ...previous,
          availability: message,
        }));
        setSplitSourceReady((previous) => ({
          ...previous,
          availability: true,
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
    setFirebaseReady,
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
