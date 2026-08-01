# P2 회원 상태 화면 내비게이션 상태 통합 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-app-initialization-readiness-controller-split-20260802_0130_deployment_package.zip`
- 출력 패키지: `rental-system-user-account-status-navigation-state-integration-20260802_0145_deployment_package.zip`
- 작업 범위: `App.jsx`가 직접 소유하던 `userAccountStatusView`를 `useAppNavigationState`로 이동
- 작업 성격: 기능 변경 없는 상태 소유권 통합

## 2. 수정 목적

`userAccountStatusView`는 `/account-status` 경로, 세션 스토리지 복원, 회원 상태 화면 이동과 결합된 내비게이션 상태입니다. 그러나 기준본에서는 이 상태만 `App.jsx`가 별도 `useState`로 소유하고, 상태를 변경하는 `showUserAccountStatus`는 내비게이션 컨트롤러에 위치해 있었습니다.

이번 작업에서는 계정 상태 화면의 현재 표시값과 Setter를 기존 `useAppNavigationState`에 통합하여 경로 상태와 화면 표시 상태의 소유권을 일치시켰습니다.

## 3. 변경 내용

### `src/App.jsx`

- `readUserAccountStatusView` 직접 import 제거
- `const [userAccountStatusView, setUserAccountStatusView] = useState(...)` 제거
- `useAppNavigationState()` 반환값에서 `userAccountStatusView`와 `setUserAccountStatusView`를 수신
- 기존 Context 공급명과 내비게이션 컨트롤러 입력명 유지

### `src/routing/useAppNavigationController.js`

- `readUserAccountStatusView` import 추가
- `useAppNavigationState` 내부에 계정 상태 화면 상태 추가
- 상태값과 Setter를 기존 내비게이션 상태 반환 계약에 추가
- `showUserAccountStatus`의 세션 저장, 메모리 상태 갱신, `/account-status` 이동 순서 유지

### `tools/audit-app-flow-contracts.mjs`

다음 회귀 계약을 추가했습니다.

1. 계정 상태 화면 상태가 내비게이션 상태 훅에 존재하는지 검사
2. 상태값과 Setter가 반환되는지 검사
3. `App.jsx`에 중복 상태가 남지 않았는지 검사
4. 상태 전환 시 세션 저장이 유지되는지 검사
5. 메모리 상태 갱신이 유지되는지 검사
6. `accountStatus` 경로 이동이 유지되는지 검사

## 4. 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,183 | 2,181 | -2 |
| `App.jsx` 바이트 | 67,766 | 67,655 | -111 |
| `App.jsx` 직접 `useState` | 2 | 1 | -1 |
| `App.jsx` 직접 `useEffect` | 1 | 1 | 0 |
| 내비게이션 상태 `useState` | 4 | 5 | +1 |
| 초기 정적 모듈 | 87 | 87 | 0 |
| 초기 정적 소스 | 880,878 bytes | 880,958 bytes | +80 bytes |

`App.jsx`에 남은 직접 상태는 통합 호환 데이터인 `data` 하나입니다.

## 5. 기능 보존

- `/account-status` 직접 접속 시 세션에 저장된 상태 유형 복원
- `showUserAccountStatus(type)` 호출 시 상태 유형 저장
- 세션 스토리지 기록 유지
- 인메모리 상태 갱신 유지
- `/account-status` 경로 replace 이동 유지
- 푸터 및 공지 선택 보존 옵션 유지
- `UserAccountStatusPanel`의 Context 키와 렌더링 계약 유지
- 사용자 표시 문구 변경 없음

## 6. Firestore 영향

Firestore 호출, 쿼리, Rules, 인덱스, Firebase 설정은 변경하지 않았습니다.

- 읽기 감사 호출: 129건 유지
- `onSnapshot`: 35건 유지
- `getDocs`: 48건 유지
- `getDoc`: 28건 유지
- `getCountFromServer`: 18건 유지
- 쓰기 호출 수 전후 동일

## 7. 검증 결과

- 입력 패키지 manifest 및 SHA-256: PASS
- React Hook 감사: PASS, 144개 소스
- 앱 흐름 계약 감사: PASS, 99개 계약
- 상대 import 검사: PASS, 누락 0건
- Firestore strict 감사: PASS
- 내비게이션 상태 런타임 모의 검증: PASS
- TypeScript 기준본 비교: 신규 진단 0건
- 사용자 표시 문자열 AST 비교: 추가 0건, 삭제 0건
- `npm run prebuild`: PASS
- 실제 Vite 빌드: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미수행

## 8. 후속 우선순위

다음 순차 작업은 `App.jsx`에 남은 마지막 직접 `useEffect`인 관리자 계정 탭 진입 초기화 효과를 관리자 계정 관리 컨트롤러로 이동하는 것입니다.
