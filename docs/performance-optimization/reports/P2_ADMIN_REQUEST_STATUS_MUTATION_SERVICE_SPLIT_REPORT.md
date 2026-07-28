# P2 관리자 신청 상태 변경 Transaction Service 분리 보고서

## 1. 작업 목적

`App.jsx`에 남아 있던 일반 관리자 신청 상태 변경 transaction을 기존 관리자 신청 mutation service로 이동했다.

대상 상태 변경은 다음과 같다.

- 신청 대기 → 승인
- 신청 대기 → 보류
- 신청 대기 → 불허
- 보류 → 승인
- 보류 → 불허
- 승인 → 반납 완료

이번 작업은 화면이나 Firestore 구조를 변경하지 않고, transaction의 소유 위치만 관리자 신청 전용 동적 service로 이동하는 구조 개선이다.

## 2. 수정 파일

- `src/App.jsx`
- `src/features/requests/adminRequestMutationService.js`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

신규 보고서·검증·diff·측정 자료는 `docs/performance-optimization` 하위에만 저장한다.

## 3. 변경 전 구조

```text
App.jsx
└─ updateRequest(id, status)
   ├─ 관리자 인증 확인
   ├─ 연체 신청 추가 조회
   ├─ runTransaction()
   │  ├─ 신청 문서 재조회
   │  ├─ 자산 문서 재조회
   │  ├─ 반납 시 publicConfig 재조회
   │  ├─ 반납 시 restriction 재조회
   │  ├─ 최신 상태 전이 재검증
   │  ├─ 예약 기간 충돌 검사
   │  ├─ rentalAvailability 저장·삭제
   │  ├─ 자산 reservations·status 갱신
   │  ├─ 연체 제한 및 연관 신청 갱신
   │  └─ STATUS_CHANGED 감사 로그 저장
   ├─ 패널 목록 반영
   ├─ 전역 자산·예약 상태 반영
   └─ 토스트 표시
```

`App.jsx`가 애플리케이션 화면 제어와 Firestore 도메인 transaction을 동시에 담당했다.

## 4. 변경 후 구조

```text
App.jsx
└─ updateRequest(id, status)
   ├─ 관리자 인증·현재 화면 신청 확인
   ├─ 반납 시 다른 연체 신청 존재 여부 조회
   ├─ adminRequestMutationService 동적 로드
   ├─ executeAdminRequestStatusChangeMutation()
   ├─ 반환된 확정 결과를 패널·전역 상태에 반영
   └─ 기존 성공·오류 토스트 표시

adminRequestMutationService.js
└─ executeAdminRequestStatusChangeMutation()
   ├─ 최신 신청·자산 문서 재조회
   ├─ 최신 상태 전이 검증
   ├─ 반납 정책·제한 문서 재조회
   ├─ 연체 반납 결과 계산
   ├─ 기간 충돌 검사
   ├─ availability 저장·삭제
   ├─ 자산 예약과 대표 상태 갱신
   ├─ 제한 및 연관 신청 side effect
   └─ 감사 로그 저장
```

신규 함수는 기존부터 동적 import되던 `adminRequestMutationService.js`에 추가했다. 따라서 일반 사용자 최초 경로에는 포함되지 않는다.

## 5. 신규 service 함수

```js
executeAdminRequestStatusChangeMutation({
  actualReturnDate,
  auditActor,
  currentRequest,
  hasOtherCurrentOverdueRequests,
  nextStatus,
  overdueBatchId,
  requestId,
  settings,
});
```

반환값은 다음과 같다.

```js
{
  committedAsset,
  committedAvailabilityRequest,
  committedRequest,
  shouldKeepAvailability,
}
```

`App.jsx`는 service가 transaction에서 확정한 객체만 화면 상태에 반영한다.

## 6. 유지된 transaction 규칙

### 상태 전이

최신 신청 문서를 transaction 안에서 다시 읽고 `RENTAL_REQUEST_STATUS_TRANSITIONS`를 재검증한다. 화면에서 확인한 상태가 이후 변경된 경우 잘못된 전이를 차단한다.

### 예약 점유 상태

`RENTAL_BLOCKING_REQUEST_STATUSES`에 포함되는 상태만 `rentalAvailability`와 자산 `reservations`에 유지한다.

### 충돌 검사

승인·보류 등 예약을 점유하는 상태로 변경할 때 현재 신청을 제외한 최신 자산 예약을 기준으로 기간 충돌을 다시 검사한다.

### 자산 대표 상태

변경된 예약 배열에서 대표 신청을 다시 계산하고 다음 값을 함께 갱신한다.

- `rentalAssets/{assetId}.reservations`
- `rentalAssets/{assetId}.status`
- `rentalAssets/{assetId}.currentRequestId`

### 반납 완료와 연체 처리

승인 상태를 반납 완료로 변경할 때 다음 처리를 기존과 동일한 transaction 안에서 수행한다.

- 실제 반납일 저장
- 연체 일수와 패널티 필드 저장
- `rentalRestrictions/{uid}` 갱신
- 동일 패널티 배치의 다른 신청 `overduePenaltyPending` 정리
- availability 삭제
- 자산 예약 제거 및 대표 상태 재계산

### 감사 로그

`rentalRequestLogs`에 `STATUS_CHANGED` 로그를 저장하며 기존 actor·상태·메모 필드를 유지한다.

## 7. 오류 처리 유지

다음 오류 코드는 기존과 동일하게 `App.jsx`에서 한국어 토스트로 변환한다.

- `rental-request-not-found`
- `rental-asset-not-found`
- `invalid-rental-status-transition`
- `rental-period-conflict`
- `rental-status-transaction-result-missing`

기존 충돌 기간 표시와 Firebase 오류 코드 표시도 유지한다.

## 8. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 17,404 | 17,068 | -336 |
| `App.jsx` 크기 | 506,106 bytes | 497,678 bytes | -8,428 bytes |
| service 줄 수 | 516 | 816 | +300 |
| service 크기 | 13,370 bytes | 21,373 bytes | +8,003 bytes |
| `App.jsx` 직접 `runTransaction()` | 16 | 15 | -1 |
| `App.jsx` 직접 `transaction.get()` | 41 | 37 | -4 |

service 증가분은 동적 경로에 위치한다.

## 9. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32 | 32 | 0 |
| 초기 정적 소스 | 725,271 bytes | 716,843 bytes | -8,428 bytes |
| 감소율 | - | - | 약 1.16% |
| 동적 진입점 | 14 | 14 | 0 |

기존 동적 진입점 `src/features/requests/adminRequestMutationService.js`가 확장된 것이므로 동적 진입점 수는 증가하지 않았다.

## 10. Firestore 영향

일반 조회 감사 대상 호출은 변경되지 않았다.

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 | 123 | 123 |
| `onSnapshot()` | 32 | 32 |
| `getDocs()` | 48 | 48 |
| `getDoc()` | 23 | 23 |
| `getCountFromServer()` | 20 | 20 |

Rules, 인덱스, 컬렉션, 문서 필드는 변경하지 않았다.

## 11. 런타임 모의검사

메모리 Firestore transaction을 사용해 다음 5개 시나리오를 직접 실행했다.

1. 신청 대기 → 승인
2. 신청 대기 → 불허
3. 승인 → 연체 반납 완료
4. 허용되지 않은 상태 전이 차단
5. 다른 예약과 기간 충돌 차단

확인 결과:

```text
admin request status change mutation mock: PASS (5 scenarios)
```

## 12. 배포 범위

웹 소스만 변경됐다. Firestore Rules와 인덱스는 별도로 배포할 필요가 없다.
