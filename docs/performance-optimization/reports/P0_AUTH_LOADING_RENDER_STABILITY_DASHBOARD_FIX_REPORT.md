# 인증·화면 로딩 안정화 및 관리자 대시보드 조회 수정 보고서

## 기준본

- 입력: `rental-system-auth-identity-policy-subscription-controller-split-20260731_1744_deployment_package.zip`
- 출력: `rental-system-auth-loading-render-stability-dashboard-fix-20260731_1824_deployment_package.zip`

## 증상과 원인

### 신청내역 화면 깜빡임

`useOwnRentalRequestsSubscriptionController()`의 구독 effect가 `triggerToast` 함수 참조를 의존성으로 사용하고 있었습니다. `App.jsx`가 렌더링될 때마다 새 함수가 만들어지면서 구독이 해제·재생성되고, 그때마다 `rentalRequestsReady`가 `false`로 돌아가 로딩 화면과 신청내역 화면이 반복 전환될 수 있었습니다.

### 비로그인 메뉴 첫 클릭 후 로딩 화면 고정

로그인·회원가입·공지사항·FAQ 패널이 최초 클릭 시 동적 import를 시작하는 구조였습니다. 인증·구독 상태가 반복 갱신되는 상황과 겹치면 Suspense fallback이 장시간 유지될 수 있었습니다.

### 관리자 대시보드 요약 갱신 실패

대기 회원 미리보기 조회가 `status == pending`과 `createdAt orderBy`를 함께 사용해 환경에 따라 복합 인덱스가 필요했습니다. 또한 관리자 세션 ID만 확인하고 실제 Firebase Auth UID 일치 여부가 완전히 확정되기 전에 요약 구독·갱신이 시작될 여지가 있었습니다.

## 수정 내용

1. `triggerToast`와 `triggerConfirm`을 `useCallback`으로 안정화했습니다.
2. 사용자 본인 신청내역 구독은 toast를 ref로 참조하고, 이전 계정 UID 배열은 정렬된 문자열 키로 비교합니다.
3. 회원 프로필 구독 의존성을 Firebase UID·표시명·관리자 ID 등 원시값으로 축소했습니다.
4. 사용자 lazy 패널은 유지하되 첫 pointer 입력 또는 브라우저 idle 시점에 미리 로드합니다.
5. 로그인 상태가 형성되면 대여신청·신청내역·마이페이지 패널도 백그라운드 사전 로드합니다.
6. 관리자 대시보드 요약은 `isAdminAuthenticated` 및 Firebase UID와 관리자 문서 ID 일치가 확인된 뒤에만 시작합니다.
7. 대기 회원 조회는 `where(status == pending) + limit(100)`으로 변경하고 브라우저에서 생성일 순으로 정렬한 뒤 12개만 사용합니다. 복합 인덱스 의존성을 제거했습니다.

## 기능 영향

- 신청내역 Firestore 쿼리 조건과 문서 병합 방식은 유지됩니다.
- 사용자 패널의 code splitting은 유지됩니다.
- 대시보드 대기 회원 전체 건수는 기존 `getCountFromServer()`를 계속 사용하므로 정확한 전체 건수는 유지됩니다.
- 대기 회원 미리보기는 최대 100개 후보를 생성일 순으로 정렬하여 12개를 표시합니다.
- Firestore Rules, 인덱스, 컬렉션 구조는 변경하지 않았습니다.
