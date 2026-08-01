# P2 게시판 콘텐츠 구독 컨트롤러 분리 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-firestore-capacity-dashboard-tab-count-request-fix-20260731_2047_deployment_package.zip`
- 작업 대상: `App.jsx`의 공지사항·FAQ 조회 상태, 실시간 구독, 검색, 페이지네이션, 선택 공지 조회, 조회수 증가
- 작업 성격: 기능 변경 없는 구조 분리
- 신규 모듈: `src/features/boards/useBoardContentSubscriptionController.js`
- Firestore Rules·인덱스 변경: 없음

## 2. 분리 범위

### 공지사항

- 공지 목록 설정 문서 구독
- 사용자 홈 고정·일반 공지 1회 조회
- 사용자 공지 화면 및 관리자 공지 관리 화면 실시간 구독
- 고정 공지와 일반 공지 병합
- 서버 커서 기반 페이지네이션
- 일반 공지 전체 건수 집계
- 제목·본문 점진 검색
- 선택 공지가 현재 페이지에 없을 때 단건 조회
- 공지 상세 열기·닫기
- 공지 조회수 transaction 증가

### FAQ

- FAQ 카테고리 구독 및 정렬
- FAQ 목록 설정 문서 구독
- 사용자 FAQ 화면 및 관리자 FAQ 관리 화면 실시간 구독
- 카테고리 필터
- 카테고리 내 검색 옵션
- 고정 FAQ와 일반 FAQ 병합
- 서버 커서 기반 페이지네이션
- 일반 FAQ 전체 건수 집계
- 제목·본문 점진 검색
- 삭제된 카테고리 선택 상태 자동 복구

## 3. 상태 소유권 이동

`App.jsx`에 있던 게시판 조회 관련 상태를 `useBoardContentSubscriptionState()`로 이동했습니다.

- 공지 게시글·고정 게시글·현재 페이지 게시글
- 공지 준비·오류·다음 페이지·전체 건수
- 공지 목록 설정·페이지·검색어
- 선택 공지 ID와 단건 조회 대체 데이터
- FAQ 카테고리·게시글·고정 게시글·현재 페이지 게시글
- FAQ 준비·오류·다음 페이지·전체 건수
- FAQ 목록 설정·페이지·검색어·카테고리 내 검색
- 사용자·관리자 FAQ 펼침 상태
- 공지·FAQ 페이지 커서 ref

기존 변수명과 setter 이름은 유지하여 사용자·관리자 패널 context 계약을 변경하지 않았습니다.

## 4. App.jsx 연결 구조

`App.jsx`에는 상태 hook과 실행 컨트롤러 조립만 남겼습니다.

```jsx
const boardContentState = useBoardContentSubscriptionState();

const { closeNoticePost, openNoticePost } =
  useBoardContentSubscriptionController({
    ...boardContentState,
    adminTab,
    debouncedAdminNoticeQuery,
    debouncedFaqQuery,
    debouncedUserNoticeQuery,
    isAdminAuthenticated,
    setFaqPostsPerPageInput,
    setNoticePostsPerPageInput,
    triggerToast,
    userTab,
    view,
  });
```

실제 소스에서는 기존 이름을 그대로 구조 분해하여 context에 전달합니다.

## 5. 공용 함수 이동

다음 순수 함수도 게시판 feature 경계로 이동하고 named export로 재사용합니다.

- `getSafeNoticePostsPerPage()`
- `filterNoticePostsByQuery()`
- `getSafeFaqPostsPerPage()`

공지 검색의 제목·본문 검색 규칙과 페이지당 게시글 수 허용 범위는 변경하지 않았습니다.

## 6. 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| App.jsx 줄 수 | 6,189 | 5,430 | -759 |
| App.jsx 크기 | 182,891 bytes | 158,782 bytes | -24,109 bytes |
| App.jsx `useState()` | 77 | 41 | -36 |
| App.jsx `useEffect()` | 34 | 19 | -15 |
| App.jsx `useRef()` | 11 | 7 | -4 |
| App.jsx `onSnapshot()` | 11 | 4 | -7 |
| App.jsx `getDocs()` | 4 | 2 | -2 |
| App.jsx `getDoc()` | 2 | 1 | -1 |
| App.jsx `getCountFromServer()` | 2 | 0 | -2 |
| App.jsx `runTransaction()` | 1 | 0 | -1 |

신규 모듈:

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `useBoardContentSubscriptionController.js` | 1,029 | 31,756 bytes |

## 7. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 66 | 67 | +1 |
| 초기 정적 소스 | 846,342 bytes | 853,989 bytes | +7,647 bytes |

공지·FAQ 데이터는 홈·커뮤니티·관리자 게시판 화면에서 즉시 사용하므로 컨트롤러는 정적 import를 유지했습니다. 이번 단계는 번들 지연 로딩이 아니라 상태·구독 책임 분리입니다.

## 8. Firestore 영향

전체 감사 대상 호출 수는 동일합니다.

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 | 129 | 129 |
| `onSnapshot()` | 35 | 35 |
| `getDocs()` | 48 | 48 |
| `getDoc()` | 28 | 28 |
| `getCountFromServer()` | 18 | 18 |

FAQ 카테고리 구독 위치가 이동하여 `tools/firestore-audit-policy.json`의 승인 ID만 갱신했습니다.

- 기존: `onSnapshot:9a113b6e410b480f`
- 변경: `onSnapshot:364a7b390d49a9a4`

승인 사유와 재검토 조건은 변경하지 않았습니다.

## 9. 보존된 동작

- 사용자 홈 공지는 1회 조회
- 사용자 공지·FAQ 화면은 실시간 구독
- 관리자 공지·FAQ 관리 화면은 실시간 구독
- 사용자 홈 공지는 고정·일반 각각 최대 6개 조회
- 검색 중 기존 점진 검색 서비스 사용
- 페이지 커서 초기화 조건 유지
- 공지 상세 조회수 transaction 유지
- 한국어 UI 문구, 버튼, className 변경 없음
- 관리자 게시글 CRUD 및 목록 설정 컨트롤러 계약 유지

## 10. 검증 결과

- React Hook import 감사: PASS
- Firestore strict 감사: PASS
- JS·JSX·MJS 구문 변환: PASS
- 미정의·중복 선언 표적 검사: 신규 오류 0건
- 상대 import 실파일 검사: PASS
- 공지·FAQ helper 및 조회수 증가 runtime mock: PASS
- 한국어 문자열 AST 비교: 삭제 0 / 추가 0
- 실제 Vite 빌드: 검증 환경 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미완료

## 11. 후속 우선순위

1. 팝업·푸터 사용자 조회 컨트롤러
2. 화면 이동·브라우저 경로 컨트롤러
3. 전역 UI 상태 컨트롤러
4. 대시보드 파생값·선택자 모듈
5. 초기화·구형 데이터 호환성 서비스
6. context 조립부 및 최종 App 셸 정리
