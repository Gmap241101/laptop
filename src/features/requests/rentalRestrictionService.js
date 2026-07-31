import {
  doc,
  getDoc,
  getDocs,
  query as firestoreQuery,
  where,
} from 'firebase/firestore';

import {
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  RENTAL_RESTRICTIONS_COLLECTION_REF,
} from '../../firebase.js';
import { normalizeRentalPolicySettings } from '../../domain/rentalPolicy.js';
import { today } from '../../utils/appUtils.js';
import { getRentalRestrictionStatus } from '../../utils/overduePolicy.js';

export const loadFreshRentalRestrictionStatus = async ({
  requesterUid,
  fallbackSettings,
}) => {
  const restrictionDocRef = doc(
    RENTAL_RESTRICTIONS_COLLECTION_REF,
    requesterUid
  );

  const [
    publicConfigSnapshot,
    userRequestsSnapshot,
    restrictionSnapshot,
  ] = await Promise.all([
    getDoc(PUBLIC_CONFIG_DOC_REF),
    getDocs(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('requesterUid', '==', requesterUid)
      )
    ),
    getDoc(restrictionDocRef),
  ]);

  const latestSettings = normalizeRentalPolicySettings({
    ...fallbackSettings,
    ...(publicConfigSnapshot.exists()
      ? publicConfigSnapshot.data()?.settings || {}
      : {}),
  });

  const latestRequests = userRequestsSnapshot.docs.map(
    (requestDocument) => ({
      ...requestDocument.data(),
      id: requestDocument.id,
    })
  );

  const latestRestriction = restrictionSnapshot.exists()
    ? {
        ...restrictionSnapshot.data(),
        uid: restrictionSnapshot.id,
      }
    : null;

  return getRentalRestrictionStatus({
    requests: latestRequests,
    requesterUid,
    settings: latestSettings,
    restriction: latestRestriction,
    referenceDate: today(),
  });
};

export const createFreshRentalRestrictionStatusLoader = ({
  fallbackSettings,
}) =>
  (requesterUid) =>
    loadFreshRentalRestrictionStatus({
      requesterUid,
      fallbackSettings,
    });
