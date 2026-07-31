# Firestore 사용량 한도·대시보드·신청 탭 집계·대여 신청 오류 수정 보고서

## 1. 기준본

- 입력 기준본: `rental-system-auth-loading-render-stability-dashboard-fix-20260731_1824_deployment_package.zip`
- 출력 풀패키지: `rental-system-firestore-capacity-dashboard-tab-count-request-fix-20260731_2047_deployment_package.zip`
- 작업 성격: 긴급 회귀·운영 안정화 수정
- `App.jsx` 추가 분리: 없음

## 2. 확인된 공통 원인

세 증상 중 대여 신청 저장 오류가 Firestore `resource-exhausted` 코드로 확인됐다. 같은 시점에 관리자 대시보드 요약 읽기·갱신과 탭 집계도 실패했으므로, 권한 또는 인덱스만의 문제가 아니라 Firestore 사용량 한도 또는 일시적 용량 제한을 우선 판별해야 한다.

기존 코드는 모든 오류를 Rules·인덱스 문제 또는 일반 저장 실패로 표시해 실제 원인을 숨겼고, 대시보드 자동 갱신과 네 개 탭 집계를 계속 재시도할 수 있었다.

## 3. 수정 범위

### 3.1 공용 Firestore 용량 오류 판별기

신규 파일:

`src/utils/firestoreCapacity.js`

기능:

- `resource-exhausted` 코드 및 메시지 정규화
- 브라우저 세션 단위 60초 재시도 차단
- 조회·집계·저장 공통 안내문 생성
- 동일 오류 발생 직후 선택적 집계와 자동 갱신 중단

### 3.2 관리자 대시보드

수정 파일:

`src/hooks/useDashboardSummary.js`

변경 사항:

- 마지막 정상 요약을 `localStorage`에 저장
- Firestore 용량 오류 시 마지막 정상 요약을 계속 표시
- 용량 오류에서 서버 요약 자동 재생성 요청을 중단
- 서버 요약 문서가 없을 때만 한 번 갱신
- 콜백 참조 변화로 요약 listener가 재구독되지 않도록 ref 기반 처리
- 일반 오류와 사용량 한도 오류의 안내문 분리

추가 최적화:

`src/services/dashboardSummaryService.js`

- 자동 stale 갱신 기준: 15분 → 60분
- 다른 관리자 탭에서 돌아올 때마다 강제 갱신하던 동작 제거
- 수동 갱신 버튼은 유지

### 3.3 기기 대여 신청 관리 탭 숫자

수정 파일:

- `src/features/requests/useAdminRequestsController.js`
- `src/admin/AdminRequestsPanel.jsx`
- `src/context/appContextSlices.js`

변경 사항:

- 실시간 집계가 `resource-exhausted`로 실패하면 마지막 대시보드 요약의 `requestTabCounts`를 대체값으로 사용
- 용량 제한 감지 후 60초 동안 네 개 집계 쿼리 재실행 방지
- 대체값이 없는 탭만 `-` 표시
- 일반 쿼리 오류와 사용량 한도 오류 안내 분리
- 탭 숫자 대체값 전달을 위해 관리자 신청 패널 context에 `dashboardSummary` 추가

### 3.4 사용자 대여 신청 저장

수정 파일:

`src/features/requests/useUserRentalRequestController.js`

변경 사항:

- 신청 전 제한 상태 조회와 저장 transaction에서 `resource-exhausted`를 별도 처리
- `오류 코드: resource-exhausted` 대신 실제 의미를 안내
- 다른 화면에서 이미 용량 오류를 감지한 경우 추가 사전 조회·transaction을 60초 동안 중단
- 폼, 선택 기기 및 입력 내용은 유지
- 충돌, 자산 삭제, 일반 Firebase 오류 처리는 기존대로 유지

## 4. 사용자 표시 문구

### 관리자 대시보드

- 용량 제한 + 캐시 있음: 마지막 정상 요약을 표시하며 할당량 초기화 후 갱신 가능하다고 안내
- 용량 제한 + 캐시 없음: 할당량 초기화 또는 결제 사용 설정 확인 안내

### 관리자 신청 탭

- 숫자가 있으면 마지막 대시보드 요약값
- 대체값이 없으면 `-`
- 목록 조회 결과는 그대로 유지

### 사용자 대여 신청

- Firestore 사용량 한도 때문에 현재 저장할 수 없음을 명시
- Rules·인덱스 오류로 오인시키지 않음

## 5. 변경하지 않은 항목

- `rules/firestore.rules`
- `firestore.indexes.json`
- Firebase 문서 구조
- 대여 신청 transaction의 쓰기 대상 3개 문서
- 대여 정책과 충돌 검사
- 사용자·관리자 UI 레이아웃
- `App.jsx`

## 6. 운영상 한계

이미 Firestore 서버의 사용량 한도가 소진된 상태에서는 클라이언트 코드로 서버 쓰기를 우회할 수 없다. 이 패키지는 원인을 정확히 표시하고 불필요한 반복 요청을 차단하며, 캐시·대체값으로 화면을 유지한다. 실제 신규 대여 신청 저장은 할당량이 초기화되거나 프로젝트 결제가 사용 설정된 이후 다시 가능하다.
