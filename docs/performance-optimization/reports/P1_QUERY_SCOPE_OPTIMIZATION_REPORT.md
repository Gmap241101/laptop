# P1 조회 범위 최적화 적용 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p0-dashboard-accuracy-fix-deployment-package.zip`
- 작업 목적: 우선순위 2인 사용자 대여 이력, 관리자 회원 이력, 신청 처리 로그의 과다 실시간 조회 제거
- 기능·문구·Firestore 컬렉션 구조는 가능한 범위에서 유지
- Firestore Rules 변경 없음
- 신규 복합 인덱스 3개 추가

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `src/user/UserRequestHistoryPanel.jsx`
- `src/admin/AdminMemberAccountsPanel.jsx`
- `firestore.indexes.json`

### 신규

- `src/hooks/useUserRequestHistory.js`

## 3. 일반 사용자 대여 신청 조회 구조

### 수정 전

로그인한 일반 사용자는 현재 화면과 관계없이 본인 `rentalRequests` 전체를 실시간 구독했다.

```js
const ownRequestSource = firestoreQuery(
  RENTAL_REQUESTS_COLLECTION_REF,
  where('requesterUid', '==', firebaseAuthUser.uid)
);
```

회원의 대여 이력이 계속 누적되면 홈, 마이페이지, 공지사항 등 어느 화면에 있더라도 과거 완료·불허·취소 문서까지 초기 읽기와 실시간 감시 대상이 됐다.

### 수정 후

앱 전역에서 항상 필요한 진행 데이터만 실시간 구독한다.

```js
const ownRequestSource = firestoreQuery(
  RENTAL_REQUESTS_COLLECTION_REF,
  where('requesterUid', '==', firebaseAuthUser.uid),
  where('status', 'in', [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
    STATUS.APPROVED,
  ])
);
```

상시 실시간 대상은 다음 상태로 제한된다.

- 신청중
- 보류
- 대여중

이 데이터는 다음 기능에 계속 사용된다.

- 진행 신청 표시
- 신청 수정·취소
- 대여 연장
- 연체 여부
- 탈퇴 가능 여부
- 자산 중복 신청 방지

## 4. 사용자 과거 이력 서버 페이지네이션

신규 훅 `src/hooks/useUserRequestHistory.js`를 추가했다.

### 일반 목록

불허·사용자취소 및 반납완료 탭에 진입했을 때만 `getDocs()`로 읽는다.

```js
firestoreQuery(
  RENTAL_REQUESTS_COLLECTION_REF,
  where('requesterUid', '==', userUid),
  ...getHistoryStatusConstraints(requestTab),
  orderBy('createdAt', 'desc'),
  ...(!searchMode && pageCursor ? [startAfter(pageCursor)] : []),
  firestoreLimit(requestPageSize + 1)
)
```

- 실시간 리스너를 사용하지 않음
- 서버 커서 `startAfter()` 사용
- 현재 페이지 크기보다 1건만 추가 조회하여 다음 페이지 존재 여부 판정
- 페이지 이탈 시 추가 구독 없음

### 탭 건수

과거 탭 건수만 집계 쿼리로 계산한다.

- 불허·사용자취소
- 반납완료

### 검색

Firestore의 부분 문자열 검색 제약 때문에 선택한 과거 탭의 최신 최대 200건만 일회성으로 가져온 뒤 브라우저에서 검색한다. 기존 전체 이력 실시간 구독보다 범위가 제한되지만, 200건 밖의 오래된 결과는 검색되지 않는 제한은 남아 있다.

## 5. 관리자 회원 이력 조회 구조

### 수정 전

회원 계정 관리 화면에 진입하면 현재 페이지 회원과 이전 계정 UID를 최대 30개 묶어 전체 대여 이력을 실시간 구독했다.

```js
where('requesterUid', 'in', requesterUids)
```

회원 목록을 보기만 해도 여러 회원의 전체 과거 이력이 읽혔다.

### 수정 후

회원 목록 진입 시 대여 이력을 조회하지 않는다.

재가입 회원 카드에는 다음 버튼을 제공한다.

```text
대여 이력 확인
```

버튼을 누른 회원만 `getDocs()`로 일회성 조회한다. 조회 결과는 해당 카드의 로컬 상태에 저장되며 다음 내용을 표시한다.

- 연결 계정 수
- 전체 대여 건수
- 이전 계정 대여 건수
- 진행 중 건수
- 연체 이력 건수
- 상속된 대여 제한 기준일

회원 상태를 활성로 변경할 때는 UI 조회 여부와 무관하게 서버에서 이전 계정 이력을 다시 확인한다. 이전 계정에 진행 중 신청·대여가 남아 있으면 기존과 동일하게 승인을 차단한다.

## 6. 관리자 신청 처리 로그 조회 구조

### 수정 전

대여 신청 관리 화면의 현재 페이지 신청 ID를 최대 30개씩 묶어 모든 처리 로그를 실시간 구독했다.

```js
where('requestId', 'in', requestIdChunk)
```

목록만 보고 있어도 현재 페이지의 모든 로그가 읽혔다.

### 수정 후

신청 상세를 선택했을 때 선택한 신청 ID 한 건의 로그만 실시간 구독한다.

```js
firestoreQuery(
  RENTAL_REQUEST_LOGS_COLLECTION_REF,
  where('requestId', '==', selectedAdminRequestId),
  orderBy('createdAt', 'desc'),
  firestoreLimit(100)
)
```

- 목록 화면: 로그 읽기 0건
- 상세 화면: 선택 신청 1건의 최신 로그 최대 100건
- 상세 화면에서 상태·메모가 변경되면 로그가 즉시 반영됨

목록 정렬과 접수·처리일 표시는 로그 문서가 아니라 신청 문서의 `updatedAt`, `createdAt`, `requestedAt`을 사용한다. 따라서 목록을 위해 로그를 읽지 않는다.

## 7. 회원 탈퇴 시 과거 연체 건수 보존

전역 `currentUserRequests`가 진행 데이터만 포함하게 되므로, 탈퇴 시 저장하는 `historicalOverdueCount`를 현재 배열에서 계산하면 안 된다.

탈퇴 실행 시 다음 집계 쿼리로 실제 과거 연체 반납 건수를 계산하도록 변경했다.

```js
getCountFromServer(
  firestoreQuery(
    RENTAL_REQUESTS_COLLECTION_REF,
    where('requesterUid', '==', firebaseAuthUser.uid),
    where('overdueDaysAtReturn', '>', 0)
  )
)
```

이 조회는 회원 탈퇴를 실제로 실행할 때 한 번만 발생한다.

## 8. 신규 Firestore 인덱스

### 사용자 진행·과거 이력

```json
{
  "collectionGroup": "rentalRequests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "requesterUid", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### 탈퇴 시 과거 연체 집계

```json
{
  "collectionGroup": "rentalRequests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "requesterUid", "order": "ASCENDING" },
    { "fieldPath": "overdueDaysAtReturn", "order": "ASCENDING" }
  ]
}
```

### 선택 신청 처리 로그

```json
{
  "collectionGroup": "rentalRequestLogs",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "requestId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

## 9. 예상 읽기 변화

### 일반 사용자 로그인

예를 들어 본인 누적 신청이 300건이고 진행 신청이 2건인 경우:

```text
수정 전: 300건 실시간 구독
수정 후: 진행 2건 실시간 구독
```

과거 이력은 사용자가 신청내역 화면에서 불허 또는 반납완료 탭을 열 때 페이지 크기만큼 읽는다.

### 관리자 회원 계정 화면

```text
수정 전: 현재 페이지 회원들의 전체 대여 이력 실시간 구독
수정 후: 기본 0건, 재가입 회원의 이력 확인 버튼 클릭 시 해당 회원만 일회성 조회
```

### 관리자 신청 관리 화면

페이지당 신청 20건, 신청당 로그 5건인 경우:

```text
수정 전: 목록 진입 시 로그 약 100건 실시간 구독
수정 후: 목록 진입 시 로그 0건
         상세 선택 시 선택 신청 로그 최대 100건
```

## 10. 남은 제한

- 과거 이력 검색은 최신 최대 200건 범위의 클라이언트 검색이다.
- 회원 이력 확인은 해당 회원의 연결 UID 전체 이력을 일회성으로 읽는다. 재가입 회원 수가 많고 이력이 매우 많다면 별도 요약 문서가 필요하다.
- 신청 로그 상세는 최신 최대 100건만 표시한다. 감사 목적으로 100건을 초과하는 전체 로그가 필요하면 상세 로그 페이지네이션을 추가해야 한다.
- 신청 목록의 정확한 상태 전환 시각은 로그가 아니라 신청 문서 `updatedAt` 기준이다. 신청 문서에 `lastStatusChangedAt`을 저장하면 목록 정확도를 더 높일 수 있다.

## 11. 배포 순서

신규 인덱스가 있으므로 프런트엔드보다 먼저 배포한다.

```powershell
Set-Location "E:\project\rental-system\test_new"

firebase deploy --only firestore:indexes
```

Firebase 콘솔에서 신규 인덱스가 `Enabled` 상태가 된 뒤 웹을 배포한다.

```powershell
.\deploy.ps1
```

Rules는 변경하지 않았으므로 Rules 단독 재배포는 필요하지 않다. `firebase deploy --only firestore`로 Rules와 인덱스를 함께 다시 배포해도 무방하다.
