# 관리자 화면 이동·미저장 변경 중재 컨트롤러 분리 보고서

## 기준본과 산출물

- 기준본: `rental-system-app-initialization-readiness-controller-split-20260801_2318_deployment_package.zip`
- 산출물: `rental-system-admin-navigation-controller-split-20260801_2340_deployment_package.zip`
- 작업 유형: `App.jsx` 책임 분리 및 관리자 화면 이동 중재 일원화

## 작업 목적

관리자 메뉴 이동 시 다음 로직이 `App.jsx`, `AdminWorkspace.jsx`, 개별 관리자 패널에 분산돼 있었습니다.

- 현재 관리자 탭 상태
- 부서·사용자 관리와 회원가입 정책의 미저장 상태 및 저장·폐기 callback
- 대여 정책, 휴일, 자산 카테고리, 공지사항, FAQ, 푸터 공통 정보의 미저장 변경 중재
- 초기화면 배너, 푸터 메뉴 페이지, 사이트 설정의 구형 전역 미저장 표식 확인
- 브라우저 종료 전 경고
- 대시보드에서 회원 계정 관리 또는 신청 관리 화면으로 이동하면서 필터 요청 전달
- 관리자 화면에서 홈 로고를 눌렀을 때 대시보드로 이동

이번 작업은 위 책임을 `src/admin/useAdminNavigationController.js`로 옮겨 관리자 이동 경로를 하나의 중재 계층으로 통합했습니다.

## 신규 모듈

### `useAdminNavigationState()`

다음 상태와 ref를 `App.jsx`에서 이동했습니다.

- `adminTab`
- `peopleSettingsDirty`
- `signupPolicyDirty`
- `memberDirectoryDeferredActionsRef`
- `signupPolicyDeferredActionsRef`
- `handleMemberDirectoryDeferredStateChange()`
- `handleSignupPolicyDeferredStateChange()`

### `useAdminNavigationController()`

다음 기능을 담당합니다.

1. 관리자 탭 이동
2. 현재 탭의 미저장 변경사항 판정
3. `저장 후 이동`, `저장하지 않고 이동`, `계속 편집` 처리
4. 브라우저 새로고침·닫기 전 경고
5. 초기화면 배너·푸터 페이지·사이트 설정의 기존 미저장 표식 확인
6. 회원 계정 관리 화면 이동 요청 전달
7. 신청 관리 화면 이동 요청 전달
8. 관리자 대시보드 홈 이동

## 미저장 변경 중재 대상

| 관리자 탭 | 변경 대상 | 저장 | 폐기 |
|---|---|---|---|
| `extensionSettings` | 대여 정책 | `saveSystemSettings` | `discardRentalPolicyChanges` |
| `holidaySettings` | 휴일 | `saveHolidaySettings` | `discardHolidayChanges` |
| `categories` | 자산 카테고리 | `saveTempAssetCategoryChanges` | `cancelTempAssetCategoryChanges` |
| `people` | 부서·사용자 | 패널 callback | 패널 callback |
| `signupPolicy` | 회원가입 정책 | 패널 callback | 패널 callback |
| `noticePosts` | 공지사항 목록 설정 | `saveNoticeBoardConfig` | `discardNoticeBoardConfigChanges` |
| `faqPosts` | FAQ 목록 설정 | `saveFaqBoardConfig` | `discardFaqBoardConfigChanges` |
| `footerManagement` | 푸터 공통 정보 | `saveFooterConfig` | 푸터 설정 원본 복원 |

## 구형 전역 미저장 표식 통합

기존 `AdminWorkspace.jsx`와 `App.jsx`에서 각각 확인하던 다음 전역 표식을 컨트롤러로 이동했습니다.

- `window.__mkHomeBannerUnsaved`
- `window.__mkFooterPageUnsaved`
- `window.__mkSystemSettingsUnsaved`
- `window.__mkSystemSettingsUnsavedMessage`

표식은 사용자가 이동 경고를 승인한 시점이 아니라, 실제로 탭 이동이 확정된 시점에만 초기화됩니다. 따라서 이후의 저장 확인 모달에서 `계속 편집`을 선택하면 기존 미저장 표식이 사라지지 않습니다.

## 이동 확정 callback

`handleAdminTabChange(nextTab, { onCommitted })` 계약을 추가했습니다.

- 변경사항이 없으면 즉시 탭 이동 후 callback 실행
- 저장 후 이동이면 저장 성공 후 callback 실행
- 저장하지 않고 이동이면 폐기 처리 후 callback 실행
- 계속 편집 또는 저장 실패이면 callback 미실행

이를 통해 관리자 홈 URL 변경, 회원 계정 필터 전달, 신청 관리 필터 전달이 실제 화면 이동 확정 이후에만 실행됩니다.

## `AdminWorkspace.jsx` 변경

관리자 사이드바 버튼에 중복돼 있던 `window.confirm()` 로직을 제거했습니다.

현재 활성 메뉴를 다시 클릭하면 기존처럼 페이지 상단으로 이동하며, 다른 메뉴를 클릭할 때만 중앙 컨트롤러가 미저장 변경사항을 확인합니다.

## 기능 영향

- 관리자 메뉴 구조와 표시 문구 변경 없음
- 관리자 탭 키 변경 없음
- 저장·폐기 함수의 기존 계약 유지
- 회원 계정 관리 및 신청 관리의 필터 이동 계약 유지
- Firebase 인증 처리 변경 없음
- Firestore 읽기·쓰기 호출 변경 없음
- Firestore Rules와 인덱스 변경 없음

## 소스 규모

| 항목 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 3,084 | 2,855 | -229 |
| `App.jsx` 바이트 | 93,060 | 86,834 | -6,226 |
| `App.jsx` `useState()` | 17 | 14 | -3 |
| `App.jsx` `useEffect()` | 3 | 2 | -1 |
| `App.jsx` `useRef()` | 4 | 2 | -2 |
| `App.jsx` `useCallback()` | 10 | 6 | -4 |
| `AdminWorkspace.jsx` 줄 수 | 671 | 644 | -27 |
| 신규 컨트롤러 줄 수 | 0 | 478 | +478 |

## 초기 소스 그래프

| 항목 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 81 | 82 | +1 |
| 초기 정적 소스 | 878,586 bytes | 885,284 bytes | +6,698 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

신규 컨트롤러는 앱 초기 관리자 상태 조립에 필요하므로 정적 import입니다. 관리자 워크스페이스와 기존 사용자 화면의 동적 로딩 경계는 변경하지 않았습니다.

## 다음 작업

1. 대여 신청 날짜 입력 UI와 선택 자산 자동 해제 로직 분리
2. 실제 소비되지 않는 컨텍스트 공급값 최종 감사
3. 사용자·관리자 주요 흐름 회귀 검사
4. 최종 소스 그래프 및 로컬 Vite 프로덕션 빌드 검증
