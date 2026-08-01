# P2 관리자 워크스페이스 브리지 컨트롤러 분리 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-app-flow-regression-contract-audit-20260802_0027_deployment_package.zip`
- 작업 목적: `App.jsx`가 직접 소유하던 관리자 신청·회원 목록 이동 브리지 상태와 패널 명령 레지스트리를 전용 훅으로 이동
- 기능 변경: 없음
- Firestore 구조·Rules·인덱스 변경: 없음

## 2. 이동한 책임

신규 `src/admin/useAdminWorkspaceBridgeController.js`가 다음 상태와 명령을 소유한다.

- 회원 계정 목록 이동 요청 상태
- 관리자 신청 목록 이동 요청 상태
- 신청 목록 변경 버전
- 관리자 신청 패널 명령 레지스트리
- 신청 조회·목록 갱신·페이지 초기화·선택 해제 브리지
- 신청 변경 알림 버전 증가

`App.jsx`에는 훅 호출과 반환값 구조 분해만 남겼다. 기존 공개 변수명과 각 컨트롤러·Context 전달 계약은 변경하지 않았다.

## 3. 변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `src/App.jsx` | 수정 | 관리자 워크스페이스 브리지 상태·콜백 제거, 전용 훅 연결 |
| `src/admin/useAdminWorkspaceBridgeController.js` | 신규 | 관리자 목록 이동 상태와 신청 패널 명령 레지스트리 소유 |
| `tools/audit-app-flow-contracts.mjs` | 수정 | 브리지 위임·반환 계약·중복 상태 방지 검사 추가 |
| `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json` | 수정 | 최종 소스 그래프 반영 |

## 4. App.jsx 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 2564 | 2512 | -52 |
| 바이트 | 77251 | 75731 | -1520 |
| `useState()` | 14 | 11 | -3 |
| `useEffect()` | 1 | 1 | +0 |
| `useMemo()` | 19 | 19 | +0 |
| `useRef()` | 2 | 1 | -1 |
| `useCallback()` | 6 | 0 | -6 |
| 직접 Firestore 호출 | 0 | 0 | 0 |

## 5. 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 83 | 84 | +1 |
| 초기 정적 소스 | 876583 bytes | 877977 bytes | +1394 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

초기 소스 총량은 전용 훅의 계약·초기화 함수가 추가되어 증가했지만, `App.jsx`의 최상위 상태 소유권과 콜백 구현은 제거되었다.

## 6. 자동 회귀 감사 확장

`tools/audit-app-flow-contracts.mjs`에 다음 검사를 추가했다.

- `App.jsx`가 전용 브리지 훅을 import·호출하는지 확인
- 브리지 훅이 기존 공개 계약 11개를 모두 제공하는지 확인
- `App.jsx`에 신청 패널 레지스트리와 변경 버전 증가 구현이 중복 잔존하지 않는지 확인

감사 계약은 30개에서 43개로 증가했으며 최종 결과는 PASS다.

## 7. 기능·UI·Firestore 보존

- 기존 관리자 신청 목록 이동 요청 형식 유지
- 기존 회원 계정 목록 이동 요청 형식 유지
- 관리자 신청 패널의 조회·갱신·페이지 초기화·선택 해제 계약 유지
- 신청 변경 버전 증가 방식 유지
- 한국어 화면 문자열 추가 0개, 삭제 0개
- Firestore 감사 대상 호출 129개 유지
- Rules·인덱스·Firebase 설정 해시 변경 없음

## 8. 검증 제한

정적 TypeScript JS/JSX 모듈 검사, React Hook 감사, 앱 흐름 계약 감사, 상대 import 검사, Firestore strict 감사는 통과했다.

검증 환경에는 프로젝트 `node_modules`가 없고 내부 npm 저장소가 `yargs-parser-21.1.1.tgz` 요청에 E404를 반환하여 실제 Vite 프로덕션 빌드는 수행하지 못했다. 로컬 `deploy.ps1`에서 최종 빌드를 확인해야 한다.
