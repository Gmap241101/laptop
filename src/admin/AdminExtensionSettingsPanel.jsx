export default function AdminExtensionSettingsPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    DEFAULT_EXCLUDE_SATURDAYS,
    DEFAULT_EXCLUDE_SUNDAYS,
    DEFAULT_WORK_END_TIME,
    OVERDUE_PENALTY_MODE,
    RENTAL_EXTENSION_APPROVAL_MODE,
    Save,
    data,
    getKoreaNow,
    handleAdminTabChange,
    saveSystemSettings,
    setTempSettings,
    tempAllowNonOverlappingSameAssetRequests,
    tempBusinessDayAdjustmentEnabled,
    tempSettings,
    triggerToast,
  } = ctx;

  const extensionEnabled =
    tempSettings.rentalExtensionEnabled === true;

  const approvalMode =
    tempSettings.rentalExtensionApprovalMode ===
    RENTAL_EXTENSION_APPROVAL_MODE.AUTO
      ? RENTAL_EXTENSION_APPROVAL_MODE.AUTO
      : RENTAL_EXTENSION_APPROVAL_MODE.MANUAL;

  const overdueBlockEnabled =
    tempSettings.overdueRentalBlockEnabled === true;

  const postPenaltyEnabled =
    tempSettings.postOverduePenaltyEnabled === true;

  const penaltyMode =
    tempSettings.overduePenaltyMode ===
    OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      ? OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      : OVERDUE_PENALTY_MODE.FIXED_PER_ASSET;

  const updateSetting = (key, value) => {
    setTempSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const Toggle = ({
    label,
    description,
    checked,
    onChange,
    ariaLabel,
  }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {label}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        </div>

        <button
          type="button"
          aria-label={ariaLabel}
          aria-pressed={checked}
          onClick={onChange}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
            checked
              ? 'mk-brand-gradient-r border-transparent'
              : 'border-slate-300 bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="대여 정책 관리"
        description="기본 대여 기간, 예약 충돌, 시작·반납일, 연장 및 연체자 정책을 관리합니다. 휴일 데이터는 독립된 휴일 관리 메뉴에서 관리합니다."
      />

      <section className="space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            기본 대여 정책
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            최초 대여의 최대 기간과 동일 기기 추가 신청 허용 기준을 설정합니다.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className="block max-w-md">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              기본 최장 허용 대여 기간
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={tempSettings.maxRentalDays ?? 14}
                onChange={(event) =>
                  updateSetting('maxRentalDays', Number(event.target.value))
                }
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
              />
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                일(달력 기준)
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              대여 시작일을 1일차로 포함합니다. 계산된 마지막 날이 설정된 휴무 요일 또는 등록 휴일이면 다음 영업일로 자동 조정됩니다.
            </p>
          </label>
        </div>

        <Toggle
          label="기간이 겹치지 않으면 동일 기기 신청 허용"
          description="켜면 같은 기기라도 기존 신청·예약·대여 기간과 겹치지 않는 경우 추가 신청을 허용합니다."
          checked={tempAllowNonOverlappingSameAssetRequests}
          ariaLabel="기간이 겹치지 않으면 동일 기기 신청 허용"
          onChange={() =>
            updateSetting(
              'allowNonOverlappingSameAssetRequests',
              !tempAllowNonOverlappingSameAssetRequests
            )
          }
        />
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            대여 일정 정책
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            업무 종료 이후와 휴무일의 대여 시작일 처리 기준을 설정합니다.
          </p>
        </div>

        <Toggle
          label="업무 종료 이후 대여 시작일 다음 영업일 조정"
          description="켜면 설정한 업무 종료 시간 이후 신청할 때 다음 날부터 대여 시작 가능일을 계산합니다. 아래 휴무 요일과 등록 휴일은 시작·반납·연장 계산에 공통 적용됩니다."
          checked={tempBusinessDayAdjustmentEnabled}
          ariaLabel="대여 시작일 다음 영업일 자동 조정 여부"
          onChange={() => {
            const nextValue = !tempBusinessDayAdjustmentEnabled;

            setTempSettings((prev) => ({
              ...prev,
              adjustStartDateAfterWorkEnd: nextValue,
              adjustStartDateToNextBusinessDay: nextValue,
            }));
          }}
        />

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                업무 종료 시간
              </span>
              <input
                type="time"
                value={tempSettings.workEndTime || DEFAULT_WORK_END_TIME}
                disabled={!tempBusinessDayAdjustmentEnabled}
                onChange={(event) =>
                  updateSetting(
                    'workEndTime',
                    event.target.value || DEFAULT_WORK_END_TIME
                  )
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-medium text-slate-600">
                  토요일 휴무
                </span>
                <input
                  type="checkbox"
                  checked={
                    tempSettings.excludeSaturdays ??
                    tempSettings.excludeWeekendsForStartDate ??
                    DEFAULT_EXCLUDE_SATURDAYS
                  }
                  onChange={(event) =>
                    updateSetting('excludeSaturdays', event.target.checked)
                  }
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-medium text-slate-600">
                  일요일 휴무
                </span>
                <input
                  type="checkbox"
                  checked={
                    tempSettings.excludeSundays ??
                    tempSettings.excludeWeekendsForStartDate ??
                    DEFAULT_EXCLUDE_SUNDAYS
                  }
                  onChange={(event) =>
                    updateSetting('excludeSundays', event.target.checked)
                  }
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-medium text-slate-600">
                  등록된 휴일 휴무
                </span>
                <input
                  type="checkbox"
                  checked={
                    tempSettings.excludeHolidaysForStartDate ??
                    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE
                  }
                  onChange={(event) =>
                    updateSetting(
                      'excludeHolidaysForStartDate',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4"
                />
              </label>
            </div>
          </div>

          <p className="text-[11px] leading-5 text-slate-500">
            휴무로 설정된 요일과 활성화된 등록 휴일은 대여 시작일, 반납 예정일 및 연장 영업일 계산에 공통 적용됩니다. 토요일 또는 일요일을 영업일로 운영하려면 해당 항목을 해제하세요.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-blue-900">등록 휴일</div>
            <p className="mt-1 text-[11px] leading-5 text-blue-700">
              {getKoreaNow().getUTCFullYear()}년 기준 등록 휴일은 {(data.settings.holidays || []).filter((holiday) => String(holiday.date || '').slice(0, 4) === String(getKoreaNow().getUTCFullYear())).length}일입니다. 날짜별 휴일 사유와 월간 달력은 휴일 관리 메뉴에서 편집합니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleAdminTabChange('holidaySettings')}
            className="shrink-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
          >
            휴일 관리로 이동
          </Button>
        </div>
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            대여 연장 관리
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            기존 대여 연장 허용 여부, 승인 방식, 횟수와 기간을 설정합니다.
          </p>
        </div>

        <Toggle
          label="대여 연장 허용"
          description="끄면 사용자가 연장 요청을 생성할 수 없습니다."
          checked={extensionEnabled}
          ariaLabel="대여 연장 허용 여부"
          onChange={() =>
            updateSetting(
              'rentalExtensionEnabled',
              !extensionEnabled
            )
          }
        />

        <div
          className={`space-y-5 rounded-2xl border p-5 transition ${
            extensionEnabled
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-50 opacity-60'
          }`}
        >
          <div>
            <div className="text-sm font-bold text-slate-900">
              연장 처리 방식
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              관리자 승인형은 신청 관리 화면에서 처리하고, 자동 승인형은 조건을 통과한 요청을 즉시 승인합니다.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: RENTAL_EXTENSION_APPROVAL_MODE.MANUAL,
                  title: '관리자 승인형',
                  description: '관리자가 일정 충돌을 확인한 뒤 승인 또는 불허합니다.',
                },
                {
                  value: RENTAL_EXTENSION_APPROVAL_MODE.AUTO,
                  title: '조건 충족 시 자동 승인형',
                  description: '횟수·신청 가능일·예약 충돌 조건을 통과하면 즉시 연장합니다.',
                },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  disabled={!extensionEnabled}
                  onClick={() =>
                    updateSetting(
                      'rentalExtensionApprovalMode',
                      option.value
                    )
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
                    approvalMode === option.value
                      ? 'border-orange-400 bg-orange-50 text-orange-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'
                  }`}
                >
                  <div className="text-xs font-bold">
                    {option.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-4">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                최대 연장 가능 횟수
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  disabled={!extensionEnabled}
                  value={tempSettings.rentalExtensionMaxCount ?? 1}
                  onChange={(event) =>
                    updateSetting(
                      'rentalExtensionMaxCount',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">회</span>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                회당 연장 가능 기간
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  disabled={!extensionEnabled}
                  value={tempSettings.rentalExtensionBusinessDays ?? 5}
                  onChange={(event) =>
                    updateSetting(
                      'rentalExtensionBusinessDays',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">
                  영업일
                </span>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                연장 신청 대기일
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={!extensionEnabled}
                  value={tempSettings.rentalExtensionRequestWaitDays ?? 7}
                  onChange={(event) =>
                    updateSetting(
                      'rentalExtensionRequestWaitDays',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">일</span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            연체자 관리
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            현재 연체 중인 사용자의 신규 신청 제한과 모든 연체 기기 반납 후 추가 페널티를 설정합니다.
          </p>
        </div>

        <Toggle
          label="연체 중 신규 대여 제한"
          description="켜면 반납예정일이 지난 미반납 기기가 한 대라도 있는 사용자는 모든 연체 기기를 반납할 때까지 신규 신청할 수 없습니다."
          checked={overdueBlockEnabled}
          ariaLabel="연체 중 신규 대여 제한 여부"
          onChange={() =>
            updateSetting(
              'overdueRentalBlockEnabled',
              !overdueBlockEnabled
            )
          }
        />

        <Toggle
          label="연체 반납 후 추가 대여 제한"
          description="켜면 마지막 연체 기기를 반납한 다음 날부터 계산된 기간 동안 신규 대여를 제한합니다."
          checked={postPenaltyEnabled}
          ariaLabel="연체 반납 후 추가 대여 제한 여부"
          onChange={() =>
            updateSetting(
              'postOverduePenaltyEnabled',
              !postPenaltyEnabled
            )
          }
        />

        <div
          className={`space-y-5 rounded-2xl border p-5 transition ${
            postPenaltyEnabled
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-50 opacity-60'
          }`}
        >
          <div>
            <div className="text-sm font-bold text-slate-900">
              페널티 계산 방식
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              두 방식 모두 주말과 공휴일을 포함한 달력 기준 일수를 사용합니다.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label
              className={`rounded-xl border p-4 transition ${
                penaltyMode === OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="overduePenaltyMode"
                  disabled={!postPenaltyEnabled}
                  checked={
                    penaltyMode ===
                    OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                  }
                  onChange={() =>
                    updateSetting(
                      'overduePenaltyMode',
                      OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                    )
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900">
                    기기당 고정 기간
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    연체한 기기 수에 기기당 설정 일수를 곱합니다.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-600">기기 1대당</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={
                        !postPenaltyEnabled ||
                        penaltyMode !==
                          OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                      }
                      value={tempSettings.overdueFixedDaysPerAsset ?? 1}
                      onChange={(event) =>
                        updateSetting(
                          'overdueFixedDaysPerAsset',
                          Number(event.target.value)
                        )
                      }
                      className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <span className="text-xs font-semibold text-slate-500">일</span>
                  </div>
                </div>
              </div>
            </label>

            <label
              className={`rounded-xl border p-4 transition ${
                penaltyMode ===
                OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="overduePenaltyMode"
                  disabled={!postPenaltyEnabled}
                  checked={
                    penaltyMode ===
                    OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                  }
                  onChange={() =>
                    updateSetting(
                      'overduePenaltyMode',
                      OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                    )
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900">
                    연체일수 배수
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    각 기기의 실제 연체일수 합계에 설정 배수를 곱합니다.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-600">연체일수의</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={
                        !postPenaltyEnabled ||
                        penaltyMode !==
                          OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                      }
                      value={tempSettings.overdueDayMultiplier ?? 1}
                      onChange={(event) =>
                        updateSetting(
                          'overdueDayMultiplier',
                          Number(event.target.value)
                        )
                      }
                      className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <span className="text-xs font-semibold text-slate-500">배</span>
                  </div>
                </div>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] leading-5 text-blue-800">
            여러 연체 기기를 서로 다른 날 반납하면 각 기기의 실제 반납일까지 연체일수를 계산합니다. 예를 들어 3일 연체 후 반납한 기기와, 당시 5일 연체였다가 3일 뒤 반납한 기기는 3일 + 8일 = 총 11일로 계산합니다. 페널티는 마지막 연체 기기를 반납한 다음 날부터 시작합니다.
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200/60 pt-4 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setTempSettings(data.settings);
            triggerToast(
              '대여 정책 변경사항이 취소되고 이전 상태로 복원되었습니다.',
              'success'
            );
          }}
          className="w-full sm:w-auto"
        >
          취소
        </Button>

        <Button
          variant="primary"
          onClick={saveSystemSettings}
          className="w-full sm:w-auto"
        >
          <Save size={14} />
          변경사항 저장
        </Button>
      </div>
    </div>
  );
}
