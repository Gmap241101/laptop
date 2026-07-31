# P2 공용 대여 제한 조회·관리자 감사 주체 서비스 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-admin-user-action-review-controller-banner-tab-count-fix-20260731_1709_deployment_package.zip`
- 입력 패키지 프로젝트 파일: 357개
- 출력 풀패키지: `rental-system-shared-rental-restriction-admin-audit-service-split-20260731_1719_deployment_package.zip`
- 출력 프로젝트 파일: 363개
- 다음 작업 기준본: 출력 풀패키지로 자동 승계
- 입력 ZIP SHA-256: `f091b4cf3b820fa18381c95bf36d68a8f4330129bda5d10dfa0d3bd9b6a407f0`
- 작업 원칙: 기능·문구·Firestore 구조를 변경하지 않고 `App.jsx`의 공용 helper 책임만 feature service로 이동

## 2. 작업 범위

이번 단계에서는 직전 우선순위 1번이었던 다음 두 공용 helper를 분리했다.

1. 대여 신청·연장 직전 최신 제한 상태를 서버에서 다시 계산하는 조회 함수
2. 게시판·팝업·푸터·관리자 신청 처리에서 공통으로 사용하는 관리자 감사 주체 생성 함수

신규 파일은 다음과 같다.

- `src/features/requests/rentalRestrictionService.js`
- `src/features/auth/adminAuditActorService.js`

## 3. 대여 제한 조회 서비스

### 이동 전

`App.jsx`가 다음 작업을 직접 수행했다.

- `rentalSystem/publicConfig` 최신 설정 조회
- 특정 UID의 전체 `rentalRequests` 조회
- `rentalRestrictions/{uid}` 단건 조회
- 최신 대여 정책 정규화
- 신청 문서 ID 병합
- 제한 문서 UID 병합
- `getRentalRestrictionStatus()` 실행

### 이동 후

`rentalRestrictionService.js`가 다음 API를 제공한다.

```js
loadFreshRentalRestrictionStatus({
  requesterUid,
  fallbackSettings,
});
```

`App.jsx`는 기존 컨트롤러 계약을 유지하기 위해 다음 loader factory만 연결한다.

```js
const loadFreshRentalRestrictionStatus =
  createFreshRentalRestrictionStatusLoader({
    fallbackSettings: data.settings,
  });
```

따라서 `useUserRentalRequestController`와 `useUserRequestHistoryActionController`의 인자명과 호출 방식은 변경되지 않았다.

## 4. 관리자 감사 주체 서비스

### 이동 전

`App.jsx`가 다음 우선순위로 감사 주체를 생성했다.

- UID: 현재 Firebase Auth UID → 관리자 문서 `authUid` → 빈 문자열
- 관리자 ID: 관리자 문서 `id` → 빈 문자열
- 이름: `userName` → `adminLoginId` → `authEmail` → `관리자`

### 이동 후

`adminAuditActorService.js`가 다음 API를 제공한다.

```js
createAdminAuditActor({
  firebaseUser,
  authenticatedAdminAccount,
});
```

현재 Firebase Auth 사용자를 호출 시점에 읽는 기존 동작은 resolver factory로 보존했다.

```js
const getCurrentAdminAuditActor =
  createCurrentAdminAuditActorResolver({
    firebaseAuth,
    authenticatedAdminAccount,
  });
```

기존 컨트롤러에 전달되는 `getCurrentAdminAuditActor` 함수 계약은 변경되지 않았다.

## 5. `App.jsx` 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 7,329 | 7,278 | -51 |
| 파일 크기 | 215,437 bytes | 214,261 bytes | -1,176 bytes |
| `useState()` | 108 | 108 | 0 |
| `useEffect()` | 48 | 48 | 0 |
| `useRef()` | 15 | 15 | 0 |
| `useMemo()` | 27 | 27 | 0 |
| `getDocs()` | 6 | 5 | -1 |
| `getDoc()` | 4 | 2 | -2 |
| `runTransaction()` | 1 | 1 | 0 |

`getDocs()`와 `getDoc()` 호출은 제거된 것이 아니라 `rentalRestrictionService.js`로 이동했다.

## 6. 신규 모듈 규모

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `rentalRestrictionService.js` | 79 | 1,863 bytes |
| `adminAuditActorService.js` | 29 | 628 bytes |
| 합계 | 108 | 2,491 bytes |

## 7. 초기 정적 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 61 | 63 | +2 |
| 초기 정적 소스 | 825,715 bytes | 827,030 bytes | +1,315 bytes |

이번 단계는 지연 로딩이 아니라 공용 책임 분리이므로 신규 정적 서비스 모듈 두 개가 추가됐다.

## 8. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 호출 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

쿼리 조건, 호출 시점, 병렬 조회 구조, 문서 변환 및 제한 계산 정책은 변경하지 않았다.

`tools/firestore-audit-policy.json`은 호출 위치 이동으로 변경된 감사 ID만 다음과 같이 갱신했다.

- 이전: `getDocs:2e0cb7ecd3c919f5`
- 이후: `getDocs:a64692c08f4241c1`

승인 사유와 재검토 조건은 동일하다.

## 9. 변경하지 않은 영역

다음 파일과 정책은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- 사용자·관리자 UI
- 한국어 문구
- 대여 제한 계산식
- 관리자 감사 로그 payload 구조
- 기존 컨트롤러의 public contract

## 10. 다음 우선순위

다음 순차 분리 대상은 `App.jsx`의 대형 실시간 데이터 공급 경계다.

1. 대여 자산·신청·가용성 실시간 구독 컨트롤러
2. 회원·관리자 권한 및 정책 실시간 구독 컨트롤러
3. 공지사항·FAQ 사용자 조회 컨트롤러
4. 팝업·푸터 사용자 조회 컨트롤러
5. 화면 이동·브라우저 경로 컨트롤러
6. 전역 UI 상태 컨트롤러
7. 대시보드 파생값·선택자 모듈
8. 초기화·구형 데이터 호환성 서비스
9. context 조립부 및 최종 `App.jsx` 셸 정리
