# P2 사용자·관리자 주요 흐름 회귀 계약 감사 보고서

- 입력 기준본: `rental-system-context-contract-unused-supply-cleanup-20260802_0010_deployment_package.zip`
- 출력 패키지: `rental-system-app-flow-regression-contract-audit-20260802_0027_deployment_package.zip`
- 작업 유형: 주요 화면 흐름 계약 단일화, 회귀 방지 감사 도구 추가, 발견 오류 수정

## 1. 작업 목적

직전 순차 계획의 세 번째 단계인 사용자·관리자 주요 흐름 회귀 감사를 수행했다. 단순 일회성 검사에 그치지 않고, 이후 구조 분리에서도 동일한 연결 오류를 배포 전에 차단할 수 있도록 프로젝트 내부 감사 도구를 추가했다.

## 2. 확인된 회귀 위험과 수정

### 2.1 보호 사용자 화면 목록 중복

보호 화면은 `src/routing/appRoutes.js`의 `PROTECTED_USER_TABS`가 기준이어야 하지만 다음 두 위치가 별도 배열을 보유하고 있었다.

- `src/user/UserWorkspace.jsx`
- `src/context/appContextSlices.js`

수정 전에는 세 위치가 모두 `rental`, `history`를 사용해 즉시 장애는 없었으나, 향후 보호 탭을 추가하거나 제거할 때 한 위치만 수정되면 다음 불일치가 발생할 수 있었다.

- 로그인 게이트는 적용되지만 잘못된 화면 Context가 선택됨
- 화면 Context는 인증용으로 전환되지만 실제 화면은 보호 화면으로 렌더링됨
- 로그인 후 복귀 정책과 화면 잠금 정책이 서로 달라짐

두 중복 배열을 제거하고 모두 `PROTECTED_USER_TABS.has(userTab)`을 사용하도록 통합했다.

### 2.2 관리자 대시보드 제목 연결 누락

`오늘의 업무` 영역의 `DashboardSectionHeading` 호출만 `id`가 없었다. 동일 컴포넌트의 다른 두 호출은 정상적으로 `id`를 전달하고 있었다.

다음을 추가했다.

- 제목 ID: `dashboard-today-work-heading`
- 영역의 `aria-labelledby="dashboard-today-work-heading"`

화면 문구와 시각적 레이아웃은 변경하지 않았다.

## 3. 영구 회귀 감사 도구

신규 파일 `tools/audit-app-flow-contracts.mjs`를 추가했다. 외부 패키지 없이 Node.js 표준 모듈만 사용한다.

현재 검사 계약은 다음과 같다.

1. 보호 사용자 탭 집합 존재 여부
2. `UserWorkspace`의 공용 보호 탭 집합 사용 여부
3. Context 선택기의 공용 보호 탭 집합 사용 여부
4. 중복 보호 탭 배열 잔존 여부
5. 사용자 경로 11개의 경로·탭 역매핑
6. `AppShell` 선언 props와 `App.jsx` 전달 props 일치
7. 선택 자산 자동 해제 가드의 필수 인수 5개 전달
8. 관리자 메뉴 20개의 렌더링 분기 존재
9. 관리자 메뉴 20개의 Context 매핑 존재
10. 관리자 대시보드 섹션 제목 ID와 `aria-labelledby` 연결

총 30개 계약을 검사한다.

## 4. 빌드 전 자동 실행

`package.json`에 다음 명령을 추가했다.

```text
npm run audit:app-flows
```

`prebuild` 실행 순서는 다음과 같다.

```text
React Hook 감사
→ 애플리케이션 흐름 계약 감사
→ Firestore strict 감사
→ Vite 빌드
```

`verify:performance`에도 같은 감사 단계를 포함했다.

## 5. 변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `src/user/UserWorkspace.jsx` | 수정 | 보호 화면 판정을 공용 `PROTECTED_USER_TABS`로 통합 |
| `src/context/appContextSlices.js` | 수정 | 보호 화면 Context 선택을 공용 집합으로 통합 |
| `src/admin/AdminDashboardPanel.jsx` | 수정 | 오늘의 업무 제목 ID와 영역 연결 추가 |
| `tools/audit-app-flow-contracts.mjs` | 신규 | 사용자·관리자 주요 흐름 계약 자동 감사 |
| `package.json` | 수정 | 감사 명령과 prebuild·성능 검증 연결 추가 |
| `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json` | 수정 | 최종 정적 소스 그래프 반영 |

## 6. 구조 수치

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,564 | 2,564 | 0 |
| `App.jsx` 바이트 | 77,251 | 77,251 | 0 |
| `App.jsx` `useState()` | 14 | 14 | 0 |
| `App.jsx` `useEffect()` | 1 | 1 | 0 |
| `App.jsx` `useMemo()` | 19 | 19 | 0 |
| `App.jsx` `useRef()` | 2 | 2 | 0 |
| 초기 정적 모듈 | 83 | 83 | 0 |
| 초기 정적 소스 | 876,470 bytes | 876,583 bytes | +113 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

초기 소스 증가는 공용 라우팅 상수를 두 파일에서 import한 연결 코드 113바이트이며, 신규 감사 도구는 브라우저 번들에 포함되지 않는다.

## 7. 회귀 감사 결과

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| 흐름 계약 감사 | FAIL 5건 | PASS 30/30 |
| 사용자 경로 | 11개 | 11개 |
| 관리자 메뉴·렌더링·Context 매핑 | 20개 | 20개 |
| AppShell props 누락·초과 | 0건 | 0건 |
| 선택 자산 가드 필수 인수 누락 | 0건 | 0건 |
| 대시보드 제목 ID 누락 | 1건 | 0건 |
| 신규 TypeScript 의미 진단 | - | 0건 |

## 8. Firestore 영향

Firestore 호출 위치와 횟수는 변경하지 않았다.

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

Rules, 인덱스, Firebase 설정과 데이터 구조는 변경하지 않았다. Firebase 별도 배포는 필요하지 않다.

## 9. UI 보존

- 한국어 문자열 고유 수: 1,662 → 1,662
- 한국어 문자열 발생 수: 2,204 → 2,204
- 추가된 화면 문구: 0
- 삭제된 화면 문구: 0
- 버튼·탭·안내문 순서 변경: 없음
- 시각적 className 변경: 없음

## 10. 검증 제한

정적 구문, Hook import, 상대 import, 앱 흐름 계약, Firestore strict 감사와 TypeScript 기준본 비교는 통과했다.

`npm ci`는 검증 환경 내부 npm 저장소가 `yargs-parser-21.1.1.tgz` 요청에 E404를 반환하여 완료하지 못했다. 실제 Vite 프로덕션 빌드는 로컬 `deploy.ps1`에서 확인해야 한다.

## 11. 다음 순차 작업

1. 남은 `App.jsx` 최상위 브리지와 상태 소유권 재평가
2. 최종 소스 그래프 및 로컬 Vite 프로덕션 빌드 확인
