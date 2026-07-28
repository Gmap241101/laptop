import { orderBy, where } from 'firebase/firestore';
import {
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
  STATUS,
  USER_REQUEST_REVIEW_STATUS,
} from '../constants/appConstants.js';

export const getAdminRequestServerConstraints = ({
  requestTab,
  quickFilter,
  referenceDate,
}) => {
  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.OVERDUE) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('dueDate', '<', referenceDate),
      orderBy('dueDate', 'asc'),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.DUE_TODAY) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('dueDate', '==', referenceDate),
      orderBy('createdAt', 'desc'),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.START_TODAY) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('startDate', '==', referenceDate),
      orderBy('createdAt', 'desc'),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.PENDING_USER_ACTION) {
    return [
      where(
        'userActionRequest.status',
        '==',
        USER_REQUEST_REVIEW_STATUS.PENDING
      ),
      orderBy('userActionRequest.requestedAt', 'asc'),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.REQUESTED) {
    return [
      where('status', '==', STATUS.REQUESTED),
      orderBy('createdAt', 'asc'),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.ON_HOLD) {
    return [
      where('status', '==', STATUS.ON_HOLD),
      orderBy('createdAt', 'asc'),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.RESERVED) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('startDate', '>', referenceDate),
      orderBy('startDate', 'asc'),
    ];
  }

  if (requestTab === ADMIN_REQUEST_TAB.PENDING) {
    return [
      where('status', 'in', [STATUS.REQUESTED, STATUS.ON_HOLD]),
      orderBy('createdAt', 'asc'),
    ];
  }

  if (requestTab === ADMIN_REQUEST_TAB.RENTAL) {
    return [
      where('status', '==', STATUS.APPROVED),
      orderBy('createdAt', 'desc'),
    ];
  }

  if (requestTab === ADMIN_REQUEST_TAB.CLOSED) {
    return [
      where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED]),
      orderBy('createdAt', 'desc'),
    ];
  }

  return [
    where('status', '==', STATUS.RETURNED),
    orderBy('createdAt', 'desc'),
  ];
};

export const getAdminRequestCountConstraints = ({
  requestTab,
  quickFilter,
  referenceDate,
}) => {
  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.OVERDUE) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('dueDate', '<', referenceDate),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.DUE_TODAY) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('dueDate', '==', referenceDate),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.START_TODAY) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('startDate', '==', referenceDate),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.PENDING_USER_ACTION) {
    return [
      where(
        'userActionRequest.status',
        '==',
        USER_REQUEST_REVIEW_STATUS.PENDING
      ),
    ];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.REQUESTED) {
    return [where('status', '==', STATUS.REQUESTED)];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.ON_HOLD) {
    return [where('status', '==', STATUS.ON_HOLD)];
  }

  if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.RESERVED) {
    return [
      where('status', '==', STATUS.APPROVED),
      where('startDate', '>', referenceDate),
    ];
  }

  if (requestTab === ADMIN_REQUEST_TAB.PENDING) {
    return [where('status', 'in', [STATUS.REQUESTED, STATUS.ON_HOLD])];
  }

  if (requestTab === ADMIN_REQUEST_TAB.RENTAL) {
    return [where('status', '==', STATUS.APPROVED)];
  }

  if (requestTab === ADMIN_REQUEST_TAB.CLOSED) {
    return [
      where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED]),
    ];
  }

  return [where('status', '==', STATUS.RETURNED)];
};
