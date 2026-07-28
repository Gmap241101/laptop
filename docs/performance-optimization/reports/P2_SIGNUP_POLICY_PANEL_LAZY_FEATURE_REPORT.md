# P2 회원가입 정책 패널 내부 Feature 지연 이동 보고서

## 1. 작업 목적

회원가입 정책의 임시 상태와 저장 액션은 관리자 전용 기능이지만 기존 구조에서는 `App.jsx`가 `useAdminSignupPolicyActions`를 정적으로 import하고 항상 실행했다. 이 때문에 일반 사용자 최초 접속 경로에도 회원가입 정책 저장 로직과 Firestore 쓰기 의존성이 포함됐다.

이번 작업에서는 해당 훅을 이미 `React.lazy()`로 로드되는 `AdminSignupPolicyPanel` 내부로 이동했다. `App.jsx`에는 화면 이탈 경고에 필요한 `dirty`, `discard`, `save` 브리지 상태만 남겼다.

## 2. 변경 파일

- `src/App.jsx`
- `src/admin/AdminSignupPolicyPanel.jsx`
- `src/features/members/useAdminSignupPolicyActions.js`
- `src/context/appContextSlices.js`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

## 3. App.jsx 정적 import 제거

### 수정 전

```jsx
import useAdminSignupPolicyActions from './features/members/useAdminSignupPolicyActions.js';
```

### 수정 후

`App.jsx`에서 위 import를 제거했다. 정책 훅은 `AdminSignupPolicyPanel.jsx`에서 직접 import한다.

```jsx
import useAdminSignupPolicyActions from '../features/members/useAdminSignupPolicyActions.js';
```

`AdminSignupPolicyPanel` 자체가 `AdminWorkspace`에서 `React.lazy()` 대상이므로 정책 훅도 회원가입 정책 화면을 열 때만 로드된다.

## 4. App.jsx 최상위 정책 훅 제거

### 수정 전

```jsx
const {
  cancelSignupPolicyChanges,
  saveSignupPolicyChanges,
  setTempAutoApproveNewMembers,
  setTempRequireRegisteredMemberForSignup,
  signupPolicyDirty,
  signupPolicySaving,
  tempAutoApproveNewMembers,
  tempRequireRegisteredMemberForSignup,
} = useAdminSignupPolicyActions({
  adminTab,
  isAdminAuthenticated,
  isSplitStorageReady,
  resetDirectoryMismatchRestoreAttempt,
  restoreDirectoryMismatchAccountsAfterPolicyDisabled,
  setData,
  settings: data.settings,
  triggerToast,
});
```

### 수정 후

위 호출을 전부 제거했다. `App.jsx`에는 다음 최소 브리지만 남겼다.

```jsx
const [signupPolicyDirty, setSignupPolicyDirty] = useState(false);
const signupPolicyDeferredActionsRef = useRef({
  discard: null,
  save: null,
});
```

## 5. 정책 패널 내부 훅 실행

```jsx
const {
  cancelSignupPolicyChanges,
  saveSignupPolicyChanges,
  setTempAutoApproveNewMembers,
  setTempRequireRegisteredMemberForSignup,
  signupPolicyDirty,
  signupPolicySaving,
  tempAutoApproveNewMembers,
  tempRequireRegisteredMemberForSignup,
} = useAdminSignupPolicyActions({
  isAdminAuthenticated,
  isSplitStorageReady,
  resetDirectoryMismatchRestoreAttempt,
  restoreDirectoryMismatchAccountsAfterPolicyDisabled,
  setData,
  settings: signupPolicySettings,
  triggerToast,
});
```

정책 화면이 열려 있는 동안만 다음 상태가 생성된다.

- 등록 명부 제한 임시값
- 신규 회원 자동 승인 임시값
- 변경 여부
- 저장 중 여부
- 정책 저장·취소 함수

## 6. 저장되지 않은 변경사항 브리지

패널은 현재 dirty 상태와 저장·취소 함수를 `App.jsx`에 등록한다.

```jsx
useEffect(() => {
  onSignupPolicyDeferredStateChange({
    dirty: signupPolicyDirty,
    discard: cancelSignupPolicyChanges,
    save: saveSignupPolicyChanges,
  });
}, [
  cancelSignupPolicyChanges,
  onSignupPolicyDeferredStateChange,
  saveSignupPolicyChanges,
  signupPolicyDirty,
]);
```

패널이 닫히면 참조를 정리한다.

```jsx
useEffect(
  () => () => {
    onSignupPolicyDeferredStateChange(null);
  },
  [onSignupPolicyDeferredStateChange]
);
```

`App.jsx` 브리지:

```jsx
const handleSignupPolicyDeferredStateChange = useCallback(
  (nextState) => {
    const nextDirty = Boolean(nextState?.dirty);

    signupPolicyDeferredActionsRef.current = {
      discard:
        typeof nextState?.discard === 'function'
          ? nextState.discard
          : null,
      save:
        typeof nextState?.save === 'function'
          ? nextState.save
          : null,
    };

    setSignupPolicyDirty((currentDirty) =>
      currentDirty === nextDirty
        ? currentDirty
        : nextDirty
    );
  },
  []
);
```

## 7. 메뉴 이동 확인 유지

```jsx
if (tab === 'signupPolicy' && signupPolicyDirty) {
  const {
    discard,
    save,
  } = signupPolicyDeferredActionsRef.current;

  if (
    typeof discard !== 'function' ||
    typeof save !== 'function'
  ) {
    return null;
  }

  return {
    label: '회원가입 정책',
    discard,
    save,
  };
}
```

유지되는 동작:

- 계속 편집
- 저장하지 않고 이동
- 저장 후 이동
- 저장 실패 시 현재 화면 유지

## 8. 브라우저 종료 경고 보완

기존 `currentAdminDeferredSettingsDirty`에는 회원가입 정책이 빠져 있었다. 이번 작업에서 다음 조건을 추가했다.

```jsx
(adminTab === 'signupPolicy' && signupPolicyDirty)
```

따라서 정책을 수정한 후 브라우저 탭을 닫거나 새로고침하면 저장되지 않은 변경사항 경고가 적용된다.

## 9. 정책 훅 계약 단순화

패널이 회원가입 정책 화면에서만 마운트되므로 `useAdminSignupPolicyActions`의 `adminTab` 인자를 제거했다.

### 수정 전

```jsx
useEffect(() => {
  if (adminTab !== 'signupPolicy') return;

  // 서버 설정으로 임시값 동기화
}, [adminTab, ...]);
```

### 수정 후

```jsx
useEffect(() => {
  // 서버 설정으로 임시값 동기화
}, [
  settings.autoApproveNewMembers,
  settings.requireRegisteredMemberForSignup,
]);
```

화면이 마운트된 동안 서버 정책이 갱신되면 기존과 동일하게 임시값을 동기화한다.

## 10. 컨텍스트 계약 변경

기존에는 정책 화면의 내부 상태와 setter를 `App.jsx`에서 전달했다.

### 제거된 컨텍스트 값

- `cancelSignupPolicyChanges`
- `saveSignupPolicyChanges`
- `setTempAutoApproveNewMembers`
- `setTempRequireRegisteredMemberForSignup`
- `signupPolicyDirty`
- `signupPolicySaving`
- `tempAutoApproveNewMembers`
- `tempRequireRegisteredMemberForSignup`

### 새로 전달하는 패널 의존성

- `isAdminAuthenticated`
- `isSplitStorageReady`
- `onSignupPolicyDeferredStateChange`
- `resetDirectoryMismatchRestoreAttempt`
- `restoreDirectoryMismatchAccountsAfterPolicyDisabled`
- `setData`
- `signupPolicySettings`
- `triggerToast`

정책 패널 컨텍스트 정의 17개와 실제 구조 분해 17개가 정확히 일치한다.

## 11. 초기 소스 그래프 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 38개 | 37개 | **-1개** |
| 초기 정적 소스 | 812,800 bytes | 806,925 bytes | **-5,875 bytes** |
| `App.jsx` | 543,136 bytes | 543,442 bytes | +306 bytes |
| 최상위 동적 진입점 | 13개 | 13개 | 동일 |

초기 경로에서 제외된 모듈:

```text
src/features/members/useAdminSignupPolicyActions.js
```

`App.jsx`에는 브리지 상태와 콜백이 추가돼 306 bytes 증가했지만, 정책 훅 6KB가 지연 로딩 패널 아래로 이동해 초기 정적 소스는 총 5,875 bytes 감소했다.

## 12. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 Firestore 접근 위치 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

정책 저장 쿼리와 회원 상태 복원 쿼리의 조건은 변경하지 않았다. 실행 시점만 회원가입 정책 화면이 실제로 열렸을 때로 이동했다.

## 13. 유지된 기능

- 등록 명부 가입 제한
- 신규 회원 자동 승인
- 자동 승인 종속 토글
- 정책 저장 및 취소
- 명부 버전 증가
- 가입 제한 해제 시 명부 불일치 회원 복원
- 전체 회원 명부 검사
- 정보 수정 필요 회원 이동
- 기존 성공·오류 메시지
- 기존 JSX, className 및 화면 문구

한국어 문자열 비교 결과는 수정 전·후 각각 1,352개이며 추가·삭제된 고유 문자열은 0개다.

## 14. 배포

Firestore Rules와 인덱스 변경은 없다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```
