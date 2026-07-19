export default function AdminDashboardPanel({ ctx }) {

  return (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">관리자 대시보드 및 지침</h2>
                        <p className="text-xs text-slate-500 mt-1">
                          본 서비스는 Firebase Firestore 원격 DB를 기준으로 데이터를 동기화합니다.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">주요 프로세스 매칭 규정</h4>
                          <ul className="mt-3 space-y-2 text-xs text-slate-600 list-disc pl-4">
                            <li>시스템 설정에 따라 기기 상태 기준 또는 선택 기간 기준으로 신청 가능 여부를 판단합니다.</li>
                            <li>승인된 미래 신청은 &apos;예약중&apos;, 대여 시작일이 도래한 승인 신청은 &apos;대여중&apos;으로 표시됩니다.</li>
                            <li>신청중, 예약중, 대여중, 보류 상태는 신청 가능 여부 판단에 반영되며, 불허와 반납완료는 충돌 판단에서 제외됩니다.</li>
                          </ul>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 text-blue-800">
                          <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">외부 서버 통합 시 권장 개발 기술</h4>
                          <p className="mt-3 text-xs leading-relaxed text-blue-700">
                            상용 통합 배포 시, 본 프로토타입의 데이터 구조를 활용하여 Firebase Firestore, Postgres DB 등을 바인딩하고 알림톡/메일 API 서비스와 연계하여 통합 사내망 알림을 설계할 수 있습니다.
                          </p>
                        </div>
                      </div>
                    </div>
  );
}
