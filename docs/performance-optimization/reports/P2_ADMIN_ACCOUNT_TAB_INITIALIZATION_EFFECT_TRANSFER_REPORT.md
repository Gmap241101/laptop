# P2 관리자 계정 탭 초기화 효과 이동 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-user-account-status-navigation-state-integration-20260802_0145_deployment_package.zip`
- 출력 패키지: `rental-system-admin-account-tab-initialization-effect-transfer-20260802_0152_deployment_package.zip`
- 작업 범위: `App.jsx`의 마지막 직접 `useEffect`를 관리자 계정 관리 상태 훅으로 이동
- 작업 성격: 기능 변경 없는 효과 소유권 정리

## 2. 수정 목적

관리자 ID 관리 탭 진입 시 등록 폼을 기본값으로 되돌리고 목록 페이지를 1페이지로 이동하는 효과는 `adminAccountForm`과 `adminAccountPage` 상태에만 관여합니다. 그러나 기준본에서는 해당 상태를 `useAdminAccountManagementState`가 소유하면서도 초기화 효과는 `App.jsx`에 남아 있었습니다.

이번 작업에서는 상태와 효과의 소유권을 일치시켜 `App.jsx`의 마지막 직접 `useEffect`를 제거했습니다.

## 3. 변경 내용

### `src/App.jsx`

- React `useEffect` import 제거
- `createDefaultAdminAccountForm` import 제거
- 관리자 계정 탭 초기화 효과 제거
- `useAdminAccountManagementState({ adminTab })` 형태로 현재 관리자 탭 전달

### `src/features/auth/useAdminAccountManagementController.js`

- `useAdminAccountManagementState`가 `adminTab`을 입력받도록 변경
- `adminTab === 'adminAccounts'`일 때만 등록 폼과 페이지 초기화
- 기존 초기화 순서와 기본값 유지

### `tools/audit-app-flow-contracts.mjs`

다음 회귀 계약을 추가했습니다.

1. `App.jsx`가 관리자 탭을 상태 훅에 전달하는지 검사
2. 상태 훅이 `adminTab` 입력을 받는지 검사
3. 관리자 ID 관리 탭에서 등록 폼을 기본값으로 초기화하는지 검사
4. 관리자 ID 관리 탭에서 페이지를 1로 초기화하는지 검사
5. `App.jsx`에 중복 초기화 효과가 남아 있지 않은지 검사
6. `App.jsx`에 직접 `useEffect` 호출과 불필요한 폼 팩토리 import가 없는지 검사

## 4. 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,181 | 2,173 | -8 |
| `App.jsx` 바이트 | 67,655 | 67,448 | -207 |
| `App.jsx` 직접 `useState` | 1 | 1 | 0 |
| `App.jsx` 직접 `useEffect` | 1 | 0 | -1 |
| `App.jsx` 직접 `useMemo` | 0 | 0 | 0 |
| `App.jsx` 직접 `useRef` | 0 | 0 | 0 |
| 관리자 계정 관리 컨트롤러 줄 수 | 813 | 820 | +7 |
| 초기 정적 모듈 | 87 | 87 | 0 |
| 초기 정적 소스 | 880,958 bytes | 880,940 bytes | -18 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

## 5. 기능 보존

- 관리자 ID 관리 탭 진입 시 등록 폼 초기화 유지
- 관리자 계정 목록 페이지 1페이지 복귀 유지
- 다른 관리자 탭에서는 초기화하지 않음
- 관리자 계정 등록·수정·삭제·잠금·비밀번호 재설정 동작 변경 없음
- 화면 문구, 버튼 순서, 클래스명 변경 없음
- Context 공개 키와 화면 소비 계약 변경 없음

## 6. Firestore 영향

Firestore 호출, 쿼리, Rules, 인덱스 및 Firebase 설정은 변경하지 않았습니다.

- 읽기 감사 호출: 129건 유지
- `onSnapshot`: 35건 유지
- `getDocs`: 48건 유지
- `getDoc`: 28건 유지
- `getCountFromServer`: 18건 유지
- 쓰기 호출 수 전후 동일

## 7. 검증 결과

- 입력 ZIP·manifest·파일별 SHA-256: PASS
- React Hook 감사: PASS, 144개 소스
- 앱 흐름 계약 감사: PASS, 105개 계약
- 상대 import 검사: PASS, 429개·누락 0건
- Firestore strict 감사: PASS, 129개 호출
- 관리자 계정 탭 초기화 런타임 모의 검증: PASS
- TypeScript 기준본 비교: 신규 진단 0건
- 사용자 표시 문자열 비교: 추가 0건, 삭제 0건
- `npm run prebuild`: PASS
- 실제 Vite 빌드: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미수행

## 8. 후속 우선순위

다음 순차 작업은 `App.jsx`의 대형 `dynamicContextValueGroups` 객체 조립 책임을 별도 동적 Context 조립 훅으로 이동하는 것입니다.
