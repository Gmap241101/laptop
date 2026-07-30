# P2 사용자 회원가입 컨트롤러 분리 보고서

- 작업일시: 2026-07-30 14:00 KST
- 입력 기준본: `rental-system-user-login-controller-split-20260730_1256_deployment_package.zip`
- 작업 범위: `App.jsx`에 남아 있던 사용자 회원가입 화면 이동, 취소, 제출, Firebase Auth 생성, Firestore 트랜잭션, 실패 롤백 흐름을 전용 feature controller로 이동
- 기능 정책 변경: 없음
- Firestore Rules/인덱스 변경: 없음

## 변경 파일

### 수정

- `src/App.jsx`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/auth/useUserSignupController.js`
- `docs/performance-optimization/diffs/P2_USER_SIGNUP_CONTROLLER_FEATURE_SPLIT.diff`
- `docs/performance-optimization/measurements/P2_USER_SIGNUP_CONTROLLER_SOURCE_GRAPH_COMPARISON.json`
- `docs/performance-optimization/reports/P2_USER_SIGNUP_CONTROLLER_FEATURE_SPLIT_REPORT.md`
- `docs/performance-optimization/validation/P2_USER_SIGNUP_CONTROLLER_FEATURE_SPLIT_VALIDATION_REPORT.txt`

### 삭제

- 이번 작업 신규 삭제 없음
- 직전 기준본의 `package-meta/REMOVED_FILES.txt` 누적 67개를 그대로 승계

## 분리된 책임

`useUserSignupController.js`가 다음 기능을 소유한다.

- 회원가입 화면 이동 및 보호 화면 복귀 대상 저장
- 회원가입 취소 및 로그인 화면 복귀
- 이메일, 비밀번호, 이름, 부서/팀, 국내 연락처 검증
- 필수 회원가입 약관 제출 상태 검증
- 서비스 점검/회원가입 차단 정책 확인
- 보조 Firebase Auth 인스턴스의 계정 생성
- 회원 명부 사전 확인
- 회원 식별 claim, userAccounts, 약관 동의 상태/로그, 계정 복구키를 단일 Firestore transaction으로 저장
- 자동 승인 또는 승인 대기 상태 결정
- 자동 승인 회원의 기본 Firebase Auth 로그인 및 사용자 세션 생성
- 저장 실패 시 생성된 Firebase Auth 계정 삭제와 보조 Auth 정리
- 실패 후 비밀번호 입력만 초기화하고 사용자 메시지 표시

`App.jsx`에는 로그인/회원가입 제출을 구분하는 최소 브리지인 `submitUserAuthForm`과 전역 상태/라우팅 연결만 남겼다.

## `App.jsx` 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 17,041 | 16,513 | -528 |
| 크기 | 496,076 bytes | 478,977 bytes | -17,099 bytes |
| `useState()` | 187 | 187 | 0 |
| `useEffect()` | 59 | 59 | 0 |
| `useRef()` | 21 | 21 | 0 |
| `useMemo()` | 33 | 33 | 0 |

신규 컨트롤러는 691줄, 20,971 bytes다.

## 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 42 | 43 | +1 |
| 초기 정적 소스 | 775,484 bytes | 779,356 bytes | +3,872 bytes |

이번 작업은 지연 로딩이 아니라 책임 분리이므로 신규 정적 모듈 1개가 추가됐다. `App.jsx`에서 17,099 bytes가 빠지고 신규 컨트롤러가 20,971 bytes 추가되어 초기 정적 소스 순증은 3,872 bytes다.

## 기능 보존 사항

- 기존 화면 문구와 className 변경 없음
- 기존 회원가입 약관 revision/version/hash 검증 유지
- 회원 명부 사용 여부와 명부 불일치 판정 유지
- `memberIdentityClaimsReady` 점검 유지
- 재가입 계정은 자동 승인하지 않는 정책 유지
- 자동 승인/승인 대기 상태 분기 유지
- `accountRecoveryKeys.emailVerifier` 저장 유지
- 실패 시 생성된 Firebase Auth 사용자 삭제 및 보조 Auth 로그아웃 시도 유지
- Firestore 읽기/쓰기 위치 총계 변화 없음

## 검증 결과

- TypeScript transpile 기반 JS/JSX 구문 검사: PASS
- 표적 의미 진단(TS2304, TS2552, 중복/선언 전 참조): PASS
- React Hook import 감사: PASS
- 상대 import 실파일 감사: PASS
- Firestore strict 감사: PASS, 총 129개 접근 위치 유지
- 한국어 문자열 multiset 비교: 삭제 0, 추가 0
- 회원가입 컨트롤러 runtime mock: PASS
  - 회원가입 화면 이동
  - 회원가입 취소
  - 이메일 필수 검증
  - 자동 승인 성공 흐름
  - transaction 쓰기 3건 이상
  - 세션 생성 및 상태 화면 이동
  - 로딩 시작/종료

## 실제 Vite 빌드

검증 환경의 내부 npm 저장소에서 `yargs-parser-21.1.1.tgz`가 404를 반환해 `npm ci`가 중단됐다. 따라서 이 환경에서는 실제 `vite build`를 수행하지 못했다. 로컬 `deploy.ps1`에서 `npm run build` 성공을 확인한 후 Git push 및 운영 발행을 진행해야 한다.
