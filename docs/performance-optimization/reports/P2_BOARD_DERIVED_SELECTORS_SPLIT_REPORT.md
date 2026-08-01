# P2 공지사항·FAQ 파생 선택자 분리 보고서

## 1. 작업 목적

`App.jsx`가 직접 수행하던 공지사항·FAQ의 검색, 필터링, 카테고리 정렬, 게시물 번호, 페이지 수, 안전 페이지, 선택 게시물 계산을 전용 선택자 훅으로 이동했습니다. Firestore 구독, 관리자 저장·삭제 로직, 화면 문구, Context 공개 변수명은 변경하지 않았습니다.

## 2. 변경 파일

- 수정: `src/App.jsx`
- 신규: `src/features/boards/useBoardDerivedSelectors.js`
- 수정: `tools/audit-app-flow-contracts.mjs`
- 수정: `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`
- 신규: 본 보고서, 검증 보고서, 전후 비교 JSON, 전체 diff

## 3. 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,512 | 2,174 | -338 |
| `App.jsx` 바이트 | 75,731 | 67,919 | -7,812 |
| `App.jsx useState` | 11 | 11 | 0 |
| `App.jsx useEffect` | 1 | 1 | 0 |
| `App.jsx useMemo` | 19 | 0 | -19 |
| `App.jsx useRef` | 1 | 1 | 0 |
| 초기 정적 모듈 | 84 | 85 | +1 |
| 초기 정적 소스 | 877,977 bytes | 879,438 bytes | +1,461 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

신규 훅은 341줄, 9,273 bytes이며 19개의 `useMemo`와 24개의 공개 파생값을 소유합니다. 이번 단계는 번들 지연 로딩이 아니라 책임 분리이므로 초기 정적 소스는 경계 코드 비용만큼 증가했습니다.

## 4. 이동한 책임

- 사용자·관리자 공지 검색 모드 판정
- 고정 공지와 일반 공지 분리
- 사용자·관리자 검색 결과 계산
- 공지 전체 페이지와 안전 페이지 계산
- 검색 결과 클라이언트 페이지 분할
- 일반 공지 게시물 번호 계산
- 선택 공지 및 직접 조회 override 선택
- FAQ 카테고리 이름·정렬 순서 Map 계산
- 카테고리 제한 및 전체 검색 정책 적용
- 제목·본문·HTML 본문 검색
- FAQ 고정·일반 게시물 분리
- 사용자 FAQ 페이지 분할 및 최종 정렬
- 관리자 FAQ 페이지 수와 안전 페이지 계산

## 5. 기능 보존 검증

6개 런타임 시나리오를 실행했습니다.

1. 사용자 일반 공지 페이지와 게시물 번호
2. 사용자 공지 검색 및 FAQ 본문 검색
3. 관리자 공지 검색과 관리자 페이지 기준 번호
4. FAQ 카테고리 제한
5. 카테고리 외 전체 검색과 카테고리 내 검색 비교
6. 목록에 없는 선택 공지의 override 복구

모든 시나리오가 통과했습니다.

## 6. Firestore 영향

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

Rules, 인덱스, Firebase 설정은 변경하지 않았습니다.

## 7. 검증 결과

- 입력 manifest 470개 및 SHA-256 전수 검증: PASS
- React Hook 감사 142개 파일: PASS
- 앱 흐름 계약 69개: PASS
- 상대 import 428개, 누락 0개: PASS
- Firestore strict 감사 129개: PASS
- 화면 한국어 문자열 고유 2,524개, 발생 3,316회로 전후 동일
- 기준본 대비 신규 의미 TypeScript 진단: 0개
- `npm run prebuild`: PASS
- `npm ci`: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 실패
- 실제 Vite build: 미수행, 로컬 `deploy.ps1` 확인 필요

## 8. 다음 순차 작업 및 잔여량

현재 구조 분리 진행률은 약 91~93%로 추정합니다. 남은 주요 묶음은 자산 검색·필터·업로드 보기 상태, 앱 초기화·상태 브리지, 잔여 인라인 UI 액션, 동적 Context 그룹 조립 경계, 최종 회귀·빌드 확인입니다.

- 최소 예상: 4회
- 권장 예상: 6회
- 최대 예상: 8회
- 다음 우선순위: 자산 검색·필터·업로드 보기 상태 컨트롤러 분리
