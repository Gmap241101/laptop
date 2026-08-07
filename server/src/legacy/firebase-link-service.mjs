const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const serviceError = (code, message) => {
  const error = new Error(message);
  error.name = 'LegacyIdentityServiceError';
  error.code = code;
  return error;
};

export const createFirebaseLinkService = ({ userRepository, firebaseLinkRepository }) => {
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') {
    throw new TypeError('userRepository.findByClerkUserId() is required.');
  }
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByAppUserId !== 'function' || typeof firebaseLinkRepository.link !== 'function') {
    throw new TypeError('firebaseLinkRepository find/link methods are required.');
  }

  const getAppUser = async (clerkUserId) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'PostgreSQL user profile must be synchronized before linking Firebase.');
    return appUser;
  };

  return Object.freeze({
    async getCurrent(clerkUserId) {
      const appUser = await getAppUser(clerkUserId);
      return firebaseLinkRepository.findByAppUserId(appUser.id);
    },

    async linkCurrent(clerkUserId, firebaseIdentity) {
      const appUser = await getAppUser(clerkUserId);
      const clerkEmail = normalizeEmail(appUser.primaryEmail);
      const firebaseEmail = normalizeEmail(firebaseIdentity?.email);
      if (!clerkEmail || !firebaseEmail || clerkEmail !== firebaseEmail) {
        throw serviceError('firebase_email_mismatch', 'Clerk and Firebase email addresses must match before linking.');
      }

      return firebaseLinkRepository.link(appUser.id, firebaseIdentity);
    },
  });
};
