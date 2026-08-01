# P2 팝업·푸터 콘텐츠 구독 컨트롤러 분리 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-board-content-subscription-controller-split-20260801_1754_deployment_package.zip`
- 작업 대상: `src/App.jsx`에 남아 있던 팝업·푸터 조회 상태, Firestore 구독, 사용자 팝업 닫기 상태
- 신규 모듈: `src/features/boards/usePopupFooterContentSubscriptionController.js`
- 기능 정책·Firestore 문서 구조·UI 문구 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 2. 분리 범위

### 상태 12개 이동

- `popupPosts`
- `popupPostsReady`
- `popupPostsLoadErrorMessage`
- `footerConfig`
- `footerConfigReady`
- `footerConfigLoadErrorMessage`
- `footerPages`
- `footerPagesReady`
- `footerPagesLoadErrorMessage`
- `temporarilyDismissedPopupVersions`
- `dismissedPopupSessionVersions`
- `dismissedPopupLocalVersions`

### Firestore 조회·구독 이동

- 사용자 홈·대여 화면의 사용 중 팝업 일회성 조회
- 관리자 팝업 관리 화면의 전체 팝업 실시간 구독
- 사용자 화면의 푸터 공통 정보 일회성 조회
- 관리자 푸터 관리 화면의 푸터 공통 정보 실시간 구독
- 사용자 화면의 사용 중 푸터 페이지 일회성 조회
- 관리자 푸터 관리 화면의 전체 푸터 페이지 실시간 구독

### 사용자 팝업 상태 이동

- 현재 탭을 벗어날 때 임시 닫기 목록 초기화
- 세션 동안 보지 않기 상태를 `sessionStorage`에 저장
- 7일 동안 보지 않기 상태를 `localStorage`에 저장
- 단일 팝업 닫기
- 전체 팝업 닫기
- 만료된 7일 닫기 기록 초기 정리

### 푸터 선택값 이동

- `selectedFooterPageId`에 해당하는 `selectedFooterPage` 계산

## 3. 유지된 동작

- 사용자 팝업은 홈과 로그인된 대여 신청 화면에서만 조회
- 사용자 경로는 일회성 조회, 관리자 편집 경로는 실시간 구독
- 팝업 정렬: `sortOrder` 우선, 없으면 생성일 내림차순
- 푸터 페이지 정렬: `sortOrder`, 생성일, 문서 ID 순
- 사용자 화면에서는 `enabled == true` 문서만 조회
- 관리자 화면에서는 사용 여부와 관계없이 전체 문서를 조회
- 관리자 조회 오류만 전역 오류 토스트 표시
- 푸터 공통 HTML 정제와 구형 일반 텍스트 변환 유지
- 사용자·관리자 패널 context 키와 함수명 유지

## 4. App.jsx 감소

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 5,430 | 5,089 | -341 |
| 파일 크기 | 158,782 bytes | 147,858 bytes | -10,924 bytes |
| `useState()` | 41 | 29 | -12 |
| `useEffect()` | 19 | 13 | -6 |
| `useMemo()` | 27 | 26 | -1 |
| `onSnapshot()` | 4 | 1 | -3 |
| `getDocs()` | 2 | 0 | -2 |
| `getDoc()` | 1 | 0 | -1 |

신규 컨트롤러는 577줄, 15,896 bytes입니다.

## 5. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 67 | 68 | +1 |
| 초기 정적 소스 | 853,989 bytes | 858,961 bytes | +4,972 bytes |

팝업과 푸터는 사용자 기본 레이아웃과 관리자 콘텐츠 관리 양쪽에서 사용하므로 정적 import를 유지했습니다. 이번 단계는 번들 지연 로딩이 아니라 `App.jsx` 책임 분리입니다.

## 6. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 호출 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

호출 시점, 쿼리 조건, 컬렉션, 사용자·관리자 활성 조건을 변경하지 않았습니다. 호출 위치가 이동한 4개 감사 ID만 `tools/firestore-audit-policy.json`에서 갱신했습니다.

## 7. 패키지 정책

- `package-meta/REMOVED_FILES.txt`의 기존 누적 삭제 경로를 그대로 승계
- 이번 신규 삭제 경로: 0개
- `deploy.ps1`, `.git`, `node_modules`, `dist`, `.env*`, 비밀 파일 제외
- 출력물은 변경 파일 패치가 아닌 전체 프로젝트 소스 풀패키지

## 8. 다음 순차 대상

다음 우선순위는 `App.jsx`의 화면 이동·브라우저 경로 컨트롤러 분리입니다. 사용자·관리자 탭 전환, History API, 보호 화면 복귀 대상, 푸터·공지 상세 경로 연결을 하나의 라우팅 경계로 정리합니다.
