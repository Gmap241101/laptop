import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, doc, getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyA-hQv4mZwrTWUn10aiS3QSLgwSWzBNds0",
  authDomain: "laptop-system-mk.firebaseapp.com",
  projectId: "laptop-system-mk",
  storageBucket: "laptop-system-mk.firebasestorage.app",
  messagingSenderId: "978421108190",
  appId: "1:978421108190:web:6bc9af49a57471ae2a614f"
};

export const firebaseApp = getApps().some((app) => app.name === '[DEFAULT]')
  ? getApp()
  : initializeApp(firebaseConfig);

export const adminAccountCreationApp = getApps().some(
  (app) => app.name === 'adminAccountCreation'
)
  ? getApp('adminAccountCreation')
  : initializeApp(firebaseConfig, 'adminAccountCreation');

export const db = getFirestore(firebaseApp);
export const firebaseAuth = getAuth(firebaseApp);
export const adminAccountCreationAuth = getAuth(adminAccountCreationApp);

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
