import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Info,
  Pin,
  Search,
  UserCircle,
  Users,
  X,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  DateInputWithWeekday,
  Input,
  LockIcon,
} from '../components/CommonUI.jsx';
import {
  ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
  ADMIN_REQUEST_TAB,
  RENTAL_EXTENSION_APPROVAL_MODE,
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from '../constants/appConstants.js';
import {
  getAdjustedRentalDueDate,
  getExtensionRequestAvailableDate,
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
import { getUserLaptopStatusLabel } from '../features/requests/useRentalDerivedSelectors.js';
import useStableContextGroups from '../hooks/useStableContextGroups.js';
import { pushAppPath } from '../routing/appRoutes.js';
import {
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  getRequestDisplayStatus,
  today,
} from '../utils/appUtils.js';
import {
  APP_CONTEXT_GROUP_KEYS,
  getUserPanelContextKey,
} from '../context/appContextSlices.js';

const USER_DIALOG_CONTEXT_KEYS = Object.freeze(
  'AlertCircle AnimatePresence Button CheckCircle2 DateInputWithWeekday USER_REQUEST_ACTION X activeUserActionRentalRequest closeUserActionDialog confirmModal data formatDateWithKoreanWeekday getAdjustedRentalDueDate getMaxRentalDueDate getRentalDueDateAdjustmentReason getRentalExtensionApprovalMode getRentalExtensionPeriod getUserRequestActionLabel motion setConfirmModal setToast setUserActionForm submitUserActionRequest toast today triggerToast userActionDialog userActionForm userActionSaving'.split(' ')
);

const USER_CONTEXT_GROUP_KEYS = Object.freeze({
  user: APP_CONTEXT_GROUP_KEYS.user,
  app: Object.freeze({
    footer: APP_CONTEXT_GROUP_KEYS.app.footer,
    dialogs: USER_DIALOG_CONTEXT_KEYS,
    popup: APP_CONTEXT_GROUP_KEYS.app.popup,
  }),
});

const USER_CONTEXT_STATIC_VALUES = Object.freeze({
  ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
  ADMIN_REQUEST_TAB,
  AlertCircle,
  AnimatePresence,
  Badge,
  Button,
  Card,
  CardContent,
  CheckCircle2,
  ClipboardList,
  Clock,
  DateInputWithWeekday,
  Info,
  Input,
  LockIcon,
  Pin,
  RENTAL_EXTENSION_APPROVAL_MODE,
  React,
  STATUS,
  Search,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
  UserCircle,
  Users,
  X,
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  getAdjustedRentalDueDate,
  getExtensionRequestAvailableDate,
  getLaptopRentalAvailability,
  getMaxRentalDueDate,
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

export default function useUserContextAssembler({
  dynamicSourceValues,
  hasFirebaseAuthSession,
  isUserDirectoryAccessRestricted,
  userTab,
}) {
  const contextGroups = useStableContextGroups(
    {
      ...USER_CONTEXT_STATIC_VALUES,
      ...dynamicSourceValues,
    },
    USER_CONTEXT_GROUP_KEYS
  );

  return {
    contextGroups,
    userPanelContextKey: getUserPanelContextKey({
      userTab,
      hasFirebaseAuthSession,
      isUserDirectoryAccessRestricted,
    }),
  };
}
