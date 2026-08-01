# 앱 준비 상태·원격 폼 초기화 가드 분리 보고서

## 작업 개요

- 입력 기준본: `rental-system-asset-catalog-view-controller-split-20260802_0118_deployment_package.zip`
- 출력 패키지: `rental-system-app-initialization-readiness-controller-split-20260802_0130_deployment_package.zip`
- 작업 목적: `App.jsx`가 직접 소유하던 Firebase 데이터 준비 상태와 초기화 오류 상태를 전용 컨트롤러로 이동하고, 최초 원격 대여 폼 초기화 Ref를 실제 사용 컨트롤러 내부로 이동한다.
- 기능 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 변경 내용

### 1. 앱 초기화 준비 상태 전용 컨트롤러 추가

`src/shell/useAppInitializationReadinessController.js`를 추가했다. 다음 상태와 Setter를 소유한다.

- `firebaseReady`
- `firebaseLoadErrorMessage`
- `setFirebaseReady`
- `setFirebaseLoadErrorMessage`

기본값은 기존 `App.jsx`와 동일하게 `false`, 빈 문자열이다.

### 2. 최초 원격 폼 초기화 Ref의 소유권 이동

`initializedRemoteFormRef`는 `useRentalDataSubscriptionController`에서만 사용됐다. 해당 Ref를 `App.jsx`에서 생성해 인수로 전달하지 않고, 실제 초기화 효과를 수행하는 데이터 구독 컨트롤러 내부에서 직접 소유하도록 변경했다.

기존 동작은 유지된다.

- 원격 통합 데이터가 처음 준비됐을 때만 대여 신청 폼 기본값 설정
- 원격 설정 임시 폼도 최초 한 번만 초기화
- 이후 Firestore 구독 갱신에서는 사용자가 입력 중인 폼을 덮어쓰지 않음

### 3. 회귀 감사 확장

`tools/audit-app-flow-contracts.mjs`에 다음 계약을 추가했다.

- `App.jsx`가 준비 상태 전용 컨트롤러를 import·호출하는지 검사
- 전용 컨트롤러가 공개값 4개를 모두 제공하는지 검사
- 기존 준비 상태 `useState`가 `App.jsx`에 중복 잔존하지 않는지 검사
- `initializedRemoteFormRef`가 `App.jsx`에서 제거됐는지 검사
- Ref가 데이터 구독 컨트롤러 내부에 존재하는지 검사

## 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,180 | 2,183 | +3 |
| `App.jsx` 바이트 | 67,726 | 67,766 | +40 |
| `App.jsx useState()` | 4 | 2 | -2 |
| `App.jsx useEffect()` | 1 | 1 | 0 |
| `App.jsx useMemo()` | 0 | 0 | 0 |
| `App.jsx useRef()` | 1 | 0 | -1 |
| `App.jsx` 직접 Firestore 호출 | 0 | 0 | 0 |
| 초기 정적 모듈 | 86 | 87 | +1 |
| 초기 정적 소스 | 880,448 bytes | 880,878 bytes | +430 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

`App.jsx` 줄 수가 소폭 증가한 이유는 상태 2개를 각각 선언하던 구조에서 전용 컨트롤러의 공개 계약 4개를 명시적으로 구조 분해하기 때문이다. 상태와 Ref의 실제 소유권은 감소했다.

## 기능 보존

- Firebase 준비 전 차단 화면 판정 유지
- 공개 설정·자산·예약·대여자 데이터 준비 판정 유지
- 분할 저장소 오류 메시지 표시 유지
- 관리자 인증 준비 판정 유지
- `AppShell`의 `firebaseReady` 전달 유지
- 최초 원격 대여 폼 초기화 1회 정책 유지
- 사용자 화면 문구 추가·삭제 없음
- Firestore 읽기 호출 수 변화 없음

## 빌드 상태

- `npm run prebuild`: PASS
- TypeScript JS·JSX·MJS 검사: PASS
- 실제 Vite 빌드: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미수행
- 로컬 `deploy.ps1`에서 실제 빌드 성공 확인 필요
