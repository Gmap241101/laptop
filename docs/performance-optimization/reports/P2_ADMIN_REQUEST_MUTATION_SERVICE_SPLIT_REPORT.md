# P2 관리자 신청 수정·상태 복구 트랜잭션 Service 분리 보고서

## 1. 작업 목적

이 단계는 `App.jsx`에 남아 있던 다음 두 관리자 신청 전용 Firestore transaction을 별도 service로 분리하는 작업이다.

- 관리자 신청정보 수정
- 관리자 신청 상태 복구

기존 단계에서 다이얼로그 상태와 처리 이력 구독은 `AdminRequestsPanel` 하위 feature로 이동했지만, 실제 Firestore transaction은 여전히 `App.jsx`에 약 600줄 규모로 남아 있었다. 이번 수정은 transaction의 문서 재조회·기간 충돌 검사·자산 예약 갱신·감사 로그 저장을 비 React service로 이동하고, 실제 관리자가 저장 또는 복구 버튼을 누를 때만 service를 동적 로드하도록 구성한다.

## 2. 기준 패키지

- 기준: `rental-system-p2-admin-request-detail-dialog-feature-split-deployment-package.zip`
- 기준 `App.jsx`: 17,942줄, 519,468 bytes
- 기준 초기 정적 소스: 738,633 bytes
- 기준 Firestore 접근 감사 호출: 123개

## 3. 변경 파일

### 수정

- `src/App.jsx`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/requests/adminRequestMutationService.js`
- `docs/performance-optimization/reports/P2_ADMIN_REQUEST_MUTATION_SERVICE_SPLIT_REPORT.md`
- `docs/performance-optimization/validation/P2_ADMIN_REQUEST_MUTATION_SERVICE_SPLIT_VALIDATION_REPORT.txt`
- `docs/performance-optimization/diffs/P2_ADMIN_REQUEST_MUTATION_SERVICE_SPLIT.diff`
- `docs/performance-optimization/measurements/P2_ADMIN_REQUEST_MUTATION_SERVICE_SOURCE_GRAPH_COMPARISON.json`

### 변경하지 않은 영역

- Firestore Rules
- Firestore 인덱스
- Firebase 설정
- 컬렉션·문서 구조
- 관리자 신청 다이얼로그 JSX와 className
- 신청 상태 전이표
- 감사 로그 action 값
- 자산 예약 대표 신청 계산 방식
- 공개 화면과 사용자 신청 처리 로직

## 4. 수정 전 구조

```text
App.jsx
├─ commitAdminRequestEdit()
│  ├─ 입력 검증
│  ├─ 신청 문서 transaction.get
│  ├─ 자산 문서 transaction.get
│  ├─ 기간 충돌 검사
│  ├─ rentalAvailability 저장
│  ├─ 자산 reservations 갱신
│  ├─ 신청 문서 갱신
│  └─ REQUEST_EDITED 감사 로그 저장
│
└─ commitAdminRequestStatusRestore()
   ├─ 상태 전이 검증
   ├─ 신청·자산 문서 transaction.get
   ├─ 기간 충돌 검사
   ├─ rentalAvailability 저장 또는 삭제
   ├─ 자산 reservations·status 갱신
   ├─ 신청 상태 갱신
   └─ STATUS_RESTORED 감사 로그 저장
```

이 구조에서는 일반 사용자가 접속하더라도 두 transaction 구현 전체가 초기 정적 JavaScript 경로에 포함됐다.

## 5. 수정 후 구조

```text
App.jsx
├─ 동적 service loader
├─ 화면·인증 사전 확인
├─ service 실행
├─ 관리자 신청 패널 목록 반영
├─ App 전역 자산·예약 상태 반영
└─ 성공·오류 토스트 표시

adminRequestMutationService.js
├─ executeAdminRequestEditMutation()
│  ├─ 입력·기간 검증
│  ├─ 신청·자산 문서 transaction 재조회
│  ├─ 기간 충돌 검사
│  ├─ availability·asset·request 갱신
│  └─ REQUEST_EDITED 감사 로그 저장
│
└─ executeAdminRequestStatusRestoreMutation()
   ├─ 복구 사유·상태 전이 검증
   ├─ 신청·자산 문서 transaction 재조회
   ├─ 기간 충돌 검사
   ├─ availability 저장 또는 삭제
   ├─ asset·request 갱신
   └─ STATUS_RESTORED 감사 로그 저장
```

## 6. 동적 service 로딩

`App.jsx`에 정적 import를 추가하지 않고 다음 loader를 추가했다.

```jsx
let adminRequestMutationServicePromise = null;

const loadAdminRequestMutationService = () => {
  if (!adminRequestMutationServicePromise) {
    adminRequestMutationServicePromise = import(
      './features/requests/adminRequestMutationService.js'
    ).catch((error) => {
      adminRequestMutationServicePromise = null;
      throw error;
    });
  }

  return adminRequestMutationServicePromise;
};
```

로드 시점은 다음과 같다.

| 사용자 행동 | service 로드 |
|---|---:|
| 일반 사용자 접속 | 안 함 |
| 관리자 로그인 | 안 함 |
| 관리자 신청 목록 조회 | 안 함 |
| 신청 상세 열기 | 안 함 |
| 신청정보 수정 저장 클릭 | 최초 로드 |
| 상태 복구 실행 클릭 | 최초 로드 |

로드가 실패하면 Promise를 초기화하므로 다음 실행에서 재시도할 수 있다.

## 7. 신청정보 수정 transaction 분리

신규 함수:

```js
executeAdminRequestEditMutation({
  auditActor,
  currentRequest,
  form,
  requestId,
  settings,
});
```

service가 수행하는 작업:

1. 부서·대여자·시작일·반납일 필수값 검증
2. 반납일이 시작일보다 빠른지 검증
3. 휴무일 반납일 자동 조정
4. transaction에서 최신 신청 문서 재조회
5. 활성 예약 상태인 경우 최신 자산 문서 재조회
6. 현재 신청을 제외한 예약 목록 재구성
7. 변경 기간의 충돌 여부 재검사
8. `rentalAvailability/{requestId}` 갱신
9. 자산 `reservations`, `status`, `currentRequestId` 갱신
10. 신청 문서의 부서·대여자·기간·목적·관리자 메모 갱신
11. `REQUEST_EDITED` 감사 로그 저장

service 반환값:

```js
{
  adminDueDateAdjusted,
  committedAsset,
  committedAvailabilityRequest,
  committedRequest,
  nextDueDate,
  shouldKeepAvailability,
}
```

`App.jsx`는 이 결과를 관리자 신청 패널과 전역 자산·예약 상태에 반영한다.

## 8. 상태 복구 transaction 분리

신규 함수:

```js
executeAdminRequestStatusRestoreMutation({
  auditActor,
  currentRequest,
  nextStatus,
  requestId,
  restoreReason,
  settings,
});
```

service가 수행하는 작업:

1. 복구 사유 필수 검증
2. 현재 상태에서 복구 대상 상태로 이동 가능한지 사전 검증
3. transaction에서 최신 신청 문서 재조회
4. 최신 상태 기준 상태 전이 재검증
5. 신청 기간 유효성 검증
6. 최신 자산 문서 재조회
7. 현재 신청을 제외한 예약 목록 재구성
8. 복구 대상 상태가 활성 예약 상태인 경우 기간 충돌 재검사
9. 활성 상태이면 availability 저장, 비활성 상태이면 삭제
10. 자산 `reservations`, `status`, `currentRequestId` 갱신
11. 신청 상태와 `userActionRequest` 갱신
12. `STATUS_RESTORED` 감사 로그 저장

service 반환값:

```js
{
  committedAsset,
  committedAvailabilityRequest,
  committedRequest,
  shouldKeepAvailability,
}
```

## 9. 오류 전달 방식

service는 화면 요소나 토스트에 직접 의존하지 않는다. 기존 오류 코드를 `Error.message`로 전달하고 `App.jsx`가 기존 한국어 메시지를 표시한다.

주요 오류 코드:

```text
required-rental-edit-fields-missing
invalid-rental-edit-period
restore-reason-missing
admin-audit-actor-missing
rental-period-conflict
invalid-rental-period
invalid-rental-status-transition
rental-request-not-found
rental-asset-not-found
rental-request-edit-result-missing
rental-status-restore-result-missing
```

기존 사용자 표시 문구와 충돌 기간 표시 형식은 유지했다.

## 10. Firestore 저장 구조 유지

### 신청정보 수정

```text
rentalRequests/{requestId}        update
rentalAvailability/{requestId}    set, 활성 예약 상태인 경우
rentalAssets/{assetId}            update, 활성 예약 상태인 경우
rentalRequestLogs/{generatedId}   set REQUEST_EDITED
```

### 상태 복구

```text
rentalRequests/{requestId}        update
rentalAvailability/{requestId}    set 또는 delete
rentalAssets/{assetId}            update
rentalRequestLogs/{generatedId}   set STATUS_RESTORED
```

새로운 컬렉션이나 문서 필드는 추가하지 않았다.

## 11. `App.jsx` 감소

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 17,942 | 17,404 | **-538** |
| 크기 | 519,468 bytes | 506,106 bytes | **-13,362 bytes** |
| 직접 `runTransaction()` 호출 | 17개 | 15개 | **-2개** |
| 직접 `transaction.get()` 호출 | 45개 | 41개 | **-4개** |

신규 service:

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `adminRequestMutationService.js` | 516 | 13,370 bytes |

## 12. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32개 | 32개 | 동일 |
| 초기 정적 소스 | 738,633 bytes | 725,271 bytes | **-13,362 bytes** |
| 초기 소스 감소율 | — | — | **약 1.81%** |
| 최상위 동적 진입점 | 13개 | 14개 | +1개 |

추가된 동적 진입점:

```text
src/features/requests/adminRequestMutationService.js
```

service는 관리자 신청 패널 자체를 여는 것만으로는 로드되지 않고 실제 수정 또는 복구 실행 때 로드된다.

## 13. Firestore 감사 결과

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 감사 대상 호출 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

`transaction.get()` 위치 이동은 기존 감사 집계 수에 영향을 주지 않는다. Firestore Rules와 인덱스 수정도 없다.

## 14. 동작 모의검사

Firebase SDK와 transaction을 메모리 mock으로 대체해 신규 service를 직접 실행했다.

검증한 시나리오:

1. 신청정보 수정 및 휴무일 반납일 자동 조정
2. 신청정보 수정 시 다른 예약과 기간 충돌
3. 상태 복구로 비활성 상태 전환 시 availability 삭제와 자산 예약 제거
4. 허용되지 않은 상태 전이 차단

결과:

```text
adminRequestMutationService runtime mock: PASS (4 scenarios)
```

## 15. 검증 결론

- React Hook import 감사 통과
- 전체 JS·JSX·MJS 변환 검사 통과
- 상대 import 누락 없음
- 미정의 식별자 없음
- Firestore 엄격 감사 통과
- 신규 service 런타임 mock 통과
- 초기 정적 소스 13,362 bytes 감소
- Firestore 호출 수·Rules·인덱스·문서 구조 변화 없음

실제 Vite 프로덕션 번들은 검증 환경에 `vite` 실행 파일이 없어 생성하지 못했다. 실제 프로젝트 PC에서는 `deploy.ps1` 실행 전 `npm run build`로 확인해야 한다.
