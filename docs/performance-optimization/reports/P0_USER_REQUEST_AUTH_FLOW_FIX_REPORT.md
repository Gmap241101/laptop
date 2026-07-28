# P0 사용자 신청내역 및 인증 피드백 흐름 수정 보고서

## 1. 작업 목적

최신 누적 패키지에서 확인된 다음 두 운영 장애를 수정한다.

1. 일반 사용자가 로그인한 뒤 `신청내역` 화면에 본인 신청이 표시되지 않는 문제
2. 회원가입 또는 마이페이지 저장 중 실제 성공·실패가 확정되기 전에 `현재 ... 계정으로 로그인되어 있습니다.` 화면이 먼저 표시되는 문제

Firestore 문서 구조, Security Rules, 인덱스 정의, 화면 문구와 기존 회원 상태 정책은 변경하지 않는다.

---

## 2. 신청내역 누락 원인

### 2.1 기존 사용자 신청 구독

`App.jsx`는 본인 신청을 다음 복합 조건으로 실시간 구독했다.

```jsx
query(
  rentalRequests,
  where('requesterUid', '==', firebaseAuthUser.uid),
  where('status', 'in', ['신청중', '보류', '승인'])
)
```

이 쿼리는 `requesterUid`와 `status`를 결합한 Firestore 복합 인덱스에 의존한다. 운영 프로젝트에 해당 인덱스가 없거나 생성 중이면 `onSnapshot()` 오류 콜백이 실행되고, 기존 코드는 다음과 같이 목록을 빈 배열로 초기화했다.

```jsx
setRentalRequests([]);
setRentalRequestsReady(true);
```

현재 `deploy.ps1`은 Vite 빌드 결과를 GitHub Pages에 게시하는 스크립트이며 `firestore.indexes.json`을 운영 프로젝트에 자동 배포하지 않는다. 따라서 소스 저장소에 인덱스 정의가 존재하더라도 웹만 배포한 운영 환경에서는 인덱스 상태가 일치한다고 보장할 수 없다.

브라우저 콘솔의 실제 오류 객체를 제공받지 않았으므로 운영 당시 오류 코드까지 단정할 수는 없다. 다만 코드상 로그인 직후 전체 신청 목록이 동시에 빈 배열로 정리되는 공통 실패 경로가 위 복합 쿼리의 오류 콜백이며, 배포 방식과 증상이 일치한다.

### 2.2 과거 신청내역의 중복 복합 쿼리

기존 `useUserRequestHistory.js`는 종료·반납 이력을 별도로 조회했다.

- 종료 건수: `requesterUid == uid` + `status in [불허, 사용자취소]`
- 반납 건수: `requesterUid == uid` + `status == 반납완료`
- 이력 페이지: 위 조건 + `orderBy(createdAt desc)`
- 검색: 동일 복합 조건을 순차 스캔

따라서 활성 신청 구독이 성공하더라도 과거 탭은 별도의 복합 인덱스에 다시 의존했다.

---

## 3. 신청내역 수정 방식

### 3.1 본인 UID 단일 조건으로 한 번만 구독

수정 후에는 로그인 사용자의 전체 신청을 다음 단일 조건으로 구독한다.

```jsx
query(
  rentalRequests,
  where('requesterUid', '==', firebaseAuthUser.uid)
)
```

Firestore Rules는 다음 조건으로 본인 문서의 `get/list`를 허용하므로 단일 UID 쿼리와 일치한다.

```text
isReadableGeneralUser() &&
resource.data.requesterUid == request.auth.uid
```

상태별 분류·검색·정렬·페이지네이션은 이미 내려받은 본인 문서에서 브라우저가 수행한다.

### 3.2 별도 이력 훅 제거

다음 파일을 삭제했다.

```text
src/hooks/useUserRequestHistory.js
```

`UserRequestHistoryPanel`은 `currentUserRequests` 한 소스에서 다음 탭을 모두 계산한다.

- 신청 대기: 신청중, 보류
- 대여 중: 승인
- 종료: 불허, 사용자 취소
- 반납 완료: 반납완료

이에 따라 사용자 이력용 `getDocs()` 1개 경로와 `getCountFromServer()` 2개 경로가 제거되고, 동일 사용자 문서를 중복 조회하지 않는다.

---

## 4. 로그인 안내가 먼저 표시된 원인

### 4.1 Firebase Auth 계정 생성 순서

회원가입은 다음 순서로 진행된다.

1. `createUserWithEmailAndPassword()` 실행
2. Firebase Auth가 생성된 계정을 즉시 현재 로그인 사용자로 설정
3. `onAuthStateChanged()`가 실행되어 `firebaseAuthUser` 설정
4. Firestore transaction에서 명부 중복·identity claim·복구키 검증
5. 검증 실패 시 생성 계정 삭제 또는 로그아웃
6. 실제 오류 토스트 표시

기존 `UserAuthPanel`은 `firebaseAuthUser`가 존재한다는 사실만으로 다음 안내를 렌더링했다.

```jsx
현재 00@00 계정으로 로그인되어 있습니다.
```

따라서 Firestore 회원가입 transaction이 아직 끝나지 않았거나 중복 가입으로 실패할 예정이어도 Firebase Auth의 임시 로그인 상태가 먼저 화면에 노출됐다.

### 4.2 마이페이지 저장 시 역할 판정 재초기화

기존 관리자 역할 확인 effect는 전체 `firebaseAuthUser` 객체를 의존성으로 사용했다.

```jsx
[firebaseAuthReady, firebaseAuthUser]
```

`updateProfile()`처럼 동일 UID의 Auth 사용자 객체가 갱신될 때도 effect가 재실행될 수 있고, `onAuthStateChanged()`는 매번 역할 준비 상태를 초기화했다. 보호 화면은 역할 준비가 끝날 때까지 로그인·확인 경로로 전환될 수 있어 마이페이지 저장 중 순간적인 화면 전환이 발생할 여지가 있었다.

---

## 5. 인증 피드백 수정 방식

### 5.1 앱 세션이 확정된 사용자만 로그인 안내 표시

다음 조건을 추가했다.

```jsx
const hasEstablishedUserSession = Boolean(
  firebaseAuthUser?.uid &&
    userAuthSessionUid === firebaseAuthUser.uid &&
    userAuthSessionExpiresAt > Date.now()
);
```

로그인 안내는 아래 조건을 모두 만족할 때만 표시한다.

```jsx
firebaseAuthUser &&
hasEstablishedUserSession &&
!userAuthLoading
```

즉, Firebase Auth 객체가 잠시 생성됐다는 사실이 아니라 앱의 로그인 검증과 세션 저장까지 완료됐는지를 기준으로 한다.

- 회원가입 검증 중: 가입 폼과 처리 중 상태 유지
- 중복 가입 실패: 로그인 안내 없이 오류 토스트 표시
- 로그인 성공: 앱 세션 저장 후 정상 화면 이동
- 이미 확정된 로그인 사용자가 로그인/가입 경로에 접근: 기존 로그인 안내 표시

### 5.2 동일 UID Auth 갱신 시 역할 상태 유지

최근 관찰한 Auth UID를 ref에 저장하고 UID가 실제로 변경된 경우에만 역할 상태를 초기화한다.

```jsx
const authIdentityChanged =
  observedFirebaseAuthUidRef.current !== nextAuthUid;
```

역할 확인 effect의 의존성도 객체 전체가 아니라 UID로 제한했다.

```jsx
[firebaseAuthReady, firebaseAuthUser?.uid]
```

이에 따라 `updateProfile()` 등 동일 계정 정보 갱신은 역할 listener를 불필요하게 해제·재생성하지 않는다.

---

## 6. 변경 파일

### 수정

```text
src/App.jsx
src/context/appContextSlices.js
src/user/UserAuthPanel.jsx
src/user/UserRequestHistoryPanel.jsx
tools/firestore-audit-policy.json
docs/performance-optimization/README.md
package-meta/REMOVED_FILES.txt
```

### 삭제

```text
src/hooks/useUserRequestHistory.js
```

### 변경하지 않은 항목

```text
rules/firestore.rules
firestore.indexes.json
firebase.json
package.json
package-lock.json
Firestore 컬렉션 및 문서 필드
```

---

## 7. Firestore 접근 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 호출 | 123 | 120 | -3 |
| `onSnapshot()` | 32 | 32 | 0 |
| `getDocs()` | 48 | 47 | -1 |
| `getDoc()` | 23 | 23 | 0 |
| `getCountFromServer()` | 20 | 18 | -2 |

본인 신청 실시간 구독 수는 1개로 동일하다. 단, 복합 상태 조건을 제거하고 종료 이력 조회를 동일 구독으로 통합했다.

---

## 8. 소스 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32 | 32 | 0 |
| 초기 정적 소스 | 716,843 bytes | 717,319 bytes | +476 bytes |
| 전체 `src` JS 계열 파일 | 84 | 83 | -1 |
| 전체 `src` JS 계열 크기 | 1,754,020 bytes | 1,748,032 bytes | -5,988 bytes |

초기 경로에는 세션 확정과 UID 안정화 코드가 476 bytes 추가됐다. 반면 별도 사용자 이력 훅이 삭제돼 전체 소스는 5,988 bytes 감소했다.

---

## 9. 배포 유의사항

이번 수정은 Firestore Rules와 인덱스를 변경하지 않는다. 최신 전체 패키지 적용 후 웹만 다시 빌드·배포하면 된다.

단일 UID 쿼리로 변경했으므로 이번 사용자 신청내역 수정 자체는 신규 복합 인덱스 배포를 요구하지 않는다.
