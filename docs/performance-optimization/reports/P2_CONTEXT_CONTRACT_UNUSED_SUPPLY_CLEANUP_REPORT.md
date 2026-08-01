# Context 계약 미사용 공급값 정리 보고서

## 기준본과 산출물

- 기준본: `rental-system-user-rental-period-asset-selection-split-20260801_2354_deployment_package.zip`
- 산출물: `rental-system-context-contract-unused-supply-cleanup-20260802_0010_deployment_package.zip`
- 작업 유형: 화면별 Context 계약 최종 감사 및 미사용 공급 경로 제거

## 작업 목적

직전 단계에서 예정한 다음 순차 작업에 따라 `APP_CONTEXT_GROUP_KEYS`의 화면별 공급 목록과 실제 소비 컴포넌트를 전수 대조했습니다. 기능·UI·Firestore 흐름을 변경하지 않고, 소비되지 않는 Context 항목과 그 항목만을 위해 유지되던 계산·조립 경로를 제거했습니다.

## 감사 결과

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 화면별 Context 항목 발생 수 | 806 | 793 | -13 |
| 실제 소비 항목 발생 수 | 793 | 793 | 0 |
| 미사용 공급 항목 | 13 | 0 | -13 |
| 누락 공급 항목 | 0 | 0 | 0 |
| 고유 Context 키 | 465 | 461 | -4 |
| 동적 공급 키 | 387 | 385 | -2 |
| 정적 공급 키 | 78 | 76 | -2 |

## 제거한 화면별 공급 항목

| Context 조각 | 제거 키 |
|---|---|
| `user.board` | `noticePostsPerPage` |
| `admin.shell` | `data`, `faqPosts`, `noticePosts` |
| `admin.requests` | `getDisplayRentalStatus` |
| `admin.holidaySettings` | `data` |
| `admin.siteSettings` | `data` |
| `admin.homeManagement` | `data` |
| `admin.serviceOperations` | `data` |
| `admin.dataManagement` | `data` |
| `admin.systemInfo` | `data` |
| `app.dialogs` | `addDaysFrom`, `userActionBorrowers` |

`data`, `faqPosts`, `noticePosts`는 다른 화면에서 계속 사용되므로 전역 공급 자체는 유지하고, 불필요했던 화면 조각에서만 제거했습니다.

## 전역 조립 경로 제거

모든 화면에서 더 이상 소비되지 않게 된 다음 네 키는 전역 Context 조립에서도 제거했습니다.

- 동적 공급: `noticePostsPerPage`, `userActionBorrowers`
- 정적 공급: `addDaysFrom`, `getDisplayRentalStatus`

`userActionBorrowers`는 현재 대화상자와 신청내역 화면에서 사용되지 않으므로 다음 연쇄 코드도 제거했습니다.

- `useUserRequestHistoryActionController`의 `dataBorrowers` 입력
- 부서별 대여자 목록을 계산하던 `useMemo`
- 컨트롤러 반환값과 `App.jsx` 구조 분해

## 변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `src/App.jsx` | 수정 | 불필요한 동적 Context 공급 2개와 컨트롤러 입력·반환 연결 제거, 기준본의 `selectedLaptopId` 중복 선언·가드 누락 전달 수정 |
| `src/context/appContextSlices.js` | 수정 | 실제 소비되지 않는 화면별 Context 항목 13개 제거 |
| `src/context/useAppContextAssembler.js` | 수정 | 전역 미사용 정적 공급값 2개 제거 |
| `src/features/requests/useUserRequestHistoryActionController.js` | 수정 | 미사용 대여자 필터 `useMemo`, 입력, 반환값 제거 |

## 기준본 컴파일 연결 오류 수정

의미 검증 중 직전 기준본에 포함된 다음 연결 오류를 확인했습니다.

- `useUserRentalRequestState()`에서 이미 선언한 `selectedLaptopId`를 `useRentalDerivedSelectors()` 반환값에서 다시 구조 분해하여 동일 스코프 중복 선언 발생
- `useSelectedRentalAssetAvailabilityGuard()`가 요구하는 `selectedLaptopId` 인수를 전달하지 않음

`useRentalDerivedSelectors()`는 해당 키를 반환하지 않으므로 잘못된 구조 분해만 제거하고, 원래 신청 상태의 `selectedLaptopId`를 선택 자산 가드에 전달했습니다. 기준본 대비 TypeScript 비교에서 중복 선언 2건과 필수 인수 누락 1건이 제거됐으며 신규 진단은 없습니다.

## 코드 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,566 | 2,564 | -2 |
| `App.jsx` 바이트 | 77,352 | 77,251 | -101 |
| `App.jsx` `useState()` | 14 | 14 | 0 |
| `App.jsx` `useEffect()` | 1 | 1 | 0 |
| `App.jsx` `useMemo()` | 19 | 19 | 0 |
| `App.jsx` `useRef()` | 2 | 2 | 0 |
| 신청내역 액션 컨트롤러 `useMemo()` | 2 | 1 | -1 |
| 초기 정적 모듈 | 83 | 83 | 0 |
| 초기 정적 소스 | 877,026 bytes | 876,470 bytes | -556 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

## 기능 보존 결과

- 사용자 공지사항 페이지의 페이지 크기 계산은 `App.jsx` 내부 계산에 계속 사용되며, 패널에는 계산 완료된 목록·페이지 수만 전달됩니다.
- 관리자 셸은 실제 로그인·탭 이동·오류 화면에 필요한 28개 키를 그대로 수신합니다.
- 관리자 신청·휴일·사이트·홈·서비스·데이터·시스템 정보 화면은 실제 구조 분해 항목과 Context 정의가 정확히 일치합니다.
- 사용자 신청 변경 대화상자는 신청자와 기기를 변경하지 않는 기존 정책을 유지하며, 사용되지 않던 대여자 후보 계산만 제거했습니다.
- 한국어 사용자 표시 문자열은 고유 1,569개, 발생 2,133회로 전후 동일합니다.

## Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |
| `runTransaction()` | 24 | 24 | 0 |
| `setDoc()` | 34 | 34 | 0 |
| `updateDoc()` | 5 | 5 | 0 |
| `deleteDoc()` | 6 | 6 | 0 |

Firestore Rules, 인덱스, Firebase 설정 및 데이터 구조는 변경하지 않았습니다. Firebase 별도 배포는 필요하지 않습니다.

## 누적 삭제 목록 정규화

직전 `REMOVED_FILES.txt`의 실제 삭제 경로는 67개였습니다. 이번 작업의 신규 소스 삭제는 0개이며, 매뉴얼상 보호 경로에 해당하는 `.performance-reports/firestore-access-audit.json`, `.performance-reports/firestore-access-audit.txt` 2개를 누적 삭제 목록에서 제외했습니다. 주석 행도 제거하고 실제 상대경로만 사전식으로 정렬했습니다. 최종 누적 삭제 경로는 65개입니다.

## 검증 제한

`npm ci`는 검증 환경 내부 npm 저장소가 `yargs-parser-21.1.1.tgz`에 E404를 반환하여 완료하지 못했습니다. 따라서 실제 Vite 프로덕션 빌드는 로컬 `deploy.ps1`에서 확인해야 합니다. 정적 구문·Hook·상대 import·Context 계약·Firestore 감사와 기준본 대비 TypeScript 진단 비교는 통과했습니다. 기준본의 `selectedLaptopId` 중복 선언 및 가드 인수 누락 진단도 제거됐습니다.

## 다음 순차 작업

1. 사용자·관리자 주요 흐름의 최종 회귀 감사
2. 남은 `App.jsx` 최상위 브리지와 상태 소유권 재평가
3. 로컬 `deploy.ps1` Vite 프로덕션 빌드 확인
