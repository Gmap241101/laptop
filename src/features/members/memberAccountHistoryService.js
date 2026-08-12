import {
  getDocs,
  query as firestoreQuery,
  where,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  RENTAL_REQUESTS_COLLECTION_REF,
} from '../../platform/appDataRefs.js';
import {
  STATUS,
} from '../../constants/appConstants.js';
import {
  today,
} from '../../utils/appUtils.js';

export const loadMemberAccountHistorySummary = async (account = {}) => {
  const linkedUids = [
    ...new Set(
      [
        String(account.uid || ''),
        ...(Array.isArray(account.previousAccountUids)
          ? account.previousAccountUids.map((uid) => String(uid || ''))
          : []),
      ].filter(Boolean)
    ),
  ];

  if (linkedUids.length === 0) {
    return {
      linkedUidCount: 0,
      totalRequests: 0,
      previousRequests: 0,
      overdueRequests: 0,
      activeRequests: 0,
      inheritedRestriction: account.inheritedRestriction || {},
    };
  }

  const uidChunks = [];

  for (let index = 0; index < linkedUids.length; index += 30) {
    uidChunks.push(linkedUids.slice(index, index + 30));
  }

  const snapshots = await Promise.all(
    uidChunks.map((uidChunk) =>
      getDocs(
        firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterUid', 'in', uidChunk)
        )
      )
    )
  );

  const linkedRequests = snapshots.flatMap((snapshot) =>
    snapshot.docs.map((requestDoc) => ({
      ...requestDoc.data(),
      id: requestDoc.id,
    }))
  );
  const currentUid = String(account.uid || '');
  const previousRequests = linkedRequests.filter(
    (request) => String(request.requesterUid || '') !== currentUid
  );
  const referenceDate = today();
  const overdueRequests = linkedRequests.filter(
    (request) =>
      Number(request.overdueDaysAtReturn || 0) > 0 ||
      (request.status === STATUS.APPROVED &&
        request.dueDate &&
        request.dueDate < referenceDate)
  );
  const activeRequests = linkedRequests.filter((request) =>
    [STATUS.REQUESTED, STATUS.ON_HOLD, STATUS.APPROVED].includes(
      request.status
    )
  );

  return {
    linkedUidCount: linkedUids.length,
    totalRequests: linkedRequests.length,
    previousRequests: previousRequests.length,
    overdueRequests: overdueRequests.length,
    activeRequests: activeRequests.length,
    inheritedRestriction: account.inheritedRestriction || {},
  };
};
