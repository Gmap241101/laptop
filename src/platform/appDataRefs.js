import { collection, doc } from './retiredLegacyDataCompat.js';

// PostgreSQL/Clerk runtime data references. These are inert path descriptors
// retained only so retired compatibility code can be parsed without Firebase.
export const firebaseConfig = Object.freeze({ retired: true, provider: 'none' });
export const firebaseApp = Object.freeze({ name: 'retired' });
export const adminAccountCreationApp = Object.freeze({ name: 'retired-admin' });
export const userSignupApp = Object.freeze({ name: 'retired-user-signup' });
export const db = Object.freeze({ path: '', retired: true });
export const firebaseAuth = { currentUser: null, retired: true };
export const adminAccountCreationAuth = { currentUser: null, retired: true };
export const userSignupAuth = { currentUser: null, retired: true };
export const userSignupDb = db;
export const setFirebaseRuntimePrincipal = (principal) => {
  firebaseAuth.currentUser = principal || null;
  return firebaseAuth.currentUser;
};
export const firebaseRuntimeNetworkBarrier = Promise.resolve([]);

export const ADMIN_ACCOUNTS_COLLECTION_REF = collection(db, 'adminAccounts');
export const RENTAL_REQUESTS_COLLECTION_REF = collection(db, 'rentalRequests');
export const RENTAL_REQUEST_LOGS_COLLECTION_REF = collection(db, 'rentalRequestLogs');
export const NOTICE_POSTS_COLLECTION_REF = collection(db, 'noticePosts');
export const POPUP_POSTS_COLLECTION_REF = collection(db, 'popupPosts');
export const FOOTER_PAGES_COLLECTION_REF = collection(db, 'footerPages');
export const SITE_FOOTER_CONFIG_DOC_REF = doc(db, 'siteFooter', 'config');
export const HOME_BANNERS_COLLECTION_REF = collection(db, 'homeBanners');
export const HOME_PAGE_CONFIG_DOC_REF = doc(db, 'homePage', 'config');
export const NOTICE_BOARD_CONFIG_DOC_REF = doc(db, 'noticeBoard', 'config');
export const FAQ_POSTS_COLLECTION_REF = collection(db, 'faqPosts');
export const FAQ_CATEGORIES_COLLECTION_REF = collection(db, 'faqCategories');
export const FAQ_BOARD_CONFIG_DOC_REF = doc(db, 'faqBoard', 'config');
export const USER_ACCOUNTS_COLLECTION_NAME = 'userAccounts';
export const USER_ACCOUNTS_COLLECTION_REF = collection(db, USER_ACCOUNTS_COLLECTION_NAME);
export const PUBLIC_CONFIG_DOC_REF = doc(db, 'rentalSystem', 'publicConfig');
export const PUBLIC_ASSET_CATALOG_DOC_REF = doc(db, 'publicCatalog', 'main');
export const DASHBOARD_SUMMARY_DOC_REF = doc(db, 'laptopRentalDashboard', 'main');
export const RENTAL_ASSETS_COLLECTION_REF = collection(db, 'rentalAssets');
export const RENTAL_AVAILABILITY_COLLECTION_REF = collection(db, 'rentalAvailability');
export const RENTAL_BORROWERS_COLLECTION_REF = collection(db, 'rentalBorrowers');
export const MEMBER_DIRECTORY_KEYS_COLLECTION_REF = collection(db, 'memberDirectoryKeys');
export const MEMBER_IDENTITY_CLAIMS_COLLECTION_REF = collection(db, 'memberIdentityClaims');
export const ACCOUNT_RECOVERY_KEYS_COLLECTION_REF = collection(db, 'accountRecoveryKeys');
export const RENTAL_ASSET_NUMBERS_COLLECTION_REF = collection(db, 'rentalAssetNumbers');
export const RENTAL_RESTRICTIONS_COLLECTION_REF = collection(db, 'rentalRestrictions');
export const SITE_SETTINGS_DOC_REF = doc(db, 'siteSettings', 'config');
export const SYSTEM_ADMIN_SETTINGS_DOC_REF = doc(db, 'systemSettings', 'admin');
export const USER_SESSION_POLICY_DOC_REF = doc(db, 'securityPolicies', 'userSession');
export const SYSTEM_AUDIT_LOGS_COLLECTION_REF = collection(db, 'systemAuditLogs');
export const SYSTEM_RESET_JOBS_COLLECTION_REF = collection(db, 'systemResetJobs');
export const SYSTEM_RESTORE_JOBS_COLLECTION_REF = collection(db, 'systemRestoreJobs');
export const SIGNUP_TERMS_POLICY_DOC_REF = doc(db, 'signupTermsPolicy', 'current');
export const SIGNUP_TERMS_COLLECTION_REF = collection(db, 'signupTerms');
export const SIGNUP_TERM_VERSIONS_COLLECTION_REF = collection(db, 'signupTermVersions');
export const USER_TERM_CONSENT_STATES_COLLECTION_REF = collection(db, 'userTermConsentStates');
export const USER_TERM_CONSENT_LOGS_COLLECTION_REF = collection(db, 'userTermConsentLogs');
