# P2 사용자 대여 신청 컨트롤러 분리 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-user-mypage-account-controller-split-20260730_1421_deployment_package.zip`
- 출력 풀패키지: `rental-system-user-rental-request-controller-split-20260730_1430_deployment_package.zip`
- 작업 범위: 사용자 신규 대여 신청 상태 및 제출 transaction을 `App.jsx`에서 feature controller로 이동
- UI 문구, JSX 구조, className, Firestore Rules, 인덱스 및 데이터 스키마는 변경하지 않음

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/requests/useUserRentalRequestController.js`
- `docs/performance-optimization/diffs/P2_USER_RENTAL_REQUEST_CONTROLLER_FEATURE_SPLIT.diff`
- `docs/performance-optimization/measurements/P2_USER_RENTAL_REQUEST_CONTROLLER_SOURCE_GRAPH_COMPARISON.json`
- `docs/performance-optimization/reports/P2_USER_RENTAL_REQUEST_CONTROLLER_FEATURE_SPLIT_REPORT.md`
- `docs/performance-optimization/validation/P2_USER_RENTAL_REQUEST_CONTROLLER_FEATURE_SPLIT_VALIDATION_REPORT.txt`

### 삭제

- 이번 작업 신규 삭제 파일 없음
- 직전 `package-meta/REMOVED_FILES.txt` 누적 목록을 그대로 승계

## 3. 분리 내용

`useUserRentalRequestState()`가 다음 상태를 소유합니다.

- 대여 신청 폼 `form`
- 선택 기기 ID `selectedLaptopId`
- 제출 로딩 `requestSubmitLoading`
- 중복 제출 방지 ref `requestSubmitInProgressRef`

`useUserRentalRequestController()`가 다음 실행 흐름을 소유합니다.

- 서비스 점검·차단 상태 확인
- Firestore 분리 저장소 준비 상태 확인
- 로그인·권한·회원 상태 확인
- 회원 이메일·성명·부서 완성 여부 확인
- 최신 연체·대여 제한 사전 조회
- 선택 자산과 선택 기간 가용성 검증
- 시작일·반납일·최대 대여기간 검증
- `rentalRequests`, `rentalAvailability`, `rentalAssets.reservations` transaction 저장
- transaction 완료 후 로컬 상태 동기화
- 성공 시 선택 기기 및 신청 폼 초기화
- 경합, 자산 삭제 및 Firebase 오류 메시지 처리

## 4. App.jsx 감소

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 15,946 | 15,499 | -447 |
| 크기 | 460,043 bytes | 447,316 bytes | -12,727 bytes |
| `useState()` | 182 | 179 | -3 |
| `useRef()` | 21 | 20 | -1 |
| `useEffect()` | 59 | 59 | 0 |
| `useMemo()` | 32 | 32 | 0 |
| `runTransaction()` | 10 | 9 | -1 |

신규 컨트롤러는 480줄, 14,874 bytes입니다.

## 5. 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 44 | 45 | +1 |
| 초기 정적 소스 | 783,207 bytes | 785,354 bytes | +2,147 bytes |

이번 단계는 지연 로딩 최적화가 아니라 상태·transaction 책임 분리입니다.

## 6. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 접근 위치 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

Rules, 인덱스, Firebase 설정 및 npm 의존성 파일은 기준본과 동일합니다.

## 7. 기능 보존

- 중복 제출 방지 유지
- 일반회원 로그인 필수 조건 유지
- 관리자 계정의 사용자 대여 신청 차단 유지
- 회원 활성 상태 및 프로필 완성 조건 유지
- 최신 연체·대여 제한 확인 유지
- 동일 기간 자산 경합 검사 유지
- 휴무일 및 최대 대여기간 검증 유지
- 세 문서/필드 transaction 순서 유지
- 성공·실패 안내 문구 유지
- 한국어 문자열 삭제 0건, 추가 0건

## 9. 패키지 메타데이터

- `PACKAGE_FILES.txt`: 284개 프로젝트 파일
- `PACKAGE_SHA256SUMS.txt`: 284개 SHA-256 항목
- `REMOVED_FILES.txt`: 주석 제외 누적 삭제 경로 67개
- 이번 작업 신규 삭제 경로: 0개
- 누적 삭제 목록과 패키지 파일 충돌: 0개

## 10. 다음 기준본

검증된 출력 풀패키지를 다음 순차 작업의 유일한 기준본으로 자동 승계합니다.
