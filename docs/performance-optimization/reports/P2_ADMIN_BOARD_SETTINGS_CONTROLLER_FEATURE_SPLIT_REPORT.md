# P2 관리자 게시판 설정 컨트롤러 분리 보고서

- 작업 시각: 2026-07-30 15:21 KST
- 입력 기준본: `rental-system-admin-board-post-controller-split-20260730_1513_deployment_package.zip`
- 작업 범위: FAQ 카테고리 관리 및 공지사항·FAQ 페이지당 게시글 수 설정
- 기능 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 1. 신규 모듈

`src/features/boards/useAdminBoardSettingsController.js`

이 모듈은 다음 상태와 동작을 소유한다.

- 공지사항 목록 설정 저장 상태와 페이지당 게시글 수 입력값
- FAQ 목록 설정 저장 상태와 페이지당 게시글 수 입력값
- FAQ 신규 카테고리명
- FAQ 카테고리 수정 대상과 수정 이름
- FAQ 카테고리 저장·삭제 진행 상태
- 공지사항·FAQ 목록 설정 변경 여부와 변경 취소
- 공지사항·FAQ 목록 설정 저장
- FAQ 카테고리 등록·명칭 수정·삭제
- 카테고리 삭제 전 FAQ 사용 건수 집계

## 2. App.jsx 변경

- 위 상태 `useState()` 9개 제거
- 목록 설정 dirty 계산 2개 제거
- 목록 설정 변경 취소 함수 2개 제거
- 목록 설정 저장 함수 2개 제거
- FAQ 카테고리 관리 함수 4개 제거
- `useAdminBoardSettingsState()`와 `useAdminBoardSettingsController()` 연결 추가
- UI 컨텍스트 키와 관리자 패널 인터페이스는 유지

## 3. 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| App.jsx 줄 수 | 13,950 | 13,563 | -387 |
| App.jsx 크기 | 406,720 bytes | 398,116 bytes | -8,604 bytes |
| App.jsx useState | 168 | 159 | -9 |
| App.jsx useEffect | 59 | 59 | 0 |
| App.jsx useRef | 20 | 20 | 0 |
| App.jsx useMemo | 30 | 30 | 0 |
| App.jsx runTransaction | 7 | 7 | 0 |
| 초기 정적 모듈 | 47 | 48 | +1 |
| 초기 정적 소스 | 789,663 bytes | 792,759 bytes | +3,096 bytes |

신규 컨트롤러는 439줄, 11,700 bytes다. 이번 단계는 지연 로딩 최적화가 아니라 `App.jsx` 책임 분리 작업이다.

## 4. 기능 보존

- 관리자 인증 확인 문구와 차단 조건 유지
- 페이지당 게시글 수 5~50 범위 정규화 유지
- 공지사항·FAQ 설정 저장 후 사용자·관리자 페이지를 1페이지로 초기화
- FAQ 설정 저장 후 사용자·관리자 펼침 게시글 초기화
- FAQ 카테고리명 공백 및 중복 검사 유지
- 신규 카테고리 order 계산 유지
- 카테고리 수정 시 merge 저장 유지
- 사용 중인 FAQ 카테고리 삭제 차단 유지
- 카테고리 삭제 시 선택 필터·편집 폼·수정 상태 초기화 유지
- 저장되지 않은 설정 변경사항의 탭 이동 확인 흐름 유지

## 5. Firestore 영향

정적 Firestore 접근 위치는 129개로 유지됐다.

- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

다음 파일은 입력 기준본과 바이트 단위로 동일하다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`

## 6. 삭제 파일 누적 관리

- 입력 기준본 `REMOVED_FILES.txt` 비어 있지 않은 경로: 68개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 68개
- `REMOVED_FILES.txt` SHA-256: `17ad59f08176c623ca2eaa4d3b232992555e62b3ad1b22c824cb1af10778f212`
- 입력 기준본과 바이트 단위 동일

## 7. 빌드 판정

정적 구문, React Hook, 상대 import, Firestore 감사, 컨텍스트 계약, 런타임 모의시험은 통과했다.

검증 환경의 내부 npm 저장소에서 `yargs-parser-21.1.1.tgz`를 찾지 못하는 E404가 발생해 실제 Vite 프로덕션 빌드는 수행하지 못했다. 로컬 `deploy.ps1`에서 `npm run build` 성공을 확인하기 전에는 배포 완료로 판정하지 않는다.
