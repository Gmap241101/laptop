# 관리자 신청 및 게시판 검색 컨트롤러 Feature 분리 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p2-asset-upload-feature-split-deployment-package.zip`
- 목표: `App.jsx`에 남아 있던 관리자 신청 검색과 공지·FAQ 순차 검색의 캐시·취소·Firestore 조회 로직을 전용 feature 훅으로 이동
- 변경 금지 범위: 검색 조건, 화면 문구, Firestore 컬렉션·문서 구조, Rules, 인덱스, 페이지네이션 방식

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/requests/useAdminRequestProgressiveSearch.js`
- `src/features/boards/useBoardProgressiveSearch.js`

## 3. 관리자 신청 검색 분리

신규 훅 `useAdminRequestProgressiveSearch`가 다음 기능을 소유합니다.

- 검색어 정규화
- 탭·빠른 필터·검색어 조합 캐시 키
- Firestore 검색 커서
- 누적 검색 결과
- 페이지에 필요한 결과 수 계산
- 취소 플래그
- 오류 처리 및 토스트

`App.jsx`에는 검색 활성 조건과 결과 상태 setter 연결만 남겼습니다. 일반 목록의 `onSnapshot()` 기반 커서 페이지네이션은 기존 코드에 유지했습니다.

## 4. 공지·FAQ 검색 공통화

신규 훅 `useBoardProgressiveSearch`가 공지와 FAQ의 공통 순차 검색을 처리합니다.

- 고정글 전체 범위 순차 검색
- 일반글 현재 페이지 필요량까지 순차 검색
- 제목·본문·리치 텍스트 일반문자 검색
- 고정글·일반글 각각의 커서 및 누적 결과 캐시
- FAQ 카테고리 내 검색 조건
- 화면 이탈·검색 조건 변경 시 취소 처리

공지와 FAQ의 일반 비검색 목록은 기존 `onSnapshot()` 커서 페이지네이션을 그대로 사용합니다.

## 5. 동작 보존

다음 동작은 변경하지 않았습니다.

- 관리자 신청 검색 대상 필드
- 관리자 신청 탭 및 빠른 필터
- 공지 제목·본문 검색
- FAQ 제목·본문 검색
- FAQ 전체 카테고리/현재 카테고리 검색
- 100건 단위 순차 Firestore 스캔
- 현재 페이지 필요량 + 1건 조회
- 다음 페이지에서 이전 커서 이후부터 재개
- 검색 모드는 일회성 `getDocs()` 사용
- 일반 목록은 실시간 `onSnapshot()` 유지

## 6. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 21,074 | 20,833 | -241 |
| `App.jsx` 크기 | 611,148 bytes | 603,966 bytes | -7,182 bytes |
| `App.jsx` `useRef()` 호출 | 27 | 24 | -3 |
| `App.jsx` `scanFirestoreMatches()` 호출 | 6 | 1 | -5 |

남아 있는 `scanFirestoreMatches()` 1건은 관리자 회원 검색입니다.

## 7. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 30 | 32 | +2 |
| 초기 정적 소스 | 819,859 bytes | 820,759 bytes | +900 bytes |

이번 작업은 코드 지연 로딩이 아니라 구조 분리입니다. 두 feature 훅이 정적 import되므로 초기 소스 총량은 약 900 bytes 증가했습니다. 대신 `App.jsx` 내부 결합도와 검색 상태 간 충돌 가능성이 줄었습니다.

## 8. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 접근 호출 위치 | 123 | 123 |
| `onSnapshot()` | 32 | 32 |
| `getDocs()` | 48 | 48 |
| `getDoc()` | 23 | 23 |
| `getCountFromServer()` | 20 | 20 |

신규 쿼리와 무제한 조회는 추가하지 않았습니다.

## 9. 검증 결과

- JS·JSX·MJS 70개 TypeScript transpile 검사: 오류 0건
- 상대 import 127개 검사: 누락 0건
- Firestore 엄격 감사: PASS
- 미승인 Firestore 경고·오류: 0건
- 기존 한국어 문자열 추가·삭제: 0건
- 검색 캐시 ref 3개 `App.jsx`에서 제거 확인
- Rules·인덱스 변경 없음

## 10. 프로덕션 빌드 제한

`npm run build`의 `prebuild` Firestore 감사까지는 통과했습니다. 작업 환경에 `vite` 실행 파일이 없어 번들 생성은 수행하지 못했습니다.

```text
sh: 1: vite: not found
```

실제 프로젝트 PC의 `deploy.ps1`이 배포 전에 `npm run build`를 실행하므로 빌드 오류가 있으면 게시 전에 중단됩니다.
