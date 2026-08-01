# P2 App shell component feature split

## 기준본

- `rental-system-app-context-assembler-split-20260801_2146_deployment_package.zip`
- 기준 `src/App.jsx`: 4,018줄 / 118,285 bytes
- 기준 ZIP SHA-256: `fc7ef1bf15036a396dc6f198078186271bb64f94bf20d02ba826463a348adbb5`

## 작업 범위

`App.jsx`가 직접 렌더링하던 정상 실행 상태의 최상위 UI 셸을 `src/shell/AppShell.jsx`로 이동했다.

1. 사용자·관리자 공통 상단 헤더와 로고
2. 사용자 대여신청·신청내역·커뮤니티 메뉴
3. 로그인·회원가입·마이페이지·로그아웃 버튼
4. 관리자 인증 상태와 관리자 모드 헤더
5. 대여 현황 보드
6. 사용자·관리자 워크스페이스 선택
7. 사용자 푸터
8. 공통 대화상자와 사용자 팝업 레이어
9. 개발용 성능 패널
10. Firebase 초기 데이터 로딩 오버레이
11. 사용자 화면 전역 안내 배너

Firebase 치명적 로딩 오류 화면과 사용자 점검 모드 화면은 데이터·서비스 상태 판정과 밀접하므로 이번 단계에서는 `App.jsx`에 유지했다.

## 신규 모듈

### `src/shell/AppShell.jsx`

- `AdminWorkspace`, `AppDialogs`, `UserPopupLayer`, `DevPerformancePanel`의 기존 동적 import 경계를 유지한다.
- `UserFooter`, `AppDialogs`, `UserPopupLayer`의 기존 `React.memo` 경계를 유지한다.
- 관리자 워크스페이스 최초 로딩 fallback을 셸 내부 컴포넌트로 이동한다.
- 팝업 레이어 마운트 조건과 Firebase 로딩 오버레이 표시 조건을 셸 내부에서 계산한다.
- 사이트 부제 계산을 셸 내부로 이동한다.

## App.jsx 연결

`App.jsx`는 인증, 데이터, 컨트롤러와 컨텍스트를 조립한 뒤 정상 실행 화면에서 `AppShell`에 34개 계약 값을 전달한다.

```jsx
return (
  <AppShell
    adminLogoutInProgress={adminLogoutInProgress}
    adminPanelContextKey={adminPanelContextKey}
    authenticatedAdminAccount={authenticatedAdminAccount}
    contextGroups={contextGroups}
    firebaseReady={firebaseReady}
    normalizedSiteSettings={normalizedSiteSettings}
    shouldRenderAppDialogs={shouldRenderAppDialogs}
    shouldShowStats={shouldShowStats}
    shouldShowSystemBanner={shouldShowSystemBanner}
    userPanelContextKey={userPanelContextKey}
    userTab={userTab}
    view={view}
    {...remainingShellContract}
  />
);
```

실제 코드에서는 spread를 사용하지 않고 모든 계약 값을 명시적으로 전달한다.

## 기능 보존

- 사용자·관리자 헤더 구성과 className을 유지했다.
- 사용자 메뉴 선택 상태와 커뮤니티 드롭다운 animation을 유지했다.
- 로그인 상태별 버튼 분기를 유지했다.
- 관리자 워크스페이스의 동적 로딩과 fallback 문구를 유지했다.
- 대여 현황 보드 표시 조건과 입력값을 유지했다.
- 사용자·관리자 context slice 선택 규칙을 유지했다.
- 사용자 푸터, 공통 대화상자, 사용자 팝업 레이어의 렌더 조건을 유지했다.
- 전역 안내는 사용자 화면 한정 조건을 그대로 사용한다.
- Firebase 데이터 준비 전 blur·입력 차단·로딩 오버레이를 유지했다.
- 사용자에게 표시되는 한국어 문자열은 삭제·추가 없이 동일하다.
- Firestore 접근, Rules, 인덱스, 인증 및 경로 로직은 변경하지 않았다.

## App.jsx 변화

- 4,018줄 → 3,683줄: 335줄 감소
- 118,285 bytes → 104,423 bytes: 13,862 bytes 감소
- Hook 호출 수 변화 없음
  - `useState`: 21
  - `useEffect`: 6
  - `useRef`: 4
  - `useMemo`: 19
  - `useCallback`: 10

신규 `AppShell.jsx`는 444줄 / 17,045 bytes다. `App.jsx`와 셸을 합친 전체 코드는 기준본보다 109줄, 3,183 bytes 증가했으며, 이는 명시적인 34개 props 계약과 별도 컴포넌트 경계에 따른 구조 비용이다.

## 초기 소스 그래프

- 초기 정적 모듈: 75 → 76
- 초기 정적 소스: 873,215 → 876,398 bytes

`AppShell`은 최초 화면 렌더링에 필수이므로 정적 import를 사용한다. 관리자 워크스페이스, 공통 대화상자, 팝업 레이어와 개발 성능 패널은 기존과 동일하게 동적 import된다.

## Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot`: 35 → 35
- `getDocs`: 48 → 48
- `getDoc`: 28 → 28
- `getCountFromServer`: 18 → 18

`rules/firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `tools/firestore-audit-policy.json`은 변경하지 않았다.

## 다음 구조 작업

`App.jsx`에는 컨트롤러가 반환한 상태와 행동 함수를 `dynamicContextValues` 하나에 조립하는 큰 객체가 남아 있다. 다음 단계에서는 이를 사용자, 관리자, 게시판, 대여, 설정, 대화상자 등 기능별 동적 컨텍스트 소스 객체로 분리해 누락·중복 검증 경계를 강화한다.
