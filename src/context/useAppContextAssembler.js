import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  Info,
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
  DateInputWithWeekday,
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
  getAdjustedRentalDueDate,
  getExtensionRequestAvailableDate,
  getLaptopAdminDisplayStatus,
  getLaptopRentalAvailability,
  getMaxRentalDueDate,
  getRentalDueDateAdjustmentReason,
  getRentalExtensionApprovalMode,
  getRentalExtensionPeriod,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionDays,
  getSafeRentalExtensionMaxCount,
} from '../domain/rentalPolicy.js';
import {
  ADMIN_ACCOUNT_PAGE_SIZE,
  ADMIN_CUSTOM_OPTION_VALUE,
  createDefaultAdminAccountForm,
} from '../features/auth/useAdminAccountManagementController.js';
import { getUserLaptopStatusLabel } from '../features/requests/useRentalDerivedSelectors.js';
import useStableContextGroups from '../hooks/useStableContextGroups.js';
import { pushAppPath } from '../routing/appRoutes.js';
import {
  addDaysFrom,
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  getDisplayRentalStatus,
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
  getUserPanelContextKey,
} from './appContextSlices.js';

/**
 * 화면 컨텍스트에서 사용하는 정적 컴포넌트·상수·순수 helper입니다.
 * App.jsx 렌더링 상태와 무관하므로 한 번 생성한 참조를 모든 컨텍스트 조각이 공유합니다.
 */
export const APP_CONTEXT_STATIC_VALUES = Object.freeze({
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
  DateInputWithWeekday,
  Edit3,
  FAQ_POSTS_PER_PAGE_OPTIONS,
  HOLIDAY_TYPE_LABEL,
  Info,
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
  addDaysFrom,
  createDefaultAdminAccountForm,
  defaultRentalStartDate,
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  formatPopupDateTime,
  getAdjustedRentalDueDate,
  getDisplayRentalStatus,
  getExtensionRequestAvailableDate,
  getKoreaNow,
  getLaptopAdminDisplayStatus,
  getLaptopRentalAvailability,
  getMaxRentalDueDate,
  getPopupDisplayStatus,
  getRentalDueDateAdjustmentReason,
  getRentalExtensionApprovalMode,
  getRentalExtensionPeriod,
  getRequestDisplayStatus,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionDays,
  getSafeRentalExtensionMaxCount,
  getUserLaptopStatusLabel,
  motion,
  pushAppPath,
  today,
});

/**
 * App의 동적 상태·행동과 정적 UI 의존성을 합쳐 화면별 안정 컨텍스트를 생성합니다.
 * 패널 선택 키 계산도 함께 처리해 App.jsx가 컨텍스트 내부 구조를 직접 알 필요가 없게 합니다.
 */
export default function useAppContextAssembler({
  adminTab,
  dynamicValues,
  hasFirebaseAuthSession,
  isUserDirectoryAccessRestricted,
  userTab,
}) {
  const contextGroups = useStableContextGroups(
    {
      ...APP_CONTEXT_STATIC_VALUES,
      ...dynamicValues,
    },
    APP_CONTEXT_GROUP_KEYS
  );

  return {
    adminPanelContextKey: getAdminPanelContextKey(adminTab),
    contextGroups,
    userPanelContextKey: getUserPanelContextKey({
      userTab,
      hasFirebaseAuthSession,
      isUserDirectoryAccessRestricted,
    }),
  };
}
