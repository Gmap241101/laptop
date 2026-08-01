# P2 App context assembler feature split

## 기준본

- `rental-system-app-data-compatibility-service-split-20260801_2134_deployment_package.zip`
- 기준 `src/App.jsx`: 4,155줄 / 121,371 bytes

## 작업 범위

`App.jsx`가 직접 수행하던 화면 컨텍스트 조립 중 다음 책임을 `src/context/useAppContextAssembler.js`로 이동했다.

1. 화면 컨텍스트에서 공통으로 사용하는 정적 컴포넌트·상수·순수 helper 78개 보관
2. 정적 값과 App 렌더별 동적 값 병합
3. `useStableContextGroups()` 호출
4. 사용자 패널 컨텍스트 키 계산
5. 관리자 패널 컨텍스트 키 계산

`App.jsx`에는 현재 렌더 상태와 행동 함수로 구성된 `dynamicContextValues`만 남겼다.

## 신규 모듈

### `src/context/useAppContextAssembler.js`

- `APP_CONTEXT_STATIC_VALUES`
  - React, Framer Motion, 공통 UI 컴포넌트, 아이콘, 상태 상수, 날짜·대여 helper 등 78개를 고정 객체로 제공한다.
- `useAppContextAssembler()`
  - 정적 값과 동적 값을 합친 뒤 기존 `APP_CONTEXT_GROUP_KEYS` 정의에 따라 안정된 컨텍스트 그룹을 만든다.
  - `getUserPanelContextKey()`와 `getAdminPanelContextKey()` 호출을 내부로 이동했다.

## 기능 보존

- 기존 컨텍스트 고유 키 466개를 모두 유지했다.
- 정적 키 78개와 동적 키 388개의 중복은 없다.
- 누락·추가 키는 없다.
- `APP_CONTEXT_GROUP_KEYS`의 사용자·관리자·공통 slice 정의는 변경하지 않았다.
- 이벤트 함수 안정화 규칙과 `React.memo` 렌더링 경계는 변경하지 않았다.
- 사용자·관리자 패널 선택 규칙은 변경하지 않았다.
- Firestore 접근, Rules, 인덱스, 사용자 문구, 경로 구조는 변경하지 않았다.

## App.jsx 변화

- 4,155줄 → 4,018줄: 137줄 감소
- 121,371 bytes → 118,285 bytes: 3,086 bytes 감소
- Hook 호출 수 변화 없음
  - `useState`: 21
  - `useEffect`: 6
  - `useRef`: 4
  - `useMemo`: 19
  - `useCallback`: 10

## 초기 소스 그래프

- 초기 정적 모듈: 74 → 75
- 초기 정적 소스: 871,265 → 873,215 bytes

컨텍스트 조립기는 앱 셸 렌더링에 필수이므로 정적 import를 사용한다. 이번 작업은 지연 로딩 최적화가 아니라 컨텍스트 조립 책임과 검증 경계 분리다.

## Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot`: 35 → 35
- `getDocs`: 48 → 48
- `getDoc`: 28 → 28
- `getCountFromServer`: 18 → 18

`rules/firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `tools/firestore-audit-policy.json`은 변경하지 않았다.

## 남은 구조 작업

`dynamicContextValues`에는 App에서 생성되는 동적 상태·행동 388개가 남아 있다. 이를 무리하게 별도 모듈로 이동하려면 상태 소유권과 컨트롤러 반환 계약까지 동시에 변경해야 하므로 이번 단계에서는 실행부와 정적 의존성만 분리했다. 다음 단계는 최상위 렌더와 워크스페이스 선택을 앱 셸 컴포넌트로 이동하는 작업이다.
