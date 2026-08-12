// Phase 34 hard retirement compatibility shell.
// This module intentionally contains no Firebase SDK import and cannot perform
// network I/O. It only preserves enough value shapes for legacy code that is
// unreachable in the PostgreSQL/Clerk runtime and for timestamp normalization.

const retiredError = (operation = 'firebase') => {
  const error = new Error(`Firebase runtime operation is retired: ${operation}`);
  error.code = 'firebase_runtime_removed';
  error.status = 410;
  return error;
};

const normalizePathPart = (value) => {
  if (value && typeof value === 'object' && typeof value.path === 'string') return value.path;
  return String(value ?? '').replace(/^\/+|\/+$/g, '');
};
const joinPath = (...parts) => parts.map(normalizePathPart).filter(Boolean).join('/');

export class Timestamp {
  constructor(seconds = 0, nanoseconds = 0) {
    this.seconds = Number(seconds || 0);
    this.nanoseconds = Number(nanoseconds || 0);
  }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromMillis(value) {
    const millis = Number(value || 0);
    const seconds = Math.floor(millis / 1000);
    return new Timestamp(seconds, Math.floor((millis - seconds * 1000) * 1e6));
  }
  static fromDate(value) { return Timestamp.fromMillis(value instanceof Date ? value.getTime() : Date.parse(value)); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
}

export const serverTimestamp = () => new Date();
export const collection = (parent, ...segments) => Object.freeze({ type: 'retired-collection-ref', path: joinPath(parent, ...segments) });
export const doc = (parent, ...segments) => Object.freeze({ type: 'retired-document-ref', path: joinPath(parent, ...segments), id: String(segments.at(-1) || '') });
export const where = (...args) => Object.freeze({ type: 'where', args });
export const orderBy = (...args) => Object.freeze({ type: 'orderBy', args });
export const limit = (...args) => Object.freeze({ type: 'limit', args });
export const startAfter = (...args) => Object.freeze({ type: 'startAfter', args });
export const query = (reference, ...constraints) => Object.freeze({ ...reference, type: 'retired-query-ref', constraints });

const emptyDocSnapshot = (reference = {}) => ({
  id: reference.id || String(reference.path || '').split('/').at(-1) || '',
  ref: reference,
  exists: () => false,
  data: () => undefined,
});
const emptyQuerySnapshot = () => ({ docs: [], empty: true, size: 0, forEach() {} });

export const getDoc = async () => { throw retiredError('getDoc'); };
export const getDocFromServer = async () => { throw retiredError('getDocFromServer'); };
export const getDocs = async () => { throw retiredError('getDocs'); };
export const getDocsFromServer = async () => { throw retiredError('getDocsFromServer'); };
export const getCountFromServer = async () => { throw retiredError('getCountFromServer'); };
export const setDoc = async () => { throw retiredError('setDoc'); };
export const updateDoc = async () => { throw retiredError('updateDoc'); };
export const deleteDoc = async () => { throw retiredError('deleteDoc'); };
export const addDoc = async () => { throw retiredError('addDoc'); };
export const runTransaction = async () => { throw retiredError('runTransaction'); };
export const onSnapshot = (_reference, onNext, onError) => {
  const error = retiredError('onSnapshot');
  if (typeof onError === 'function') queueMicrotask(() => onError(error));
  else if (typeof onNext === 'function') queueMicrotask(() => {});
  return () => {};
};
export const writeBatch = () => ({
  set() { throw retiredError('writeBatch.set'); },
  update() { throw retiredError('writeBatch.update'); },
  delete() { throw retiredError('writeBatch.delete'); },
  async commit() { throw retiredError('writeBatch.commit'); },
});

export const EmailAuthProvider = Object.freeze({ credential: (email, password) => ({ email, password, retired: true }) });
export const onAuthStateChanged = (_auth, callback) => { if (typeof callback === 'function') queueMicrotask(() => callback(null)); return () => {}; };
export const signOut = async (auth) => { if (auth) auth.currentUser = null; };
export const signInWithEmailAndPassword = async () => { throw retiredError('signInWithEmailAndPassword'); };
export const createUserWithEmailAndPassword = async () => { throw retiredError('createUserWithEmailAndPassword'); };
export const sendPasswordResetEmail = async () => { throw retiredError('sendPasswordResetEmail'); };
export const updatePassword = async () => { throw retiredError('updatePassword'); };
export const updateProfile = async () => { throw retiredError('updateProfile'); };
export const deleteUser = async () => { throw retiredError('deleteUser'); };
export const reauthenticateWithCredential = async () => { throw retiredError('reauthenticateWithCredential'); };
export const setPersistence = async () => { throw retiredError('setPersistence'); };
export const browserLocalPersistence = Object.freeze({ type: 'retired' });
export const browserSessionPersistence = Object.freeze({ type: 'retired' });
export const inMemoryPersistence = Object.freeze({ type: 'retired' });
export const memoryEagerGarbageCollector = () => Object.freeze({ type: 'retired' });
export const memoryLocalCache = () => Object.freeze({ type: 'retired' });
export const disableNetwork = async () => [];
export const getAuth = () => ({ currentUser: null, retired: true });
export const initializeAuth = getAuth;
export const getFirestore = () => ({ path: '', retired: true });
export const initializeFirestore = getFirestore;

export const retiredEmptyDocSnapshot = emptyDocSnapshot;
export const retiredEmptyQuerySnapshot = emptyQuerySnapshot;
