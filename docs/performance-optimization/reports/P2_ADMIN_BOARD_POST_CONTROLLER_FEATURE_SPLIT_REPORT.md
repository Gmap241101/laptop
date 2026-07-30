# P2 관리자 게시판 게시글 컨트롤러 분리 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-user-request-history-action-controller-split-20260730_1455_deployment_package.zip`
- 출력 패키지: `rental-system-admin-board-post-controller-split-20260730_1513_deployment_package.zip`
- 분리 대상: 관리자 공지사항·FAQ 게시글 등록, 수정, 삭제 및 편집 다이얼로그 상태
- 기능 정책 변경: 없음
- Firestore 데이터 구조 변경: 없음
- UI 문구·버튼·className 변경: 없음

## 2. 신규 모듈

`src/features/boards/useAdminBoardPostController.js`

이 모듈이 다음 책임을 소유합니다.

- 공지사항 편집 다이얼로그 상태 4개
- FAQ 편집 다이얼로그 상태 4개
- 공지사항 작성·수정 다이얼로그 진입과 초기화
- 공지사항 제목·본문 검증
- 공지사항 rich HTML 정규화와 텍스트 색인 생성
- 공지사항 등록·수정 Firestore 저장
- 공지사항 삭제 확인과 선택 게시글·편집 상태 정리
- FAQ 작성·수정 다이얼로그 진입과 초기화
- FAQ 카테고리·제목·본문 검증
- FAQ rich HTML 정규화와 텍스트 색인 생성
- FAQ 등록·수정 Firestore 저장
- FAQ 삭제 확인과 사용자·관리자 펼침 상태 정리
- 작성자 UID·이름 및 기존 등록 시각 보존

## 3. App.jsx 변경

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 14,480 | 13,950 | -530 |
| 파일 크기 | 417,913 bytes | 406,720 bytes | -11,193 bytes |
| `useState()` | 176 | 168 | -8 |
| `useEffect()` | 59 | 59 | 0 |
| `useRef()` | 20 | 20 | 0 |
| `useMemo()` | 30 | 30 | 0 |
| `runTransaction()` | 7 | 7 | 0 |

신규 컨트롤러는 499줄, 12,665 bytes입니다.

## 4. App.jsx 연결 구조

공지사항 편집 상태는 다음 hook으로 이동했습니다.

```jsx
const {
  noticePostDeletingId,
  noticePostDialog,
  noticePostForm,
  noticePostSaving,
  setNoticePostDeletingId,
  setNoticePostDialog,
  setNoticePostForm,
  setNoticePostSaving,
} = useNoticePostAdminState();
```

FAQ 편집 상태는 다음 hook으로 이동했습니다.

```jsx
const {
  faqPostDeletingId,
  faqPostDialog,
  faqPostForm,
  faqPostSaving,
  setFaqPostDeletingId,
  setFaqPostDialog,
  setFaqPostForm,
  setFaqPostSaving,
} = useFaqPostAdminState();
```

게시글 실행 흐름은 다음 controller로 연결했습니다.

```jsx
const {
  closeFaqPostDialog,
  closeNoticePostDialog,
  confirmDeleteFaqPost,
  confirmDeleteNoticePost,
  openFaqPostDialog,
  openNoticePostDialog,
  saveFaqPost,
  saveNoticePost,
} = useAdminBoardPostController({
  // 기존 App 상태·setter·관리자 감사 정보·확인창·토스트 전달
});
```

## 5. 보존된 동작

- 관리자 인증이 없는 경우 작성·수정·삭제 차단
- 관리자 감사 actor UID가 없는 경우 저장 차단
- 공지사항 제목과 본문 필수 검증
- FAQ 카테고리, 제목, 본문 필수 검증
- FAQ 등록 전 카테고리 존재 여부 확인
- 구형 일반 텍스트 본문을 rich HTML로 변환
- HTML 정제 후 `content`, `contentText`, `contentHtml` 동시 저장
- `contentFormat: rich-html-v1` 유지
- 수정 시 기존 작성자·등록 시각·조회수 유지
- 신규 등록 시 서버 시각 저장
- 삭제 전 복구 불가 확인창 유지
- 삭제된 공지사항이 열려 있으면 상세 선택 해제
- 삭제된 FAQ가 펼쳐져 있으면 사용자·관리자 펼침 상태 해제
- 삭제 대상이 편집 중이면 편집 다이얼로그 초기화
- 기존 성공·실패 문구와 오류 코드 표시 유지

## 6. 분리하지 않은 게시판 기능

이번 단계는 게시글 CRUD 경계만 분리했습니다. 다음 기능은 `App.jsx`에 그대로 유지했습니다.

- 공지사항 사용자 조회수 증가
- 공지사항·FAQ 목록 구독과 페이지네이션
- 공지사항·FAQ 검색
- 페이지당 게시글 수 설정
- FAQ 카테고리 등록·수정·삭제
- 사용자·관리자 FAQ 펼침 토글
- 팝업 게시글과 푸터 페이지 관리

## 7. 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 46 | 47 | +1 |
| 초기 정적 소스 | 788,191 bytes | 789,663 bytes | +1,472 bytes |

이번 단계는 지연 로딩이 아니라 `App.jsx`의 게시글 편집·저장 책임을 feature 단위로 이동하는 구조 분리 작업입니다.

## 8. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 접근 위치 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

| 파일 | SHA-256 | 판정 |
|---|---|---|
| `rules/firestore.rules` | `9b703839184e09c7303b80fde2209722a4545feefabc837ad8e885e0466b1d3e` | 동일 |
| `firestore.indexes.json` | `e8331250b347f49156fc64e50c6bef5e198e310708f192ddd67ce472e3d9c70f` | 동일 |
| `firebase.json` | `9f47f5d83c8ac8006ca7ec119dbf681d9b5d773ac9957c9254517bc01e514e8f` | 동일 |
| `.firebaserc` | `b17b7da5c0ba946de5766077657b967dddd43541da4150600374412e8bc463b1` | 동일 |
| `package.json` | `89e3c902da4fa8b75af380e3d56609546106b12eb9777ebcc1bc28f59a90b36e` | 동일 |
| `package-lock.json` | `59ff408bd366536cd0bf655e197f5c48be56ef06d744b03e0b30ed767a8ac175` | 동일 |

Firebase Rules와 인덱스 배포는 필요하지 않습니다.

## 9. 삭제 목록

- 직전 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- `package-meta/REMOVED_FILES.txt`: 바이트 단위 그대로 승계
- SHA-256: `17ad59f08176c623ca2eaa4d3b232992555e62b3ad1b22c824cb1af10778f212`

## 10. 검증

- 기준본 SHA-256 289개: PASS
- JavaScript/JSX/MJS TypeScript 표적 진단: PASS
- React Hook import 감사: PASS
- 상대 import 267개: 누락 0개
- Firestore strict 감사: PASS
- Firestore 접근 위치: 129 → 129
- 관리자 게시판 컨트롤러 runtime mock: PASS, 7개 시나리오
- 한국어 UI 문자열 발생 집합: 삭제 0개, 추가 0개
- `REMOVED_FILES.txt` 누적 승계: PASS
- Rules·인덱스·package 설정 해시: 동일
- Vite 프로덕션 빌드: 현재 환경 npm registry E404로 미수행
