import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  Laptop,
  LayoutDashboard,
  LogOut,
  Pin,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCircle,
  Users,
  X,
  XCircle,
} from 'lucide-react';

import {
  AdminPageHeader,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  LockIcon,
  Select,
} from '../components/CommonUI.jsx';
import {
  ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
  FAQ_POSTS_PER_PAGE_OPTIONS,
  NOTICE_POSTS_PER_PAGE_OPTIONS,
  OVERDUE_PENALTY_MODE,
  RENTAL_EXTENSION_APPROVAL_MODE,
  RENTAL_REQUEST_AUDIT_ACTION,
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from '../constants/appConstants.js';
import { USER_PROFILE_STATUS } from '../constants/memberConstants.js';
import {
  DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
  DEFAULT_EXCLUDE_SATURDAYS,
  DEFAULT_EXCLUDE_SUNDAYS,
  DEFAULT_HOLIDAY_TYPE,
  DEFAULT_WORK_END_TIME,
  HOLIDAY_TYPE_LABEL,
  defaultRentalStartDate,
  getExtensionRequestAvailableDate,
  getLaptopAdminDisplayStatus,
  getMaxRentalDueDate,
  getRentalExtensionPeriod,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionMaxCount,
} from '../domain/rentalPolicy.js';
import {
  ADMIN_ACCOUNT_PAGE_SIZE,
  ADMIN_CUSTOM_OPTION_VALUE,
  createDefaultAdminAccountForm,
} from '../features/auth/useAdminAccountManagementController.js';
import useStableContextGroups from '../hooks/useStableContextGroups.js';
import {
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  getKoreaNow,
  getRequestDisplayStatus,
  today,
} from '../utils/appUtils.js';
import {
  formatPopupDateTime,
  getPopupDisplayStatus,
} from '../utils/popupUtils.js';
import {
  APP_CONTEXT_GROUP_KEYS,
  getAdminPanelContextKey,
} from '../context/appContextSlices.js';

const ADMIN_DIALOG_CONTEXT_KEYS = Object.freeze(
  'AlertCircle AnimatePresence Button CheckCircle2 Input Select X closeFaqPostDialog closeNoticePostDialog closePopupPostDialog confirmModal faqCategories faqPostDialog faqPostForm faqPostSaving motion noticePostDialog noticePostForm noticePostSaving popupPostDialog popupPostForm popupPostSaving saveFaqPost saveNoticePost savePopupPost setConfirmModal setFaqPostForm setNoticePostForm setPopupPostForm setToast toast'.split(' ')
);

const ADMIN_CONTEXT_GROUP_KEYS = Object.freeze({
  admin: APP_CONTEXT_GROUP_KEYS.admin,
  app: Object.freeze({
    dialogs: ADMIN_DIALOG_CONTEXT_KEYS,
  }),
});

const ADMIN_CONTEXT_STATIC_VALUES = Object.freeze({
  ADMIN_ACCOUNT_PAGE_SIZE,
  ADMIN_CUSTOM_OPTION_VALUE,
  ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
  AlertCircle,
  AnimatePresence,
  AdminPageHeader,
  Badge,
  Button,
  Card,
  CardContent,
  CheckCircle2,
  ClipboardList,
  Clock,
  DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
  DEFAULT_EXCLUDE_SATURDAYS,
  DEFAULT_EXCLUDE_SUNDAYS,
  DEFAULT_HOLIDAY_TYPE,
  DEFAULT_WORK_END_TIME,
  Edit3,
  FAQ_POSTS_PER_PAGE_OPTIONS,
  HOLIDAY_TYPE_LABEL,
  Input,
  Laptop,
  LayoutDashboard,
  LockIcon,
  LogOut,
  NOTICE_POSTS_PER_PAGE_OPTIONS,
  OVERDUE_PENALTY_MODE,
  Pin,
  Plus,
  RENTAL_EXTENSION_APPROVAL_MODE,
  RENTAL_REQUEST_AUDIT_ACTION,
  React,
  STATUS,
  Save,
  Search,
  Select,
  Settings,
  ShieldCheck,
  Trash2,
  USER_PROFILE_STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
  UserCircle,
  Users,
  X,
  XCircle,
  createDefaultAdminAccountForm,
  defaultRentalStartDate,
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  formatPopupDateTime,
  getExtensionRequestAvailableDate,
  getKoreaNow,
  getLaptopAdminDisplayStatus,
  getMaxRentalDueDate,
  getPopupDisplayStatus,
  getRentalExtensionPeriod,
  getRequestDisplayStatus,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionMaxCount,
  motion,
  today,
});

const createAdminDynamicContextValues = (sourceValues = {}) => ({
  ...sourceValues,
  adminRequestsPrerequisitesReady:
    sourceValues.firebaseAuthReady &&
    sourceValues.currentAuthRoleReady &&
    !sourceValues.currentAuthRoleErrorMessage &&
    Boolean(sourceValues.firebaseAuthUser?.uid),
  memberAccountsPrerequisitesReady:
    sourceValues.firebaseAuthReady && sourceValues.currentAuthRoleReady,
  memberDirectoryBorrowers: sourceValues.data?.borrowers || [],
  memberDirectorySettings: sourceValues.data?.settings || {},
  memberDirectoryTeams: sourceValues.data?.teams || [],
  onAdminRequestsControllerStateChange:
    sourceValues.handleAdminRequestsControllerStateChange,
  onMemberDirectoryDeferredStateChange:
    sourceValues.handleMemberDirectoryDeferredStateChange,
  onSignupPolicyDeferredStateChange:
    sourceValues.handleSignupPolicyDeferredStateChange,
  signupPolicySettings: sourceValues.data?.settings || {},
});

export default function useAdminContextAssembler({
  adminTab,
  dynamicSourceValues,
}) {
  const dynamicValues = createAdminDynamicContextValues(dynamicSourceValues);
  const contextGroups = useStableContextGroups(
    {
      ...ADMIN_CONTEXT_STATIC_VALUES,
      ...dynamicValues,
    },
    ADMIN_CONTEXT_GROUP_KEYS
  );

  return {
    adminPanelContextKey: getAdminPanelContextKey(adminTab),
    contextGroups,
  };
}
