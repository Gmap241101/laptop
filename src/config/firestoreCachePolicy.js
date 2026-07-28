import {
  memoryEagerGarbageCollector,
  memoryLocalCache,
} from 'firebase/firestore';

/**
 * Firestore browser cache policy.
 *
 * This service can be used on shared department computers and handles member,
 * rental, and administrator data. Keep Firestore data in memory only so cached
 * documents do not remain in IndexedDB after the browser session ends.
 */
export const FIRESTORE_CACHE_POLICY = Object.freeze({
  mode: 'memory-only',
  persistentAcrossSessions: false,
  garbageCollection: 'eager',
});

export const createFirestoreLocalCache = () =>
  memoryLocalCache({
    garbageCollector: memoryEagerGarbageCollector(),
  });
