import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';

import {
  Button,
  DateInputWithWeekday,
} from '../components/CommonUI.jsx';
import {
  getAdjustedRentalDueDate,
  getRentalDueDateAdjustmentReason,
} from '../domain/rentalPolicy.js';
import { formatDateWithKoreanWeekday } from '../utils/appUtils.js';

export default function AdminRequestDialogs({
  adminRequestEditDialog,
  adminRequestEditForm,
  adminRequestEditSaving,
  adminRequestRestoreDialog,
  adminRequestRestoreReason,
  adminRequestRestoreSaving,
  adminRequestRestoreTarget,
  closeAdminRequestEditDialog,
  closeAdminRequestRestoreDialog,
  restoreAdminRequestStatus,
  saveAdminRequestEdit,
  setAdminRequestEditForm,
  setAdminRequestRestoreReason,
  setAdminRequestRestoreTarget,
  settings,
  triggerToast,
}) {
  return (
    <>
      {adminRequestEditDialog && (
        <ModalPortal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  대여 신청정보 수정
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  관리자 수정에는 기본 최대 대여 기간 제한을 적용하지 않습니다. 반납 예정일이 휴무일이면 다음 영업일로 자동 조정됩니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdminRequestEditDialog}
                disabled={adminRequestEditSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold text-slate-500">
                    부서 / 팀
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {adminRequestEditForm.team || '-'}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold text-slate-500">
                    신청자
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {adminRequestEditForm.borrower || '-'}
                  </div>
                </div>
              </div>

              <p className="text-[11px] leading-5 text-slate-500">
                신청자와 부서는 로그인 계정 정보이므로 이 화면에서 변경할 수 없습니다. 회원 정보 변경은 회원 계정 관리에서 처리해 주세요.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateInputWithWeekday
                  label="대여 시작일"
                  value={adminRequestEditForm.startDate}
                  onChange={(value) => {
                    setAdminRequestEditForm((previousForm) => {
                      const candidateDueDate =
                        previousForm.dueDate < value
                          ? value
                          : previousForm.dueDate;
                      const adjustedDueDate = getAdjustedRentalDueDate(
                        candidateDueDate,
                        settings
                      );

                      return {
                        ...previousForm,
                        startDate: value,
                        dueDate: adjustedDueDate,
                      };
                    });
                  }}
                />

                <DateInputWithWeekday
                  label="반납 예정일"
                  value={adminRequestEditForm.dueDate}
                  min={adminRequestEditForm.startDate}
                  onChange={(value) => {
                    const adjustedDueDate = getAdjustedRentalDueDate(
                      value,
                      settings
                    );

                    if (adjustedDueDate !== value) {
                      const reason = getRentalDueDateAdjustmentReason(
                        value,
                        settings
                      );

                      triggerToast(
                        `선택한 반납 예정일이 ${reason || '휴무일'}이므로 다음 영업일인 ${formatDateWithKoreanWeekday(adjustedDueDate)}로 자동 조정되었습니다.`,
                        'success'
                      );
                    }

                    setAdminRequestEditForm((previousForm) => ({
                      ...previousForm,
                      dueDate: adjustedDueDate,
                    }));
                  }}
                />
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  대여 목적
                </span>
                <textarea
                  value={adminRequestEditForm.purpose}
                  onChange={(event) =>
                    setAdminRequestEditForm((previousForm) => ({
                      ...previousForm,
                      purpose: event.target.value,
                    }))
                  }
                  className="h-28 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  관리자 메모
                </span>
                <textarea
                  value={adminRequestEditForm.adminMemo}
                  onChange={(event) =>
                    setAdminRequestEditForm((previousForm) => ({
                      ...previousForm,
                      adminMemo: event.target.value,
                    }))
                  }
                  className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adminRequestEditSaving}
                onClick={closeAdminRequestEditDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={adminRequestEditSaving}
                onClick={saveAdminRequestEdit}
              >
                {adminRequestEditSaving ? '저장 중...' : '수정 저장'}
              </Button>
            </div>
          </motion.div>
        </ModalPortal>
      )}

      {adminRequestRestoreDialog && (
        <ModalPortal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  신청 상태 되돌리기
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  활성 상태로 복구할 때 자산 예약 정보를 다시 생성하고 다른 예약과의 충돌을 검사합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdminRequestRestoreDialog}
                disabled={adminRequestRestoreSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  복구할 상태
                </span>
                <select
                  value={adminRequestRestoreTarget}
                  onChange={(event) =>
                    setAdminRequestRestoreTarget(event.target.value)
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
                >
                  {(adminRequestRestoreDialog.targetOptions || []).map(
                    (status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  복구 사유
                </span>
                <textarea
                  value={adminRequestRestoreReason}
                  onChange={(event) =>
                    setAdminRequestRestoreReason(event.target.value)
                  }
                  placeholder="잘못 처리한 이유와 복구가 필요한 사유를 입력해 주세요."
                  className="h-28 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                관리자 복구에는 기본 최대 대여 기간 제한을 적용하지 않습니다. 다만 날짜 순서 오류와 동일 기기의 다른 활성 예약 충돌은 차단됩니다.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adminRequestRestoreSaving}
                onClick={closeAdminRequestRestoreDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={adminRequestRestoreSaving}
                onClick={restoreAdminRequestStatus}
              >
                {adminRequestRestoreSaving ? '복구 중...' : '상태 복구'}
              </Button>
            </div>
          </motion.div>
        </ModalPortal>
      )}
    </>
  );
}
