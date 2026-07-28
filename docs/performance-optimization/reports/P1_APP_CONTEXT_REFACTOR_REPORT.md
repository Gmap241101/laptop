# P1 App.jsx 컨텍스트 분리 및 렌더링 경계 최적화 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p1-global-listener-optimization-deployment-package.zip`
- 작업 목적: `App.jsx`의 거대 `uiContext`가 모든 사용자·관리자 화면에 전달되어 발생하는 불필요한 연쇄 렌더링을 축소
- Firestore Rules, 인덱스, 컬렉션 구조, 화면 문구 및 업무 로직은 변경하지 않음

## 2. 기존 구조의 문제

기존 `App.jsx`는 555개 값을 하나의 `uiContext` 객체로 만든 뒤 다음 컴포넌트에 동일하게 전달했습니다.

```jsx
<UserWorkspace ctx={uiContext} />
<AdminWorkspace ctx={uiContext} />
<UserFooter ctx={uiContext} />
<AppDialogs ctx={uiContext} />
<UserPopupLayer ctx={uiContext} />
```

`uiContext`는 매 렌더링마다 새 객체가 되므로 토스트, 검색어, 다이얼로그, 관리자 상태 등 한 부분만 변경돼도 모든 하위 컴포넌트가 새 `ctx` prop을 받았습니다.

## 3. 적용 구조

### 3.1 화면별 컨텍스트 정의

신규 파일:

```text
src/context/appContextSlices.js
```

컨텍스트를 다음 33개 조각으로 분리했습니다.

| 그룹 | 조각 수 | 주요 범위 |
|---|---:|---|
| 사용자 | 9개 | 작업공간 공통, 홈, 대여, 마이페이지, 인증, 계정 상태, 이력, 푸터 페이지, 게시판 |
| 관리자 | 21개 | 작업공간 공통 및 관리자 메뉴별 패널 |
| 공통 | 3개 | 푸터, 다이얼로그, 사용자 팝업 |
| 합계 | 33개 | — |

각 조각에는 실제 해당 컴포넌트가 참조하는 키만 포함합니다.

### 3.2 안정된 컨텍스트 참조

신규 파일:

```text
src/hooks/useStableContextGroups.js
```

동작 원리:

1. 각 조각의 실제 값이 이전 렌더와 같은지 `Object.is()`로 비교
2. 값이 같으면 이전 객체 참조 유지
3. 값이 바뀐 조각만 새 객체 생성
4. `set`, `save`, `open`, `close`, `submit`, `handle` 등 이벤트 처리 함수는 최신 함수를 호출하는 안정된 프록시로 전달
5. formatter, getter, renderer 및 React 컴포넌트는 원래 참조 유지

따라서 관련 없는 최상위 상태가 바뀌어도 활성 패널의 `ctx` 참조가 같으면 `React.memo()`가 렌더링을 건너뜁니다.

## 4. App.jsx 변경

### 수정 전

```jsx
<UserWorkspace ctx={uiContext} />
<AdminWorkspace ctx={uiContext} />
<UserFooter ctx={uiContext} />
<AppDialogs ctx={uiContext} />
<UserPopupLayer ctx={uiContext} />
```

### 수정 후

```jsx
const contextGroups = useStableContextGroups(
  uiContext,
  APP_CONTEXT_GROUP_KEYS
);

const userPanelContextKey = getUserPanelContextKey({
  userTab,
  hasFirebaseAuthSession,
  isUserDirectoryAccessRestricted,
});

const adminPanelContextKey = getAdminPanelContextKey(adminTab);
```

```jsx
<UserWorkspace
  ctx={contextGroups.user.shell}
  panelCtx={contextGroups.user[userPanelContextKey]}
/>
```

```jsx
<AdminWorkspace
  ctx={contextGroups.admin.shell}
  panelCtx={contextGroups.admin[adminPanelContextKey]}
/>
```

```jsx
<MemoizedUserFooter ctx={contextGroups.app.footer} />
<MemoizedAppDialogs ctx={contextGroups.app.dialogs} />
<MemoizedUserPopupLayer ctx={contextGroups.app.popup} />
```

## 5. 전달 크기 변화

### 사용자 화면

| 대상 | 수정 전 | 수정 후 |
|---|---:|---:|
| 사용자 작업공간 공통 | 555개 | 6개 |
| 홈 패널 | 555개 | 15개 |
| 대여 신청 패널 | 555개 | 47개 |
| 마이페이지 패널 | 555개 | 35개 |
| 인증 패널 | 555개 | 30개 |
| 신청 이력 패널 | 555개 | 36개 |
| 게시판 패널 | 555개 | 49개 |
| 푸터 | 555개 | 5개 |
| 팝업 | 555개 | 8개 |

### 관리자 화면

| 대상 | 수정 전 | 수정 후 |
|---|---:|---:|
| 관리자 작업공간 공통 | 약 275개 구조 분해 | 31개 |
| 대시보드 패널 | 555개 | 28개 |
| 신청 관리 패널 | 555개 | 56개 |
| 자산 관리 패널 | 555개 | 34개 |
| 회원 계정 패널 | 555개 | 25개 |
| 관리자 계정 패널 | 555개 | 28개 |
| 계정 보안 패널 | 555개 | 10개 |
| 기타 관리자 패널 | 555개 | 13~48개 |

## 6. React.memo 경계

### 사용자

- 사용자 작업공간
- 홈 패널
- 인증 패널
- 계정 상태 패널
- 게시판 패널
- 마이페이지 패널
- 대여 신청 패널
- 신청 이력 패널
- 푸터 페이지 패널

### 관리자

- 관리자 작업공간
- lazy 관리자 패널 17개

### 공통

- 사용자 푸터
- 앱 다이얼로그
- 사용자 팝업 레이어

## 7. 관리자 작업공간 구조 축소

`AdminWorkspace.jsx`는 모든 패널 값을 직접 구조 분해하던 구조를 제거했습니다.

| 항목 | 수정 전 | 수정 후 |
|---|---:|---:|
| 파일 줄 수 | 888줄 | 646줄 |
| 파일 크기 | 31,775 bytes | 25,639 bytes |
| 작업공간 공통 구조 분해 | 약 275개 | 31개 |

각 패널은 `panelCtx`만 받습니다.

```jsx
{adminTab === 'requests' && (
  <AdminRequestsPanel ctx={panelCtx} />
)}
```

## 8. 사용자 작업공간 분리

`UserWorkspace.jsx`는 작업공간 공통 상태와 활성 패널 상태를 분리했습니다.

```jsx
function UserWorkspace({ ctx, panelCtx }) {
  // ctx: 인증·라우팅 공통 6개
  // panelCtx: 현재 사용자 패널 전용 값
}
```

보호된 화면에서 로그인되지 않았거나 회원 디렉터리 접근이 제한된 경우에도 기존과 동일하게 인증 패널 또는 마이페이지 패널로 전환합니다.

## 9. uiContext 정리

하위 컴포넌트에서 사용하지 않는 다음 8개 항목을 `uiContext`에서 제거했습니다.

```text
DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE
adminUserAccountPage
currentUserRestriction
filteredBorrowers
managedUserAccounts
setHolidayImportLoading
setIsCommunityMenuOpen
setUserTab
```

`uiContext` 항목 수:

```text
수정 전 555개
수정 후 547개
```

이 값들은 `App.jsx` 내부 계산에서는 그대로 유지되며, 하위 컴포넌트 전달 목록에서만 제거됐습니다.

## 10. 소스 크기 영향

이번 작업은 네트워크 번들 축소가 아니라 렌더링 경계 분리가 목적입니다.

| 지표 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 30개 | 32개 | +2개 |
| 초기 정적 소스 | 855,279 bytes | 878,721 bytes | +23,442 bytes |
| `AdminWorkspace.jsx` | 31,775 bytes | 25,639 bytes | -6,136 bytes |

컨텍스트 키 정의와 안정화 훅이 초기 경로에 추가되므로 정적 소스는 증가합니다. 대신 활성 패널에 전달되는 객체 범위와 상위 상태 변경에 따른 하위 렌더링 전파를 크게 줄였습니다.

실제 raw·gzip 번들 및 렌더링 시간은 다음 순차 작업에서 로컬 Vite 빌드와 React Profiler로 비교해야 합니다.

## 11. 변경 파일

기존 파일:

```text
src/App.jsx
src/admin/AdminWorkspace.jsx
src/user/UserWorkspace.jsx
```

신규 파일:

```text
src/context/appContextSlices.js
src/hooks/useStableContextGroups.js
```

## 12. 변경하지 않은 영역

```text
rules/firestore.rules
firestore.indexes.json
firebase.json
.firebaserc
package.json
package-lock.json
Firestore 컬렉션 및 문서 구조
대여 신청·승인·반납 로직
화면 문구와 메뉴 구조
```

## 13. 배포

Rules와 인덱스가 변경되지 않았으므로 웹 배포만 실행합니다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
