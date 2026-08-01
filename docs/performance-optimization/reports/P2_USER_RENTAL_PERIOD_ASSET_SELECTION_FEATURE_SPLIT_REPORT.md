# 사용자 대여 기간 입력·선택 자산 가드 분리 보고서

## 기준본과 산출물

- 기준본: `rental-system-admin-navigation-controller-split-20260801_2340_deployment_package.zip`
- 산출물: `rental-system-user-rental-period-asset-selection-split-20260801_2354_deployment_package.zip`
- 작업 유형: `App.jsx` 사용자 대여 신청 UI·효과 책임 분리

## 작업 목적

직전 단계의 다음 순차 작업 1번에 따라 `App.jsx`가 직접 소유하던 다음 두 책임을 분리했습니다.

1. 대여 시작일·반납 예정일 입력 UI와 날짜 검증·자동 보정·토스트 처리
2. 선택한 자산이 대여 기간 변경 또는 자산 상태 변경으로 신청 불가가 되었을 때 선택을 자동 해제하는 효과

기존 사용자 화면 구조, 날짜 계산 정책, 토스트 문구, Firestore 데이터 구조 및 신청 저장 흐름은 변경하지 않았습니다.

## 신규 모듈

### `src/user/UserRentalPeriodFields.jsx`

다음 동작을 전용 사용자 UI 컴포넌트로 이동했습니다.

- 대여 시작일의 오늘 이전 입력 차단
- 휴무일 시작일을 다음 영업일로 조정
- 시작일 변경 시 최대 반납 예정일 재계산
- 반납 예정일의 시작일 이전 입력 차단
- 최대 대여 기간 초과 입력 차단
- 휴무일 반납 예정일을 다음 영업일로 조정
- 임시 날짜 입력값과 blur 확정 처리
- 기존 오류·성공 토스트 문구 유지

이 컴포넌트는 동적 로딩되는 `UserRentalPanel.jsx`에서 직접 import합니다. 따라서 사용자 대여 신청 화면을 열기 전의 초기 정적 모듈에는 포함되지 않습니다.

### `src/features/requests/useSelectedRentalAssetAvailabilityGuard.js`

다음 선택 자산 보호 로직을 전용 훅으로 이동했습니다.

- 선택 기간과 기존 신청 기간 중복 시 자동 선택 해제
- 자산 자체가 대여불가 상태로 전환된 경우 자동 선택 해제
- 기타 신청 불가 상태의 fallback 자동 선택 해제
- 기존 선택 해제 토스트 문구와 effect 의존성 유지

## 기존 파일 변경

### `src/App.jsx`

- 날짜 입력 UI 275줄 제거
- 선택 자산 자동 해제 effect 제거
- 날짜 보정 전용 import 제거
- 선택 자산 가드 훅 호출만 유지
- `rentalPeriodFields` 컨텍스트 공급 제거

### `src/user/UserRentalPanel.jsx`

- `UserRentalPeriodFields`를 직접 import
- 기존 대여 기간 선택 위치에 전용 컴포넌트 렌더링
- `triggerToast`를 화면 컨텍스트에서 직접 수신

### `src/context/appContextSlices.js`

- 사용되지 않게 된 `rentalPeriodFields` 키 제거
- 날짜 컴포넌트가 필요로 하는 `triggerToast` 키 추가
- 사용자 대여 화면 컨텍스트 키 수는 47개로 유지

## 기능 보존 검증

- 시작일 빈 값, 임시 입력, 과거일, 휴무일 보정 runtime mock 통과
- 반납일 빈 값, 시작일 이전, 최대 기간 초과, 휴무일 보정 runtime mock 통과
- 선택 자산 미선택·정상 상태·기간 중복·자산 대여불가·기타 차단 사유 runtime mock 통과
- 전체 한국어 문자열 고유 집합과 발생 횟수 동일
- Firestore 호출 위치와 호출 수 동일
- 사용자 대여 화면의 표시 순서와 전달 데이터 계약 유지

## 소스 규모

| 항목 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,855 | 2,566 | -289 |
| `App.jsx` 바이트 | 86,834 | 77,352 | -9,482 |
| `App.jsx` `useEffect()` | 2 | 1 | -1 |
| `UserRentalPanel.jsx` 줄 수 | 398 | 405 | +7 |
| 신규 날짜 UI 컴포넌트 | 0 | 292줄 / 9,141 bytes | 신규 |
| 신규 선택 자산 가드 | 0 | 45줄 / 1,230 bytes | 신규 |

## 초기 소스 그래프

| 항목 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 82 | 83 | +1 |
| 초기 정적 소스 | 885,284 bytes | 877,026 bytes | -8,258 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

초기 정적 모듈은 선택 자산 가드 훅 1개가 추가됐지만, 날짜 입력 UI와 관련 날짜 helper 의존성이 사용자 대여 화면의 동적 경계로 이동해 초기 정적 소스는 8,258 bytes 감소했습니다.

## Firestore 영향

| 항목 | 기준본 | 수정본 |
|---|---:|---:|
| 전체 감사 대상 호출 | 129 | 129 |
| `onSnapshot` | 35 | 35 |
| `getDocs` | 48 | 48 |
| `getDoc` | 28 | 28 |
| `getCountFromServer` | 18 | 18 |

Firestore Rules, 인덱스, Firebase 설정 및 감사 정책은 변경하지 않았습니다.

## 실제 빌드 제한

검증 환경의 내부 npm 저장소가 `yargs-parser-21.1.1.tgz` 요청에 E404를 반환해 `npm ci`와 Vite 프로덕션 빌드를 완료하지 못했습니다. 실제 프로젝트 PC의 `deploy.ps1`에서 `npm run build`와 최종 배포 완료 메시지를 확인해야 합니다.

## 다음 순차 작업

1. 실제 소비되지 않는 컨텍스트 공급값 최종 감사
2. 사용자·관리자 주요 흐름 회귀 검사
3. 최종 소스 그래프 및 로컬 Vite 프로덕션 빌드 검증
