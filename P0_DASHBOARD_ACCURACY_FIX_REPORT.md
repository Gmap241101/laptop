# P0 관리자 대시보드 통계 정확성 수정 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-react-profiler-bundle-optimization-deployment-package.zip`
- 작업일: 2026-07-28
- 우선순위: P0
- 대상 문제: 관리자 대시보드 통계가 최근 100건의 진행 신청만 기준으로 계산될 수 있는 문제

## 2. 원인

기존 `refreshDashboardSummaryDocument()`는 진행 신청 쿼리에 `limit(100)`을 적용한 뒤, 그 결과를 상세 미리보기뿐 아니라 다음 통계 계산에도 사용했습니다.

- 대여 가능 자산 수
- 예약 자산 수
- 대여 중 자산 수
- 연체 자산 및 사용자 수
- 누락 날짜, 잘못된 기간, 미등록 자산, 신청자 정보 누락

진행 신청이 100건을 넘으면 최근 100건 밖의 승인·예약·보류 신청이 통계에서 제외될 수 있었습니다.

## 3. 수정 내용

### 3.1 전체 통계와 상세 미리보기 분리

진행 신청 전체를 한 번 조회해 `allActiveRequests`로 유지하고, 대시보드 문서에 저장하는 상세 목록만 최근 100건으로 제한했습니다.

```js
const allActiveRequests = activeRequestSnapshot.docs.map(...);
const activeRequests = [...allActiveRequests]
  .sort(...)
  .slice(0, ADMIN_DASHBOARD_ACTIVE_REQUEST_LIMIT);
```

### 3.2 전체 진행 신청 기준으로 계산하는 항목

- 신청 대기, 보류, 승인 건수
- 사용자 변경 요청 대기 건수
- 연체, 오늘 반납, 오늘 시작 건수
- 대여 가능 자산
- 예약·대여·연체 자산 수
- 연체 사용자 수
- 최장 연체일
- 최장 승인 대기일
- 진행 신청 데이터 이상 건수

### 3.3 `rentalAvailability` 정합성 검사

`rentalAvailability` 전체 문서를 읽어 진행 신청 문서가 존재하지 않는 고아 예약 요약을 정확하게 계산합니다.

### 3.4 불필요한 집계 쿼리 감소

전체 진행 신청 조회 결과에서 직접 계산할 수 있는 다음 집계 쿼리를 제거했습니다.

- 신청 대기 count
- 보류 count
- 승인 count
- 사용자 요청 대기 count
- 연체 count
- 오늘 반납 count
- 오늘 시작 count

다음 집계만 유지합니다.

- 종료 처리 건수
- 반납 완료 건수
- 승인 대기 회원 전체 건수

### 3.5 요약 스키마 버전 갱신

- `DASHBOARD_SUMMARY_SCHEMA_VERSION`: 1 → 2
- Firestore Rules 허용 버전: 1 → 2

기존 스키마 1 요약 문서는 새 코드에서 오래된 요약으로 판단되어 자동 재생성됩니다.

### 3.6 대시보드 안내 문구 정정

상세 미리보기만 최근 100건으로 제한되며, 상태 숫자와 데이터 점검 수치는 전체 진행 신청 기준임을 명시했습니다.

## 4. 변경 파일

```text
src/services/dashboardSummaryService.js
src/admin/AdminDashboardPanel.jsx
rules/firestore.rules
```

## 5. 읽기 비용 변화

요약 갱신 시 진행 신청이 100건을 초과하면 전체 진행 신청 수만큼 문서 읽기가 발생합니다. 이는 통계 정확성을 보장하기 위한 의도된 변경입니다.

반면 기존에 별도로 실행하던 7개의 집계 쿼리를 제거했습니다. 요약은 주기적으로 폴링하지 않고 다음 경우에만 갱신됩니다.

- 요약 문서가 없거나 스키마가 다른 경우
- 대시보드 진입 시 요약이 15분 이상 오래된 경우
- 관련 관리자 작업 후 대시보드로 복귀한 경우
- 관리자가 수동 갱신한 경우

## 6. 배포 순서

Rules 스키마 버전이 변경됐으므로 반드시 Firestore Rules를 먼저 배포합니다.

```powershell
Set-Location "E:\project\rental-system\test_new"
firebase deploy --only firestore:rules
.\deploy.ps1
```

## 7. 검증

125개의 진행 신청을 사용한 모의 테스트에서 다음 결과를 확인했습니다.

- 상세 미리보기: 100건 유지
- 전체 통계 원본: 125건
- 최근 100건 밖의 승인 신청 25건 통계 포함
- 대여 가능 자산: 전체 진행 신청 기준 계산
- 고아 `rentalAvailability`: 정확히 검출
- 전체 JSX/JavaScript 56개 파일 변환 검사 통과
- Rules 중괄호 균형 통과
