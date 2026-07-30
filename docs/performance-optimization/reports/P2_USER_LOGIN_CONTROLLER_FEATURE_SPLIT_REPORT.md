# P2 사용자 로그인 컨트롤러 기능 분리 보고서

- 작업일: 2026-07-30
- 입력 기준본: `rental-system-user-account-recovery-controller-split-20260730_1148_deployment_package.zip`
- 작업 범위: 사용자 로그인·로그아웃·로그인 화면 이동 및 공용 사용자 인증 폼 상태 분리
- 다음 기준본: 본 작업의 전체 배포 패키지

## 1. 작업 목표

`App.jsx`가 직접 소유하던 사용자 로그인·로그아웃 실행 흐름과 사용자 인증 폼 상태를 인증 feature로 이동했다. 회원가입 실행 흐름은 다음 순차 작업 대상으로 남겼다. 사용자 화면, 문구, Firebase 데이터 구조, Firestore Rules와 인덱스는 변경하지 않았다.

## 2. 변경 파일

### 수정

- `src/App.jsx`
  - 사용자 인증 폼 `useState` 2개를 `useUserAuthState()`로 교체
  - `goToUserLogin`, `logoutUser`, 일반 사용자 로그인 처리 코드를 제거
  - `useUserLoginController()` 연결
  - 기존 혼합 로그인·회원가입 submit 함수를 로그인과 회원가입으로 분리
  - 회원가입 처리는 `submitUserSignupForm`으로 유지
  - 로그인과 회원가입이 공통으로 사용하는 사용자 세션 정책 조회를 공용 서비스로 연결

### 신규

- `src/features/auth/useUserLoginController.js`
  - 사용자 인증 폼 기본값
  - 사용자 인증 폼·로딩 상태 hook
  - 로그인 화면 이동
  - 사용자 로그아웃
  - 일반 사용자 로그인 검증 및 Firebase Auth 처리
  - 관리자 계정의 사용자 로그인 차단
  - 회원 상태별 이동 및 자동 로그아웃
  - 로그인 반환 위치 복원

- `src/features/auth/userSessionPolicyService.js`
  - 사용자 세션 정책 정규화
  - 정책 listener 준비 전 Firestore 단건 조회 fallback
  - 로그인과 회원가입의 공통 정책 조회 중복 제거

## 3. 기능 경계

### 이번 단계에서 이동

- `userAuthForm`
- `userAuthLoading`
- `goToUserLogin`
- `logoutUser`
- 일반 사용자 로그인 제출 처리
- 로그인 실패 시 Firebase Auth 정리
- 사용자 상태별 로그인 후 이동

### App.jsx에 유지

- 회원가입 화면 이동 및 취소
- 회원가입 입력 검증
- 회원가입 Firebase Auth 보조 인스턴스 처리
- 회원 명부·중복 claim·약관 transaction
- 회원가입 완료 화면 이동
- 사용자 세션 만료 감시
- 관리자 인증

## 4. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 17,225 | 17,041 | -184 |
| 바이트 | 502,785 | 496,076 | -6,709 |
| `useState()` | 189 | 187 | -2 |
| `useEffect()` | 59 | 59 | 0 |
| `useRef()` | 21 | 21 | 0 |
| `useMemo()` | 33 | 33 | 0 |

신규 인증 모듈은 다음과 같다.

| 파일 | 줄 수 | 바이트 |
|---|---:|---:|
| `useUserLoginController.js` | 399 | 11,452 |
| `userSessionPolicyService.js` | 21 | 554 |

## 5. 소스 그래프 영향

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 40 | 42 | +2 |
| 초기 정적 소스 | 770,187 bytes | 775,484 bytes | +5,297 bytes |

이번 단계는 지연 로딩이 아니라 책임 분리다. 로그인 컨트롤러와 세션 정책 서비스가 초기 인증 경로에 정적으로 포함되므로 초기 모듈 수는 증가했다.

## 6. Firestore 영향

정적 접근 위치는 작업 전후 동일하다.

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 접근 위치 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

로그인과 회원가입에 각각 정책 조회 코드를 복제하지 않고 `resolveEffectiveUserSessionPolicy()` 한 곳으로 통합하여 정적 Firestore 호출 위치 증가를 방지했다. 실제 사용자 동작당 읽기 횟수와 조건도 변경하지 않았다.

## 7. 기능 보존

- 로그인 이메일·비밀번호 검증 문구 유지
- 관리자 계정의 사용자 로그인 차단 유지
- 미등록 회원 로그인 차단 유지
- 명부 정책 변경 시 회원 상태 재검증 유지
- `profile_required`, `pending`, `blocked`, `retired` 처리 유지
- 로그인 반환 위치 복원 유지
- 보호 화면 로그아웃 후 사용자 홈 이동 유지
- 사용자 인증 context 키 33개 유지
- UI className 및 화면 문구 변경 없음

## 8. 삭제 파일 관리

- 이번 작업 신규 삭제 파일: 0개
- 직전 패키지의 `package-meta/REMOVED_FILES.txt` 누적 목록: 그대로 승계
- 중복·보호 경로·패키지 파일 충돌: 없음

## 9. 검증

- 전체 JS·JSX·MJS TypeScript 구문 변환 통과
- 변경 파일 표적 미정의 식별자 검사 통과
- React Hook import 감사 통과
- 상대 import 실파일 검사 통과
- Firestore strict 감사 통과
- 인증 context 계약 검사 통과
- 로그인 컨트롤러 런타임 mock 5개 시나리오 통과
- Rules, 인덱스, Firebase 설정, npm manifest 해시 불변 확인

## 10. 빌드 제한

현재 실행 환경의 내부 npm 저장소에서 `yargs-parser-21.1.1.tgz`가 E404로 반환되어 `npm ci`와 실제 Vite 프로덕션 빌드를 수행하지 못했다. 로컬 `deploy.ps1`에서 `npm run build`가 성공해야 배포 가능 상태로 확정한다.

## 11. 다음 순차 작업

다음 분리 대상은 `App.jsx`에 남아 있는 사용자 회원가입 제출 흐름이다. 회원가입 입력 검증, 명부 확인, identity claim, 약관 동의 transaction, 복구 인덱스 저장, 자동 승인 후 로그인 처리를 별도 컨트롤러·서비스로 이동한다.
