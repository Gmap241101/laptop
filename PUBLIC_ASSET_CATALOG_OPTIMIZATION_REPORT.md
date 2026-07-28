# 공개 자산 카탈로그 및 잔여 리스너 검토 보고서

## 1. 기준본

- 기준 패키지: `firestore_read_optimization_runtime_fix_deployment_package.zip`
- 이전 Firestore 읽기 최적화와 빈 화면 런타임 보완이 반영된 최신본을 사용했다.
- 수정 파일:
  - `src/App.jsx`
  - `src/firebase.js`
  - `rules/firestore.rules`
- 배포 편의를 위해 다음 파일을 패키지에 추가했다.
  - `firebase.json`
  - `.firebaserc`
  - `deploy.ps1`

## 2. 순차 작업 상태

### 잔여 전역 단일 문서 리스너 검토

다음 단일 문서 리스너는 제거하지 않고 유지했다.

| 문서 | 유지 이유 |
|---|---|
| `siteSettings/config` | 점검 모드, 읽기 전용 모드, 사이트 명칭과 색상 등 운영 상태를 접속 중인 사용자에게 즉시 반영해야 함 |
| `securityPolicies/userSession` | 사용자 세션 만료와 재로그인 정책 변경을 접속 중인 사용자에게 즉시 반영해야 함 |
| `rentalSystem/publicConfig` | 대여 정책, 카테고리, 부서 설정 등 공통 운영 정책을 즉시 반영해야 함 |
| `systemSettings/admin` | 관리자 인증 후에만 1문서를 구독하며 관리자 세션 보안 정책에 사용됨 |

이 리스너들은 각각 단일 문서이며, 전체 컬렉션 구독과 비교하면 읽기 영향이 작다. 기능 안전성을 위해 유지하는 것이 타당하다.

### 우선순위 4: 사용자용 공개 카탈로그 단일 문서

완료했다.

새 문서 경로:

```text
publicCatalog/main
```

문서 구조:

```text
schemaVersion
assets[]
assetCount
fingerprint
updatedAt
updatedByUid
```

## 3. 사용자 화면 읽기 구조 변경

### 수정 전

사용자 홈 또는 대여 화면에 들어가면 다음을 실시간 구독했다.

```text
rentalAssets 전체 문서
rentalAvailability 전체 문서
```

자산이 30대면 자산 목록만 약 30회 읽기가 발생했다.

### 수정 후

```text
publicCatalog/main 1문서
rentalAvailability 활성 문서
```

자산 30대 기준 자산 기본정보 읽기는 약 30회에서 1회로 감소한다.

```text
접속 1회당 약 29회 절감
```

예약·대여 상태는 기존 `rentalAvailability` 문서들과 공개 카탈로그를 브라우저에서 결합한다.

## 4. 카탈로그에 포함하는 자산 필드

```text
id
category
assetNo
serialNo
model
manufactureDate
photo
note
baseStatus
```

다음 동적 필드는 카탈로그에 저장하지 않는다.

```text
reservations
currentRequestId
신청·예약에 의해 변하는 status
```

동적 상태를 카탈로그에서 제외했기 때문에 대여 신청·승인·반납 때마다 카탈로그 전체를 다시 쓸 필요가 없다.

`baseStatus`는 관리자가 직접 설정한 사용 불가 상태만 보존한다. 예약·대여 상태는 `rentalAvailability`를 기준으로 다시 계산한다.

## 5. 관리자 카탈로그 동기화

관리자가 다음 메뉴를 열면 원본 `rentalAssets`를 구독한다.

```text
대시보드
dashboard
대여 자산 관리
대여 신청 관리
자산 카테고리 관리
데이터 관리
```

원본 자산에서 공개 필드만 추출해 fingerprint를 계산한다.

- 원격 카탈로그 fingerprint가 같으면 쓰지 않음
- 자산 추가·수정·삭제·카테고리 변경·복원으로 공개 필드가 바뀐 경우에만 카탈로그 갱신
- 예약 배열과 동적 상태만 바뀌면 fingerprint가 같으므로 갱신하지 않음
- 연속 변경은 400ms 지연 후 최신 fingerprint만 반영

관리자 최초 로그인 시 대시보드에서 카탈로그가 자동 생성된다.

## 6. 최초 배포 호환 처리

`publicCatalog/main`이 아직 없거나 Rules 배포 전이라 읽지 못하면 사용자 화면은 기존 `rentalAssets`를 일회성으로 읽는다.

이 호환 경로는 다음 목적이다.

- Rules와 프런트엔드 배포 순서 차이로 빈 화면이 발생하지 않도록 함
- 관리자 최초 로그인 전에도 자산 목록 표시
- 카탈로그 생성 후에는 실시간 카탈로그 1문서 방식으로 자동 전환

호환 경로에서는 기존 전체 자산 읽기가 한 번 발생할 수 있다.

## 7. 보안 규칙

추가 규칙:

```text
/publicCatalog/main
```

권한:

- 읽기: 공개
- 생성·수정: 관리자만
- 삭제: 금지
- 스키마 버전 1 확인
- `assets` 배열 확인
- 최대 200개 확인
- `assetCount`와 실제 배열 개수 일치 확인

일반 사용자는 카탈로그를 쓸 수 없다.

## 8. 문서 크기 안전장치

Firestore 단일 문서 최대 크기를 넘지 않도록 클라이언트에서 카탈로그 직렬화 크기를 검사한다.

```text
안전 상한: 900,000 bytes
```

안전 상한을 초과하면 자동 동기화를 중단하고 관리자 화면에 오류를 표시한다.

30개 대표 자산 데이터로 계산한 테스트 크기는 약 9KB였다.

## 9. 배포 순서

Rules가 변경됐으므로 프런트엔드보다 먼저 실행한다.

```powershell
Set-Location "E:\project\rental-system\test_new"
firebase deploy --only firestore:rules
.\deploy.ps1
```

기존 방식대로 다음 명령을 사용해도 된다.

```powershell
firebase deploy --only firestore
.\deploy.ps1
```

신규 복합 인덱스는 추가하지 않았으므로 이번 단계에서는 인덱스 재생성이 필요하지 않다.

프런트엔드 배포 후 관리자 로그인 화면에서 로그인하고 기본 대시보드를 한 번 열면 `publicCatalog/main`이 자동 생성된다.

## 10. 예상 효과

자산 30대 기준:

| 구분 | 기존 | 수정 후 |
|---|---:|---:|
| 자산 기본정보 초기 읽기 | 약 30 | 1 |
| 예약 현황 읽기 | 동일 | 동일 |
| 접속당 자산 읽기 절감 | - | 약 29 |

예를 들어 사용자 홈·대여 진입이 하루 100회라면 자산 기본정보에서만 약 2,900회 읽기를 줄일 수 있다.

## 11. 다음 우선순위

다음 순차 작업은 우선순위 6인 대시보드 요약 문서 도입이다.

```text
dashboardSummary/main
```

다만 실제 프로젝트 전체 기준 ZIP을 다시 제공받은 뒤 수행해야 `package.json`, `public`, 배포 설정과 함께 프로덕션 빌드까지 검증할 수 있다.
