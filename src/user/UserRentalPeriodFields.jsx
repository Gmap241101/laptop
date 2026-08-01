import { DateInputWithWeekday } from '../components/CommonUI.jsx';
import {
  getAdjustedRentalDueDate,
  getAdjustedRentalStartDate,
  getMaxRentalDueDate,
  getNonBusinessDayReason,
  getRentalDueDateAdjustmentReason,
  getSafeMaxRentalDays,
  isTemporaryDateInputValue,
} from '../domain/rentalPolicy.js';
import {
  formatDateWithKoreanWeekday,
  today,
} from '../utils/appUtils.js';

export default function UserRentalPeriodFields({
  form,
  setForm,
  settings,
  triggerToast,
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateInputWithWeekday
        label="대여 시작일"
        value={form.startDate}
        min={today()}
        onInvalidDate={() =>
          triggerToast('올바른 날짜를 입력해 주세요.', 'error')
        }
        onChange={(value) => {
          const minStartDate = today();

          if (!value) {
            const nextStartDate = getAdjustedRentalStartDate(
              minStartDate,
              settings
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, settings),
            });

            return nextStartDate;
          }

          if (isTemporaryDateInputValue(value)) {
            setForm({
              ...form,
              startDate: value,
            });

            return value;
          }

          if (value < minStartDate) {
            const nextStartDate = getAdjustedRentalStartDate(
              minStartDate,
              settings
            );

            triggerToast(
              `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, settings),
            });

            return nextStartDate;
          }

          const nextStartDate = getAdjustedRentalStartDate(value, settings);

          if (nextStartDate !== value) {
            const reason = getNonBusinessDayReason(value, settings);

            triggerToast(
              `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. ${formatDateWithKoreanWeekday(nextStartDate)}로 조정되었습니다.`,
              'error'
            );
          }

          setForm({
            ...form,
            startDate: nextStartDate,
            dueDate: getMaxRentalDueDate(nextStartDate, settings),
          });

          return nextStartDate;
        }}
        onDateBlur={(value) => {
          const minStartDate = today();

          if (
            !value ||
            isTemporaryDateInputValue(value) ||
            value < minStartDate
          ) {
            const nextStartDate = getAdjustedRentalStartDate(
              minStartDate,
              settings
            );

            triggerToast(
              `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, settings),
            });

            return nextStartDate;
          }

          const nextStartDate = getAdjustedRentalStartDate(value, settings);

          if (nextStartDate !== value) {
            const reason = getNonBusinessDayReason(value, settings);

            triggerToast(
              `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. ${formatDateWithKoreanWeekday(nextStartDate)}로 조정되었습니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, settings),
            });

            return nextStartDate;
          }

          setForm({
            ...form,
            startDate: nextStartDate,
            dueDate: getMaxRentalDueDate(nextStartDate, settings),
          });

          return nextStartDate;
        }}
      />

      <DateInputWithWeekday
        label="반납 예정일"
        value={form.dueDate}
        min={form.startDate}
        max={getMaxRentalDueDate(form.startDate, settings)}
        onInvalidDate={() =>
          triggerToast('올바른 날짜를 입력해 주세요.', 'error')
        }
        onChange={(value) => {
          const minDueDate = form.startDate;
          const maxDueDate = getMaxRentalDueDate(form.startDate, settings);
          const maxRentalDays = getSafeMaxRentalDays(settings);
          let nextDueDate = value;

          if (!nextDueDate) {
            const adjustedMinDueDate = getAdjustedRentalDueDate(
              minDueDate,
              settings
            );

            setForm({ ...form, dueDate: adjustedMinDueDate });
            return adjustedMinDueDate;
          }

          if (isTemporaryDateInputValue(nextDueDate)) {
            setForm({ ...form, dueDate: nextDueDate });
            return nextDueDate;
          }

          if (nextDueDate < minDueDate) {
            triggerToast(
              `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(minDueDate)}입니다.`,
              'error'
            );

            nextDueDate = minDueDate;
          }

          if (nextDueDate > maxDueDate) {
            triggerToast(
              `대여 가능 기간은 대여 시작일 다음 날부터 최대 ${maxRentalDays}일이며 달력 기준으로 계산됩니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxDueDate)}까지 선택할 수 있습니다.`,
              'error'
            );

            nextDueDate = maxDueDate;
          }

          const adjustedDueDate = getAdjustedRentalDueDate(
            nextDueDate,
            settings
          );

          if (adjustedDueDate !== nextDueDate) {
            const adjustmentReason = getRentalDueDateAdjustmentReason(
              nextDueDate,
              settings
            );
            const finalDueDate =
              adjustedDueDate > maxDueDate ? maxDueDate : adjustedDueDate;

            triggerToast(
              `선택한 반납 예정일이 ${adjustmentReason || '휴무일'}이므로 다음 영업일인 ${formatDateWithKoreanWeekday(finalDueDate)}로 자동 조정되었습니다.`,
              'success'
            );

            nextDueDate = finalDueDate;
          }

          setForm({ ...form, dueDate: nextDueDate });

          return nextDueDate;
        }}
        onDateBlur={(value) => {
          const minDueDate = form.startDate;
          const maxDueDate = getMaxRentalDueDate(form.startDate, settings);
          const maxRentalDays = getSafeMaxRentalDays(settings);
          let nextDueDate = value;

          if (
            !nextDueDate ||
            isTemporaryDateInputValue(nextDueDate) ||
            nextDueDate < minDueDate
          ) {
            const adjustedMinDueDate = getAdjustedRentalDueDate(
              minDueDate,
              settings
            );

            triggerToast(
              `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(adjustedMinDueDate)}입니다.`,
              'error'
            );

            setForm({ ...form, dueDate: adjustedMinDueDate });

            return adjustedMinDueDate;
          }

          if (nextDueDate > maxDueDate) {
            triggerToast(
              `대여 가능 기간은 대여 시작일 다음 날부터 최대 ${maxRentalDays}일이며 달력 기준으로 계산됩니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxDueDate)}까지 선택할 수 있습니다.`,
              'error'
            );

            setForm({ ...form, dueDate: maxDueDate });

            return maxDueDate;
          }

          const adjustedDueDate = getAdjustedRentalDueDate(
            nextDueDate,
            settings
          );

          if (adjustedDueDate !== nextDueDate) {
            const adjustmentReason = getRentalDueDateAdjustmentReason(
              nextDueDate,
              settings
            );
            const finalDueDate =
              adjustedDueDate > maxDueDate ? maxDueDate : adjustedDueDate;

            triggerToast(
              `선택한 반납 예정일이 ${adjustmentReason || '휴무일'}이므로 다음 영업일인 ${formatDateWithKoreanWeekday(finalDueDate)}로 자동 조정되었습니다.`,
              'success'
            );

            setForm({ ...form, dueDate: finalDueDate });

            return finalDueDate;
          }

          setForm({ ...form, dueDate: nextDueDate });

          return nextDueDate;
        }}
      />
    </div>
  );
}
