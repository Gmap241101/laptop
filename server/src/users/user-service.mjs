export const createUserIdentityService = ({ clerkClient, userRepository }) => {
  if (!clerkClient || typeof clerkClient.getUser !== 'function') {
    throw new TypeError('clerkClient.getUser() is required.');
  }
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function' || typeof userRepository.upsertFromClerk !== 'function') {
    throw new TypeError('userRepository find/upsert methods are required.');
  }

  return Object.freeze({
    async getCurrent(clerkUserId) {
      return userRepository.findByClerkUserId(clerkUserId);
    },

    async syncCurrent(clerkUserId) {
      const clerkProfile = await clerkClient.getUser(clerkUserId);
      if (clerkProfile.clerkUserId !== clerkUserId) {
        const error = new Error('Clerk user identity mismatch.');
        error.code = 'clerk_identity_mismatch';
        throw error;
      }
      return userRepository.upsertFromClerk(clerkProfile);
    },
  });
};
