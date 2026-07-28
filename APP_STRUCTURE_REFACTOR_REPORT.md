# App.jsx 구조 분리 1차 적용 보고서

## 1. 기준본

- 기준 패키지: `rental-system-react-lazy-dashboard-read-optimization-deployment-package.zip`
- 이전 단계 반영 상태:
  - Firestore 읽기 최적화
  - 공개 자산 카탈로그
  - 관리자 대시보드 요약 문서
  - 대시보드 2분 자동 폴링 제거
  - 관리자 화면 React.lazy 코드 분할

## 2. 작업 목적

`src/App.jsx`에 집중된 순수 도메인 규칙, Firestore 집계 서비스, 라우팅, 쿼리 생성기와 공통 훅을 기능별 모듈로 분리했습니다. 화면 문구, Firestore 컬렉션·문서 경로, 권한 규칙과 사용자 동작은 변경하지 않았습니다.

## 3. 변경 파일

### 수정

- `src/App.jsx`

### 신규

- `src/constants/memberConstants.js`
- `src/domain/rentalPolicy.js`
- `src/hooks/useDashboardSummary.js`
- `src/hooks/useDebouncedValue.js`
- `src/routing/appRoutes.js`
- `src/services/adminRequestQuery.js`
- `src/services/dashboardSummaryService.js`
- `src/services/publicAssetCatalog.js`

## 4. 분리 내용

### 4.1 대여 정책 도메인

`src/domain/rentalPolicy.js`

- 대여 가능 여부 판단
- 동일 자산 중복·기간 겹침 판단
- 휴일 정규화 및 영업일 계산
- 대여 시작일·반납일 조정
- 최대 대여일 계산
- 대여 연장 가능 여부와 연장 기간 계산
- 연체 정책과 대여 정책 결합 정규화

### 4.2 공개 자산 카탈로그 서비스

`src/services/publicAssetCatalog.js`

- 예약 현황 문서 정규화
- 공개 자산 필드 정규화
- 카탈로그 fingerprint·용량 계산
- 공개 자산과 예약 현황 결합

### 4.3 관리자 대시보드 서비스·훅

`src/services/dashboardSummaryService.js`

- Firestore 원본 조회 및 count 집계
- 공개 카탈로그 자동 복구
- 대시보드 요약 payload 생성·저장
- 요약 문서 정규화

`src/hooks/useDashboardSummary.js`

- 대시보드 요약 상태 관리
- 요약 문서 실시간 구독
- 최초·오래된 요약 갱신
- 관리 작업 후 대시보드 복귀 갱신
- 수동 갱신 상태와 오류 처리

### 4.4 관리자 신청 쿼리

`src/services/adminRequestQuery.js`

- 관리자 신청 탭·빠른 필터별 서버 쿼리 제약조건
- 관리자 신청 탭·빠른 필터별 count 제약조건

### 4.5 라우팅

`src/routing/appRoutes.js`

- 사용자·관리자 URL 매핑
- 로그인 후 복귀 대상 저장·복원
- 계정 상태 화면 세션 저장
- History API push/replace 처리

### 4.6 공통 훅·상수

- `src/hooks/useDebouncedValue.js`: 검색 입력 디바운스
- `src/constants/memberConstants.js`: 회원 상태와 프로필 재확인 사유

## 5. App.jsx 감소

| 구분 | 이전 | 수정 후 | 감소 |
|---|---:|---:|---:|
| 파일 크기 | 658,943 bytes | 610,687 bytes | 48,256 bytes |
| 줄 수 | 22,855줄 | 21,099줄 | 1,756줄 |

이번 작업은 구조 분리 1차 단계입니다. `App.jsx`에 남은 관리자 계정·회원 관리·대여 처리 액션과 대규모 상태 묶음은 후속 단계에서 기능별 훅으로 추가 분리할 수 있습니다.

## 6. 동작 보존

다음 항목은 변경하지 않았습니다.

- 사용자·관리자 화면 문구
- Firestore 컬렉션 및 문서 경로
- Firestore Rules와 인덱스
- 대여 신청·승인·반납·연장 로직
- 회원가입·로그인·계정 복구 흐름
- 공개 카탈로그 문서 구조
- 대시보드 요약 문서 구조
- 대시보드 갱신 정책
- 관리자 React.lazy 적용 구조

## 7. 배포 영향

이번 변경은 프런트엔드 소스 구조만 변경했습니다.

- Firebase Rules 재배포: 불필요
- Firestore 인덱스 재배포: 불필요
- 웹 프로젝트 배포: 필요

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```

## 8. 검증 결과

- JavaScript·JSX 구문 검사: 52개 파일, 오류 0건
- 로컬 import/export 연결: 통과
- 이동된 함수의 누락 import 검사: 통과
- 순수 도메인·카탈로그·라우팅 런타임 검사: 통과
- 대시보드 서비스·관리자 쿼리 런타임 검사: 통과
- 기존 한국어 문자열 비교: 추가 0건, 삭제 0건
- ZIP 표준 경로·무결성 검사: 통과

실행 환경의 npm 패키지 저장소 응답이 완료되지 않아 Vite 프로덕션 빌드는 실행하지 못했습니다. 전체 JSX/JavaScript 파싱과 모듈 연결 검사는 별도로 완료했으며, 실제 PC의 `deploy.ps1`에서 `npm run build`가 최종 빌드 검사를 수행합니다.
