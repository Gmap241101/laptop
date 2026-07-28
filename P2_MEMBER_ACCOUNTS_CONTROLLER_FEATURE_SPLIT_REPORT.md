# 관리자 회원 계정 컨트롤러 Feature 분리 보고서

## 1. 작업 목적

`src/App.jsx`에 남아 있던 관리자 회원 계정 관리의 다음 로직을 회원 전용 feature 훅으로 분리했다.

- 회원 목록 상태
- 검색어와 상태 필터
- 검색 디바운스
- 서버 커서 페이지네이션
- 순차 검색 캐시
- 검색 취소 처리
- 상태별 회원 수 집계
- 관리자 계정 제외 처리
- 페이지 수 및 현재 페이지 계산
- 화면 이탈 시 회원 목록 상태 정리

기존 회원 승인·차단·이용 종료, 재가입 이력 확인, 등록 명부 검사, Firestore 컬렉션·인덱스·Rules는 변경하지 않았다.

## 2. 변경 파일

### 기존 파일 수정

- `src/App.jsx`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 파일

- `src/features/members/useAdminMemberAccountsController.js`

## 3. 주요 변경 내용

### 3.1 회원 상태를 feature 훅으로 이동

수정 전에는 `App.jsx`가 다음 상태를 직접 소유했다.

```jsx
const [adminUserAccounts, setAdminUserAccounts] = useState([]);
const [adminUserAccountPage, setAdminUserAccountPage] = useState(1);
const [adminUserAccountHasNextPage, setAdminUserAccountHasNextPage] = useState(false);
const [adminUserAccountTotalCount, setAdminUserAccountTotalCount] = useState(0);
const [adminUserAccountQuery, setAdminUserAccountQuery] = useState('');
const [adminUserAccountStatusFilter, setAdminUserAccountStatusFilter] = useState('all');
```

수정 후에는 전용 훅이 상태와 조회를 소유하고 `App.jsx`에는 결과와 조작 함수만 반환한다.

```jsx
const {
  adminUserAccountHasNextPage,
  adminUserAccountPage,
  adminUserAccountQuery,
  adminUserAccountSearchMode,
  adminUserAccountStatusCounts,
  adminUserAccountStatusFilter,
  adminUserAccountTotalPages,
  adminUserAccountsLoadErrorMessage,
  adminUserAccountsReady,
  filteredManagedUserAccounts,
  safeAdminUserAccountPage,
  setAdminUserAccountPage,
  setAdminUserAccountQuery,
  setAdminUserAccountStatusFilter,
} = useAdminMemberAccountsController({
  prerequisitesReady: firebaseAuthReady && currentAuthRoleReady,
  enabled:
    isAdminAuthenticated &&
    view === 'admin' &&
    adminTab === 'memberAccounts',
  registeredAdminAccounts,
  triggerToast,
});
```

### 3.2 일반 회원 목록 서버 커서 유지

검색어가 없을 때는 기존과 동일하게 다음 구조를 사용한다.

```text
userAccounts
→ 상태 필터
→ createdAt 내림차순
→ 이전 페이지 마지막 문서 startAfter
→ 페이지 크기 20 + 다음 페이지 확인 1건
→ onSnapshot 실시간 구독
```

핵심 코드는 feature 훅으로 이동했다.

```jsx
const memberSource = firestoreQuery(
  USER_ACCOUNTS_COLLECTION_REF,
  ...statusConstraints,
  orderBy('createdAt', 'desc'),
  ...(pageCursor ? [startAfter(pageCursor)] : []),
  firestoreLimit(ADMIN_MEMBER_ACCOUNT_PAGE_SIZE + 1)
);
```

페이지별 마지막 문서는 다음 맵에 저장한다.

```jsx
const cursorByPageRef = useRef(new Map([[1, null]]));
```

상태 필터가 변경되면 커서와 현재 페이지를 초기화한다.

### 3.3 회원 검색 순차 스캔 유지

검색 모드에서는 기존의 전체 범위 순차 검색을 유지한다.

```jsx
void scanFirestoreMatches({
  collectionRef: USER_ACCOUNTS_COLLECTION_REF,
  constraints: [
    ...statusConstraints,
    orderBy('createdAt', 'desc'),
  ],
  startCursor: cache.cursor,
  existingMatches: cache.matches,
  targetMatchCount: page * ADMIN_MEMBER_ACCOUNT_PAGE_SIZE + 1,
  batchSize: DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
  mapDocument: (userDoc) => ({
    ...userDoc.data(),
    uid: userDoc.data().uid || userDoc.id,
  }),
  matchesDocument: (account) =>
    matchesMemberSearch(account, normalizedSearch),
  isCancelled: () => cancelled,
});
```

검색 대상은 변경하지 않았다.

- 이름
- 이메일
- 부서
- 전화번호
- UID

검색어 또는 상태 필터가 변경되면 검색 캐시를 초기화하고, 다음 페이지 이동 시 이전 Firestore 커서부터 이어서 조회한다.

### 3.4 상태별 회원 수 집계 이동

다음 5개 집계도 feature 훅으로 이동했다.

- 승인 대기
- 활성
- 정보 수정 필요
- 차단
- 이용 종료

```jsx
getCountFromServer(
  firestoreQuery(
    USER_ACCOUNTS_COLLECTION_REF,
    where('status', '==', USER_PROFILE_STATUS.PENDING)
  )
)
```

회원 관리 화면에서만 집계를 수행한다. 다른 관리자 메뉴와 사용자 화면에서는 실행하지 않는다.

### 3.5 관리자 계정 제외 처리 이동

`userAccounts`에 관리자 UID가 포함돼도 회원 목록에서 제외하는 기존 처리를 유지했다.

```jsx
const adminUidSet = new Set(
  (registeredAdminAccounts || [])
    .flatMap((account) => [account.id, account.authUid])
    .filter(Boolean)
);

return (accounts || []).filter(
  (account) => !adminUidSet.has(account.uid)
);
```

### 3.6 불필요한 재조회 방지

`triggerToast`는 `App.jsx` 렌더마다 함수 참조가 바뀔 수 있다. 이를 조회 effect 의존성에 직접 넣으면 회원 목록 쿼리가 불필요하게 다시 실행될 수 있으므로 최신 함수만 ref로 보관한다.

```jsx
const triggerToastRef = useRef(triggerToast);

useEffect(() => {
  triggerToastRef.current = triggerToast;
}, [triggerToast]);
```

회원 목록 조회 effect는 토스트 함수 참조 변경 때문에 재실행되지 않는다.

## 4. 유지된 기능

다음 동작은 변경하지 않았다.

- 회원 상태별 필터
- 검색어 디바운스
- 페이지당 20명
- 이전·다음 페이지 이동
- 검색 결과 전체 범위 순차 조회
- 일반 목록 실시간 구독
- 상태별 회원 수 집계
- 관리자 계정의 회원 목록 제외
- 재가입 회원 대여 이력 수동 조회
- 가입 승인 전 과거 계정 진행 신청 재확인
- 회원 승인·차단·이용 종료
- 가입 제한 해제 시 명부 불일치 회원 자동 복원
- 기존 화면 문구와 UI

## 5. 코드 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 20,833줄 | 20,387줄 | -446줄 |
| `App.jsx` 크기 | 603,966 bytes | 591,011 bytes | -12,955 bytes |
| `App.jsx` `useState()` | 234개 | 225개 | -9개 |
| `App.jsx` `useEffect()` | 72개 | 68개 | -4개 |
| `App.jsx` `useRef()` | 24개 | 21개 | -3개 |
| `App.jsx` `useMemo()` | 44개 | 41개 | -3개 |
| 신규 feature 훅 | 없음 | 426줄 / 11,790 bytes | +1개 |

## 6. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32개 | 33개 | +1개 |
| 초기 정적 소스 | 820,759 bytes | 819,594 bytes | -1,165 bytes |
| `App.jsx` 소스 | 603,966 bytes | 591,011 bytes | -12,955 bytes |

이번 작업은 지연 로딩이 아니라 구조 분리 작업이다. 신규 훅이 정적 모듈로 추가됐지만 중복 제어 코드가 정리돼 초기 정적 소스도 1,165 bytes 감소했다.

## 7. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 Firestore 접근 위치 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

조회 위치가 `App.jsx`에서 feature 훅으로 이동했을 뿐, 쿼리 수·필터·페이지 크기·집계 수는 변경하지 않았다.

## 8. 배포 영향

다음 파일은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`

따라서 Firestore Rules와 인덱스 재배포는 필요하지 않다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```

## 9. 검증 제한

전체 JS·JSX·MJS 소스 변환, 상대 import 검사, Firestore 엄격 감사는 통과했다.

현재 실행 환경에는 `node_modules/.bin/vite`가 없어 실제 Vite 프로덕션 번들 생성은 실행하지 못했다. `npm run build`는 사전 Firestore 감사까지 통과한 뒤 `vite: not found`로 종료됐다.
