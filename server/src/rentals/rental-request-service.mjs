const normalizeText = (value) => String(value ?? '').trim();
const serviceError = (code, message) => {
  const error = new Error(message);
  error.name = 'RentalRequestServiceError';
  error.code = code;
  return error;
};

const sortRequests = (requests) => [...requests].sort((left, right) => {
  const leftTime = Date.parse(left.createdAt || '') || 0;
  const rightTime = Date.parse(right.createdAt || '') || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.id || '').localeCompare(String(left.id || ''));
});

export const createRentalRequestService = ({
  userRepository,
  firebaseLinkRepository,
  rentalRequestRepository,
}) => {
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') throw new TypeError('userRepository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByAppUserId !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!rentalRequestRepository || typeof rentalRequestRepository.listAuthoritativeByAppUserId !== 'function') throw new TypeError('rentalRequestRepository.listAuthoritativeByAppUserId is required.');

  const context = async (clerkUserId) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'Application user identity is not synchronized.');
    const firebaseLink = await firebaseLinkRepository.findByAppUserId(appUser.id);
    if (!firebaseLink) throw serviceError('legacy_link_not_found', 'Compatibility identity link has not been synchronized.');
    return { appUser, firebaseLink };
  };

  const readAuthoritativeCurrent = async (appUser, firebaseLink) => {
    const requests = sortRequests(await rentalRequestRepository.listAuthoritativeByAppUserId(appUser.id));
    return Object.freeze({
      appUser,
      firebaseLink,
      syncState: Object.freeze({
        appUserId: String(appUser.id),
        firebaseUid: normalizeText(firebaseLink.firebaseUid),
        sourceRequestCount: requests.length,
        sourceHash: 'postgresql-authoritative',
        syncedAt: requests[0]?.updatedAt || null,
        sourceMode: 'postgresql-authoritative',
      }),
      requests,
    });
  };

  return Object.freeze({
    async getCurrent(clerkUserId) {
      const { appUser, firebaseLink } = await context(clerkUserId);
      return readAuthoritativeCurrent(appUser, firebaseLink);
    },

    async syncCurrent(clerkUserId) {
      // Compatibility method retained for callers, but there is no shadow synchronization.
      const { appUser, firebaseLink } = await context(clerkUserId);
      return readAuthoritativeCurrent(appUser, firebaseLink);
    },

    async compareCurrent(clerkUserId) {
      const { appUser, firebaseLink } = await context(clerkUserId);
      const current = await readAuthoritativeCurrent(appUser, firebaseLink);
      return Object.freeze({
        equivalent: true,
        sourceCount: current.requests.length,
        shadowCount: 0,
        sourceHash: 'postgresql-authoritative',
        shadowHash: '',
        syncHash: 'postgresql-authoritative',
        changedRequestIds: [],
        syncedAt: current.syncState.syncedAt,
        source: 'postgresql-authoritative',
        legacyShadowRetired: true,
      });
    },
  });
};
