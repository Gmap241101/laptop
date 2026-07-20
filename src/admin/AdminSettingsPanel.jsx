export default function AdminSettingsPanel({ ctx }) {
  const {
    Button,
    CheckCircle2,
    Save,
    data,
    finalizeSplitStorageMigration,
    isSplitStorageReady,
    splitStorageFinalizeLoading,
    triggerConfirm,
  } = ctx;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">시스템 관리</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Firestore 저장 구조와 시스템 전환 상태를 확인합니다. 대여 기간·휴일·연장·연체 정책은 좌측의 대여 정책 관리에서 설정합니다.
        </p>
      </div>

      {isSplitStorageReady ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-emerald-600"
            />
            <div>
              <h3 className="text-sm font-bold text-emerald-900">
                Firestore 분리 저장소 전환 완료
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-emerald-800">
                현재 서비스는 rentalSystem/publicConfig, rentalAssets,
                rentalAvailability, rentalBorrowers, rentalRequests 컬렉션을
                직접 사용합니다. laptopRentalDashboard/main은 더 이상 읽거나
                저장하지 않습니다.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Firestore 분리 저장소 최종 전환
              </h3>

              <p className="mt-1 text-[11px] leading-5 text-amber-800">
                1차 복사된 자산과 진행 중 예약을 검증하고, 자산별 예약 잠금
                데이터와 자산관리번호 중복 방지 레지스트리를 생성합니다.
                완료 전에는 신청 및 관리자 데이터 변경이 차단됩니다.
              </p>

              <div className="mt-2 text-[11px] text-amber-700">
                검증 대상: 자산 {data.laptops.length}건 · 진행 중 예약{' '}
                {data.requests.length}건 · 대여자 {data.borrowers.length}건
              </div>
            </div>

            <Button
              variant="outline"
              disabled={splitStorageFinalizeLoading}
              onClick={() => {
                triggerConfirm(
                  'Firestore 분리 저장소 최종 전환',
                  '신규 컬렉션 데이터를 최종 검증하고 자산별 예약 잠금 및 자산관리번호 레지스트리를 생성합니다. 현재 시스템 운영이 중지된 상태에서 한 번만 실행하세요. 계속하시겠습니까?',
                  finalizeSplitStorageMigration
                );
              }}
              className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
            >
              <Save size={14} />
              {splitStorageFinalizeLoading
                ? '최종 전환 중'
                : '분리 저장소 최종 전환'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
