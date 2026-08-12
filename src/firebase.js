import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import {
  collection,
  disableNetwork,
  doc,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import { createFirestoreLocalCache } from './config/firestoreCachePolicy.js';

export const firebaseConfig = {
  apiKey: "AIzaSyA-hQv4mZwrTWUn10aiS3QSLgwSWzBNds0",
  authDomain: "laptop-system-mk.firebaseapp.com",
  projectId: "laptop-system-mk",
  storageBucket: "laptop-system-mk.firebasestorage.app",
  messagingSenderId: "978421108190",
  appId: "1:978421108190:web:6bc9af49a57471ae2a614f"
};

const firebaseRuntimeDisabled =
  String(import.meta.env?.VITE_CLERK_STAGING_ENABLED || '').toLowerCase() === 'true' &&
  String(import.meta.env?.VITE_FIREBASE_RUNTIME_DISABLED || '').toLowerCase() === 'true' &&
  (typeof location === 'undefined' || new URLSearchParams(location.search || '').get('firebaseRuntime') !== 'compatibility');

const existingDefaultFirebaseApp = getApps().some(
  (app) => app.name === '[DEFAULT]'
);

export const firebaseApp = existingDefaultFirebaseApp
  ? getApp()
  : initializeApp(firebaseConfig);

export const adminAccountCreationApp = getApps().some(
  (app) => app.name === 'adminAccountCreation'
  )
    ? getApp('adminAccountCreation')
    : initializeApp(firebaseConfig, 'adminAccountCreation');

export const userSignupApp = getApps().some(
  (app) => app.name === 'userSignup'
  )
    ? getApp('userSignup')
    : initializeApp(firebaseConfig, 'userSignup');

export const db = existingDefaultFirebaseApp
  ? getFirestore(firebaseApp)
  : initializeFirestore(firebaseApp, {
      localCache: createFirestoreLocalCache(),
    });

const getRuntimeAuth = (app) => {
  if (!firebaseRuntimeDisabled) return getAuth(app);
  try {
    return initializeAuth(app, { persistence: [] });
  } catch {
    return getAuth(app);
  }
};

export const firebaseAuth = getRuntimeAuth(firebaseApp);
// Phase 34 transition bridge: existing PostgreSQL-authoritative controllers still
// read firebaseAuth.currentUser as an identity container. Under Firebase runtime
// retirement this stores a Clerk/PostgreSQL principal locally; it never signs in
// to Firebase or produces a Firebase token.
export const setFirebaseRuntimePrincipal = (principal) => {
  firebaseAuth.currentUser = principal || null;
  return firebaseAuth.currentUser;
};
export const adminAccountCreationAuth = getRuntimeAuth(adminAccountCreationApp);
export const userSignupAuth = getRuntimeAuth(userSignupApp);
export const userSignupDb = getFirestore(userSignupApp);

// Firebase SDK references remain structurally valid for legacy modules, but
// normal Phase 34 runtime is placed offline before those modules can subscribe.
// This prevents Firestore reads/writes while avoiding invalid placeholder
// objects that crash the SDK during document/query construction.
export const firebaseRuntimeNetworkBarrier = firebaseRuntimeDisabled
  ? Promise.allSettled([disableNetwork(db), disableNetwork(userSignupDb)])
  : Promise.resolve([]);

export const ADMIN_ACCOUNTS_COLLECTION_REF = collection(
  db,
  'adminAccounts'
);

export const RENTAL_REQUESTS_COLLECTION_REF = collection(
  db,
  'rentalRequests'
);

export const RENTAL_REQUEST_LOGS_COLLECTION_REF = collection(
  db,
  'rentalRequestLogs'
);

export const NOTICE_POSTS_COLLECTION_REF = collection(
  db,
  'noticePosts'
);

export const POPUP_POSTS_COLLECTION_REF = collection(
  db,
  'popupPosts'
);

export const FOOTER_PAGES_COLLECTION_REF = collection(
  db,
  'footerPages'
);

export const SITE_FOOTER_CONFIG_DOC_REF = doc(
  db,
  'siteFooter',
  'config'
);

export const HOME_BANNERS_COLLECTION_REF = collection(
  db,
  'homeBanners'
);

export const HOME_PAGE_CONFIG_DOC_REF = doc(
  db,
  'homePage',
  'config'
);

export const NOTICE_BOARD_CONFIG_DOC_REF = doc(
  db,
  'noticeBoard',
  'config'
);

export const FAQ_POSTS_COLLECTION_REF = collection(
  db,
  'faqPosts'
);

export const FAQ_CATEGORIES_COLLECTION_REF = collection(
  db,
  'faqCategories'
);

export const FAQ_BOARD_CONFIG_DOC_REF = doc(
  db,
  'faqBoard',
  'config'
);

export const USER_ACCOUNTS_COLLECTION_NAME = 'userAccounts';

export const USER_ACCOUNTS_COLLECTION_REF = collection(
  db,
  USER_ACCOUNTS_COLLECTION_NAME
);

export const PUBLIC_CONFIG_DOC_REF = doc(
  db,
  'rentalSystem',
  'publicConfig'
);

export const PUBLIC_ASSET_CATALOG_DOC_REF = doc(
  db,
  'publicCatalog',
  'main'
);

export const DASHBOARD_SUMMARY_DOC_REF = doc(
  db,
  'laptopRentalDashboard',
  'main'
);

export const RENTAL_ASSETS_COLLECTION_REF = collection(
  db,
  'rentalAssets'
);

export const RENTAL_AVAILABILITY_COLLECTION_REF = collection(
  db,
  'rentalAvailability'
);

export const RENTAL_BORROWERS_COLLECTION_REF = collection(
  db,
  'rentalBorrowers'
);

export const MEMBER_DIRECTORY_KEYS_COLLECTION_REF = collection(
  db,
  'memberDirectoryKeys'
);

export const MEMBER_IDENTITY_CLAIMS_COLLECTION_REF = collection(
  db,
  'memberIdentityClaims'
);

export const ACCOUNT_RECOVERY_KEYS_COLLECTION_REF = collection(
  db,
  'accountRecoveryKeys'
);

export const RENTAL_ASSET_NUMBERS_COLLECTION_REF = collection(
  db,
  'rentalAssetNumbers'
);

export const RENTAL_RESTRICTIONS_COLLECTION_REF = collection(
  db,
  'rentalRestrictions'
);

export const SITE_SETTINGS_DOC_REF = doc(
  db,
  'siteSettings',
  'config'
);

export const SYSTEM_ADMIN_SETTINGS_DOC_REF = doc(
  db,
  'systemSettings',
  'admin'
);

export const USER_SESSION_POLICY_DOC_REF = doc(
  db,
  'securityPolicies',
  'userSession'
);

export const SYSTEM_AUDIT_LOGS_COLLECTION_REF = collection(
  db,
  'systemAuditLogs'
);

export const SYSTEM_RESET_JOBS_COLLECTION_REF = collection(
  db,
  'systemResetJobs'
);

export const SYSTEM_RESTORE_JOBS_COLLECTION_REF = collection(
  db,
  'systemRestoreJobs'
);


export const SIGNUP_TERMS_POLICY_DOC_REF = doc(
  db,
  'signupTermsPolicy',
  'current'
);

export const SIGNUP_TERMS_COLLECTION_REF = collection(
  db,
  'signupTerms'
);

export const SIGNUP_TERM_VERSIONS_COLLECTION_REF = collection(
  db,
  'signupTermVersions'
);

export const USER_TERM_CONSENT_STATES_COLLECTION_REF = collection(
  db,
  'userTermConsentStates'
);

export const USER_TERM_CONSENT_LOGS_COLLECTION_REF = collection(
  db,
  'userTermConsentLogs'
);
