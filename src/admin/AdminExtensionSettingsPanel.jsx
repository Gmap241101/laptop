export default function AdminExtensionSettingsPanel({ ctx }) {
  const {
    Button,
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

  const updateExtensionSetting = (key, value) => {
    setTempSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">
          대여 연장 관리
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          대여 연장 허용 여부, 승인 방식, 최대 횟수와 연장 기간 및 재신청 대기일을 설정합니다.
        </p>
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">
                대여 연장 허용
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                끄면 사용자가 연장 요청을 눌러도 요청을 생성하지 않고 연장 불가 안내만 표시합니다.
              </p>
            </div>

            <button
              type="button"
              aria-label="대여 연장 허용 여부"
              aria-pressed={extensionEnabled}
              onClick={() =>
                updateExtensionSetting(
                  'rentalExtensionEnabled',
                  !extensionEnabled
                )
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                extensionEnabled
                  ? 'mk-brand-gradient-r border-transparent'
                  : 'border-slate-300 bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${
                  extensionEnabled
                    ? 'translate-x-6'
                    : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

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
              관리자 승인형은 신청 관리 화면에서 승인·불허하며, 자동 승인형은 모든 조건을 통과한 요청을 즉시 승인합니다.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!extensionEnabled}
                onClick={() =>
                  updateExtensionSetting(
                    'rentalExtensionApprovalMode',
                    RENTAL_EXTENSION_APPROVAL_MODE.MANUAL
                  )
                }
                className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
                  approvalMode ===
                  RENTAL_EXTENSION_APPROVAL_MODE.MANUAL
                    ? 'border-orange-400 bg-orange-50 text-orange-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'
                }`}
              >
                <div className="text-xs font-bold">관리자 승인형</div>
                <div className="mt-1 text-[11px] leading-4">
                  요청 접수 후 관리자가 일정 충돌을 다시 확인하고 승인 또는 불허합니다.
                </div>
              </button>

              <button
                type="button"
                disabled={!extensionEnabled}
                onClick={() =>
                  updateExtensionSetting(
                    'rentalExtensionApprovalMode',
                    RENTAL_EXTENSION_APPROVAL_MODE.AUTO
                  )
                }
                className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
                  approvalMode ===
                  RENTAL_EXTENSION_APPROVAL_MODE.AUTO
                    ? 'border-orange-400 bg-orange-50 text-orange-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'
                }`}
              >
                <div className="text-xs font-bold">조건 충족 시 자동 승인형</div>
                <div className="mt-1 text-[11px] leading-4">
                  횟수·신청 가능일·다른 예약 충돌 조건을 통과하면 즉시 연장합니다.
                </div>
              </button>
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
                  value={
                    tempSettings.rentalExtensionMaxCount ?? 1
                  }
                  onChange={(event) =>
                    updateExtensionSetting(
                      'rentalExtensionMaxCount',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">
                  회
                </span>
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
                  value={
                    tempSettings.rentalExtensionBusinessDays ?? 5
                  }
                  onChange={(event) =>
                    updateExtensionSetting(
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
                  value={
                    tempSettings.rentalExtensionRequestWaitDays ?? 7
                  }
                  onChange={(event) =>
                    updateExtensionSetting(
                      'rentalExtensionRequestWaitDays',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">
                  일
                </span>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] leading-5 text-blue-800">
            최초 연장 신청 가능일은 대여 시작일에 대기일을 더해 계산합니다. 연장이 승인되면 승인일부터 같은 대기일을 다시 계산하며, 이 대기일에는 주말과 휴일도 포함됩니다. 실제 연장 기간은 현재 반납예정일 다음 영업일부터 시작하고 회당 설정된 영업일만큼 자동 계산됩니다.
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-slate-200/60 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setTempSettings(data.settings);
            triggerToast(
              '대여 연장 설정 변경사항이 취소되고 이전 상태로 복원되었습니다.',
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
