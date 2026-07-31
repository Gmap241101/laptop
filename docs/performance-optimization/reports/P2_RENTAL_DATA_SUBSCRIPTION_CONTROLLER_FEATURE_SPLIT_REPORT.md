# P2 대여 데이터 실시간 구독 컨트롤러 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-shared-rental-restriction-admin-audit-service-split-20260731_1719_deployment_package.zip`
- 입력 패키지 프로젝트 파일: 363개
- 출력 풀패키지: `rental-system-rental-data-subscription-controller-split-20260731_1738_deployment_package.zip`
- 출력 패키지 프로젝트 파일: 368개
- 다음 작업 기준본: 출력 풀패키지로 자동 승계
- 입력 ZIP SHA-256: `60dc0c5b13df47dbdf86f20da937714fad8ae76b6b2e763f391802d95e33d9b0`
- 작업 원칙: Firestore 구독 조건·화면 활성 조건·오류 문구·로컬 데이터 병합 정책을 변경하지 않고 `App.jsx`의 대여 데이터 공급 책임만 feature controller로 이동

## 2. 작업 범위

이번 단계에서는 직전 우선순위 2번이었던 대여 데이터 실시간 공급 경계를 분리했다.

신규 파일:

- `src/features/requests/useRentalDataSubscriptionController.js`

이 파일은 다음 두 hook을 제공한다.

```js
useRentalDataSubscriptionState();
useRentalDataSubscriptionController(...);
useOwnRentalRequestsSubscriptionController(...);
```

## 3. 이동한 상태

`App.jsx`의 다음 상태 12개를 `useRentalDataSubscriptionState()`로 이동했다.

- `splitPublicConfig`
- `splitRentalAssets`
- `publicCatalogAssets`
- `publicCatalogAssetsReady`
- `splitRentalAvailability`
- `splitRentalBorrowers`
- `splitStorageVersion`
- `splitSourceReady`
- `splitSourceErrors`
- `rentalRequests`
- `rentalRequestsReady`
- `rentalRequestsLoadErrorMessage`

기존 변수명과 setter 계약은 유지해 자산 CRUD, 대여 신청, 신청내역, 마이페이지, 관리자 패널 연결을 변경하지 않았다.

## 4. 이동한 실시간 구독·동기화 처리

### 공개 설정

- `rentalSystem/publicConfig` 실시간 구독
- 공개 설정 문서 누락·권한 오류 처리
- `storageVersion` 반영
- 분리 저장소 준비 상태와 오류 상태 반영

### 사용자 공개 자산 카탈로그

- 사용자 홈·대여 신청 화면에서 `publicCatalog/main` 구독
- 공개 카탈로그 스키마 버전 확인
- 공개 카탈로그 누락·구형 스키마 시 `rentalAssets` 일회성 fallback
- 공개 자산과 예약 가용성 데이터 결합

### 관리자 자산

- 관리자 자산·신청·카테고리·데이터 관리 화면에서 `rentalAssets` 구독
- 자산별 `reservations` 정규화
- 권한 오류 및 준비 상태 처리

### 예약 가용성

- 사용자 홈·신청 화면과 관리자 자산·신청 화면에서 `rentalAvailability` 구독
- 사용자 공개 카탈로그의 실시간 예약 상태 보강

### 대여자 명부

- 관리자 사용자·가입정책·관리자 계정 화면에서 `rentalBorrowers` 구독
- `sortOrder` 정규화와 정렬

### 사용자 본인 신청내역

- 현재 Firebase Auth UID 기준 `rentalRequests` 구독
- `previousAccountUids`에 포함된 이전 계정 UID별 구독
- 기존 데이터 호환을 위한 이메일 조건 구독
- 문서 ID 기준 중복 제거 및 병합
- 필수 UID 쿼리 실패와 선택 이메일 쿼리 실패를 구분

### 원격 데이터 병합

네 분리 저장소 원본이 준비되면 기존 `mergePersistedData()`를 사용해 다음 데이터를 병합한다.

- 자산
- 예약 가용성
- 자산 카테고리
- 부서·팀
- 대여자
- 대여 정책·휴일·회원가입 정책

최초 원격 데이터 준비 시 신청 폼과 시스템 설정 임시 상태를 한 번만 초기화하는 기존 `initializedRemoteFormRef` 정책도 유지했다.

## 5. `App.jsx` 연결 구조

```jsx
const {
  rentalRequests,
  rentalRequestsLoadErrorMessage,
  rentalRequestsReady,
  setRentalRequests,
  splitPublicConfig,
  splitRentalAssets,
  splitRentalAvailability,
  splitStorageVersion,
  // ...
} = useRentalDataSubscriptionState();
```

```jsx
useRentalDataSubscriptionController({
  view,
  userTab,
  adminTab,
  authenticatedAdminId,
  currentAuthAdminAccount,
  // 기존 데이터·setter 계약
});
```

```jsx
useOwnRentalRequestsSubscriptionController({
  firebaseAuthUser,
  userProfile,
  isAdminAuthenticated,
  setRentalRequests,
  setRentalRequestsReady,
  setRentalRequestsLoadErrorMessage,
  triggerToast,
});
```

## 6. `App.jsx` 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 7,278 | 6,646 | -632 |
| 파일 크기 | 214,261 bytes | 197,436 bytes | -16,825 bytes |
| `useState()` | 108 | 96 | -12 |
| `useEffect()` | 48 | 41 | -7 |
| `useRef()` | 15 | 15 | 0 |
| `useMemo()` | 27 | 27 | 0 |
| `onSnapshot()` | 23 | 17 | -6 |
| `getDocs()` | 5 | 4 | -1 |
| `getDoc()` | 2 | 2 | 0 |
| `runTransaction()` | 1 | 1 | 0 |

이동한 `onSnapshot()` 6개와 `getDocs()` 1개는 신규 컨트롤러에 그대로 존재한다.

## 7. 신규 모듈 규모

| 파일 | 줄 수 | 크기 | `useState()` | `useEffect()` |
|---|---:|---:|---:|---:|
| `useRentalDataSubscriptionController.js` | 810 | 22,281 bytes | 12 | 7 |

## 8. 초기 정적 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 63 | 64 | +1 |
| 초기 정적 소스 | 827,030 bytes | 832,486 bytes | +5,456 bytes |

이번 단계는 지연 로딩 최적화가 아니라 대여 데이터 공급 책임 분리 작업이다. 신규 컨트롤러는 초기 앱 데이터 준비에 필요한 모듈이므로 정적 import를 유지했다.

## 9. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 호출 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

조회 범위, 활성 화면 조건, 쿼리의 `where` 조건, fallback 실행 조건과 호출 횟수는 변경하지 않았다.

`tools/firestore-audit-policy.json`은 파일 이동으로 변경된 감사 ID 5개만 갱신했다.

- 관리자 자산 구독
- 공개 카탈로그 fallback 자산 조회
- 예약 가용성 구독
- 대여자 구독
- 동적 본인 신청내역 구독

승인 사유와 재검토 조건은 변경하지 않았다.

## 10. 변경하지 않은 영역

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- 사용자·관리자 UI
- 한국어 안내·오류 문구
- Firestore 문서 구조
- 대여 신청·수정·승인 transaction
- 관리자 신청 목록 전용 pagination controller
- 공개 자산 write-through 마이그레이션 effect

## 11. 다음 우선순위

1. 회원·관리자 권한 및 정책 실시간 구독 컨트롤러
2. 공지사항·FAQ 사용자 조회 컨트롤러
3. 팝업·푸터 사용자 조회 컨트롤러
4. 화면 이동·브라우저 경로 컨트롤러
5. 전역 UI 상태 컨트롤러
6. 대시보드 파생값·선택자 모듈
7. 초기화·구형 데이터 호환성 서비스
8. context 조립부 및 최종 `App.jsx` 셸 정리
