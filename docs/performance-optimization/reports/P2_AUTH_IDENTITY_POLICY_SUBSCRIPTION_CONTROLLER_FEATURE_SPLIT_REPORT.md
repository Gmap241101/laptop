# P2 회원·관리자 권한 및 정책 실시간 구독 컨트롤러 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-rental-data-subscription-controller-split-20260731_1738_deployment_package.zip`
- 입력 패키지 프로젝트 파일: 368개
- 출력 풀패키지: `rental-system-auth-identity-policy-subscription-controller-split-20260731_1744_deployment_package.zip`
- 출력 패키지 프로젝트 파일: 373개
- 다음 작업 기준본: 출력 풀패키지로 자동 승계
- 입력 ZIP SHA-256: `d940e6b2f9c9faecdfe9eab466363cd33434c309d30f8940cd6097121e2acab6`
- 작업 원칙: 인증·권한·회원 프로필·대여 제한·세션 정책·관리자 보안 설정의 구독 조건과 오류 처리 정책을 변경하지 않고 `App.jsx`의 상태·구독 책임만 feature controller로 이동

## 2. 작업 범위

신규 파일:

- `src/features/auth/useAuthIdentityPolicySubscriptionController.js`

신규 모듈은 다음 두 API를 제공한다.

```js
useAuthIdentityPolicySubscriptionState();
useAuthIdentityPolicySubscriptionController(...);
```

또한 기존 `App.jsx`의 관리자 계정 정규화 함수를 다음 named export로 이동했다.

```js
normalizeAdminAccounts(adminAccounts);
```

## 3. 이동한 상태

`App.jsx`의 다음 상태 19개를 `useAuthIdentityPolicySubscriptionState()`로 이동했다.

### 인증·현재 역할

- `firebaseAuthUser`
- `firebaseAuthReady`
- `currentAuthAdminAccount`
- `currentAuthRoleReady`
- `currentAuthRoleErrorMessage`

### 사용자 회원 정보

- `userProfile`
- `userProfileReady`
- `currentUserRestriction`
- `currentUserRestrictionReady`

### 사용자 세션 정책

- `userSessionPolicy`
- `userSessionPolicyReady`
- `userSessionPolicyLoadErrorMessage`

### 관리자 보안 설정

- `systemAdminSettings`
- `systemAdminSettingsReady`
- `systemAdminSettingsLoadErrorMessage`

### 관리자 계정 목록

- `adminAccounts`
- `adminAccountsReady`
- `adminAccountsLoadErrorMessage`
- `adminAccountsRemoteHasData`

기존 변수명과 setter 이름을 유지해 관리자 인증, 사용자 로그인, 마이페이지, 회원 상태, 관리자 계정 관리 및 관리자 패널 context 계약을 변경하지 않았다.

## 4. 이동한 인증·권한 구독

### Firebase Authentication 상태

- `onAuthStateChanged()` 구독
- Firebase UID 변경 감지
- UID 변경 시 현재 관리자 역할 상태 초기화
- 로그아웃 시 사용자 세션 저장소 초기화
- Auth 오류 시 안전한 비로그인 상태로 전환

### 현재 로그인 계정 관리자 권한

- `adminAccounts/{firebaseUid}` 실시간 구독
- 문서 ID·`id`·`authUid` 동일성 검증
- 잘못된 관리자 UID 구조 감지 시 관리자 로컬 세션 제거
- 권한 확인 실패 시 기존 오류 문구와 토스트 유지

### 사용자 회원 프로필

- `userAccounts/{firebaseUid}` 실시간 구독
- 관리자 계정인 경우 사용자 프로필 구독 차단
- 프로필 문서가 없을 때 Firebase 표시 이름을 기본값으로 사용
- 국내 전화번호를 기존 마이페이지 폼 구조로 분해
- 프로필 로딩 실패 안내 유지

### 사용자 대여 제한

- `rentalRestrictions/{firebaseUid}` 실시간 구독
- 일반회원 세션에서만 활성화
- 제한 문서가 없을 때 `null` 처리
- 오류 시 기존 재시도 안내 유지

## 5. 이동한 정책·관리자 목록 구독

### 사용자 세션 정책

다음 경우에만 `USER_SESSION_POLICY_DOC_REF`를 구독한다.

- 정상 일반회원 로그인 상태
- 관리자가 `계정 보안` 화면을 열었을 때

기존 fallback 정책을 유지한다.

- 문서 없음: `DEFAULT_USER_SESSION_POLICY`
- 읽기 실패: 기본 정책 사용 및 오류 메시지 기록
- 화면 이탈 또는 대상 세션 없음: 준비 상태를 초기화하고 구독 해제

### 관리자 시스템 보안 설정

- 관리자 권한이 확인된 세션에서만 `SYSTEM_ADMIN_SETTINGS_DOC_REF` 구독
- 관리자 세션이 없으면 기본 설정과 준비 완료 상태 사용
- 구독 오류 시 기존 관리자 설정 오류 메시지 유지

### 관리자 계정 전체 목록

다음 조건에서만 `adminAccounts` 전체 컬렉션을 구독한다.

```text
관리자 세션 확인
+ 관리자 화면
+ 관리자 계정 관리 탭
```

그 외 화면에서는 현재 로그인 관리자 1명만 로컬 목록에 유지한다.

보존된 처리:

- 빈 컬렉션 감지
- 관리자 계정 정규화
- 원격 동기화 map 생성
- 구독 처리 오류와 권한 오류 구분
- 관리자 계정 관리 탭 외 불필요한 전체 구독 방지

## 6. `App.jsx` 연결 구조

```jsx
const {
  firebaseAuthUser,
  firebaseAuthReady,
  currentAuthAdminAccount,
  currentAuthRoleReady,
  currentAuthRoleErrorMessage,
  userProfile,
  userProfileReady,
  currentUserRestriction,
  currentUserRestrictionReady,
  userSessionPolicy,
  userSessionPolicyReady,
  systemAdminSettings,
  systemAdminSettingsReady,
  adminAccounts,
  adminAccountsReady,
  // 기존 setter 계약
} = useAuthIdentityPolicySubscriptionState();
```

```jsx
useAuthIdentityPolicySubscriptionController({
  view,
  adminTab,
  authenticatedAdminId,
  clearAdminAuthenticatedSession,
  clearUserAuthenticatedSession,
  setUserProfileForm,
  triggerToast,
  // 기존 상태와 setter 계약
});
```

관리자 로그인 컨트롤러에 전달하던 `normalizeAdminAccounts` 함수명도 그대로 유지했다.

## 7. `App.jsx` 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 6,646 | 6,187 | -459 |
| 파일 크기 | 197,436 bytes | 182,770 bytes | -14,666 bytes |
| `useState()` | 96 | 77 | -19 |
| `useEffect()` | 41 | 34 | -7 |
| `useRef()` | 15 | 11 | -4 |
| `useMemo()` | 27 | 27 | 0 |
| `onSnapshot()` | 17 | 11 | -6 |
| `getDocs()` | 4 | 4 | 0 |
| `getDoc()` | 2 | 2 | 0 |

`onAuthStateChanged()` 1개와 `onSnapshot()` 6개는 삭제된 것이 아니라 신규 컨트롤러로 이동했다.

## 8. 신규 모듈 규모

| 파일 | 줄 수 | 크기 | `useState()` | `useEffect()` | `useRef()` | `onSnapshot()` |
|---|---:|---:|---:|---:|---:|---:|
| `useAuthIdentityPolicySubscriptionController.js` | 640 | 19,567 bytes | 19 | 7 | 4 | 6 |

## 9. 초기 정적 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 64 | 65 | +1 |
| 초기 정적 소스 | 832,486 bytes | 837,387 bytes | +4,901 bytes |

이번 단계는 지연 로딩 최적화가 아니라 앱 시작 시 필요한 인증·권한 경계를 분리하는 작업이다. 인증 상태와 사용자 정책은 초기 렌더에 필수이므로 정적 import를 유지했다.

## 10. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 호출 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

구독 대상, 조건, 활성 화면, fallback 및 오류 문구는 변경하지 않았다.

`tools/firestore-audit-policy.json`은 관리자 계정 전체 목록 구독의 파일 위치가 변경되어 감사 ID 한 개만 갱신했다.

```text
기존: onSnapshot:19cbf085689f63d4
변경: onSnapshot:af6dbfebe9a290a7
```

승인 사유와 재검토 조건은 변경하지 않았다.

## 11. 변경하지 않은 영역

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- 사용자·관리자 UI와 `className`
- 한국어 안내·오류 문구
- Firestore 문서 구조
- 로그인·로그아웃·세션 만료 정책
- 회원 명부 정책 재검증 transaction
- 관리자 계정 등록·수정·삭제 transaction
- 대여 신청·승인·반납 transaction

## 12. 다음 우선순위

1. 공지사항·FAQ 사용자 조회 컨트롤러
2. 팝업·푸터 사용자 조회 컨트롤러
3. 화면 이동·브라우저 경로 컨트롤러
4. 전역 UI 상태 컨트롤러
5. 대시보드 파생값·선택자 모듈
6. 초기화·구형 데이터 호환성 서비스
7. context 조립부 및 최종 `App.jsx` 셸 정리
