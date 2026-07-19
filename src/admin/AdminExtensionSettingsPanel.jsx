export default function AdminExtensionSettingsPanel({ ctx }) {
  const {
    Button,
    OVERDUE_PENALTY_MODE,
    RENTAL_EXTENSION_APPROVAL_MODE,
    Save,
    data,
    saveSystemSettings,
    setTempSettings,
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
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">
          대여 정책 관리
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          대여 연장과 연체자의 신규 대여 제한 및 반납 후 페널티 정책을 통합 관리합니다.
        </p>
      </div>

      <section className="space-y-5">
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
                <span className="text-xs font-semibold text-slate-500">영업일</span>
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

      <div className="flex justify-end gap-2.5 border-t border-slate-200/60 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setTempSettings(data.settings);
            triggerToast(
              '대여 정책 변경사항이 취소되고 이전 상태로 복원되었습니다.',
              'success'
            );
          }}
        >
          취소
        </Button>

        <Button
          variant="primary"
          onClick={saveSystemSettings}
        >
          <Save size={14} />
          변경사항 저장
        </Button>
      </div>
    </div>
  );
}
