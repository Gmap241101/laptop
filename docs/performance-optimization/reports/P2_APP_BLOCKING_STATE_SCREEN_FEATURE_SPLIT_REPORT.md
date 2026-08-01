# P2 앱 차단 상태 화면 분리 보고서

## 1. 기준본과 출력본

- 기준본: `rental-system-app-dynamic-context-values-split-20260801_2227_deployment_package.zip`
- 출력본: `rental-system-app-blocking-state-screen-split-20260801_2250_deployment_package.zip`
- 변경 목적: `App.jsx`에 남아 있던 Firebase 치명적 로딩 오류 화면과 사용자 서비스 점검 화면을 전용 앱 셸 컴포넌트로 분리한다.

## 2. 변경 구조

### 신규 파일

`src/shell/AppBlockingStateScreen.jsx`

- Firebase 원격 데이터 로딩 실패 화면을 렌더링한다.
- 사용자 화면의 서비스 점검 모드 화면을 렌더링한다.
- Firebase 오류가 점검 모드보다 우선하도록 차단 상태를 판정한다.
- 관리자 화면은 서비스 점검 모드의 차단 대상에서 제외한다.
- 새로고침과 관리자 모드 이동 동작을 기존과 동일하게 유지한다.

### 수정 파일

`src/App.jsx`

- Firebase 오류 화면 JSX를 제거했다.
- 서비스 점검 화면 JSX를 제거했다.
- `AlertCircle`, `Settings`, `SERVICE_MODE` 직접 의존성을 제거했다.
- `getAppBlockingState()`로 차단 상태를 계산하고 `AppBlockingStateScreen`을 렌더링한다.

## 3. 차단 상태 판정 순서

1. `firebaseLoadErrorMessage`가 존재하면 Firebase 오류 화면을 표시한다.
2. Firebase 오류가 없고 사용자 화면이며 서비스 모드가 `maintenance`이면 점검 화면을 표시한다.
3. 관리자 화면은 점검 모드여도 관리자 셸로 진입할 수 있다.
4. 두 조건에 해당하지 않으면 기존 `AppShell`을 렌더링한다.

Firebase 오류를 최우선으로 처리하는 기존 순서를 유지했다.

## 4. 기능 보존

| 기능 | 결과 |
|---|---|
| Firebase 오류 제목·설명·상세 메시지 | 유지 |
| 오류 발생 시 원격 데이터 저장 차단 안내 | 유지 |
| `다시 불러오기` 버튼의 전체 페이지 새로고침 | 유지 |
| 사용자 화면만 점검 모드 차단 | 유지 |
| 관리자 화면 점검 모드 우회 | 유지 |
| 점검 제목·본문·예상 종료 시각 | 유지 |
| 지원 문구·담당 부서·이메일·전화번호 | 유지 |
| `다시 확인` 버튼의 전체 페이지 새로고침 | 유지 |
| `관리자 모드` 버튼의 replace 이동 | 유지 |
| Tailwind 클래스와 화면 디자인 | 유지 |
| 한국어 화면 문구 | 변경 없음 |

## 5. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 3,419 | 3,363 | -56 |
| 파일 크기 | 104,035 bytes | 101,082 bytes | -2,953 bytes |
| `useState()` | 21 | 21 | 0 |
| `useEffect()` | 6 | 6 | 0 |
| `useRef()` | 4 | 4 | 0 |
| `useMemo()` | 19 | 19 | 0 |
| `useCallback()` | 10 | 10 | 0 |

신규 화면 컴포넌트는 132줄, 4,483 bytes다. 이번 작업은 상태와 effect를 이동하지 않고 최상위 차단 화면의 렌더링 책임만 분리했다.

## 6. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 77 | 78 | +1 |
| 초기 정적 소스 | 877,545 bytes | 879,075 bytes | +1,530 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

차단 화면은 Firebase 초기화 실패 시에도 확실하게 표시되어야 하므로 정적 import를 사용했다. 관리자 워크스페이스와 사용자 기능 화면의 동적 청크 구조는 변경하지 않았다.

## 7. Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot()`: 35 → 35
- `getDocs()`: 48 → 48
- `getDoc()`: 28 → 28
- `getCountFromServer()`: 18 → 18

신규 컴포넌트는 Firestore를 호출하지 않는다. Rules, 인덱스, Firebase 설정 및 감사 정책은 변경하지 않았다.

## 8. 검증 요약

- TypeScript JSX·JS 구문 검사: PASS
- React Hook import 감사: PASS
- 상대 import 실파일 검사: PASS
- Firestore strict 감사: PASS
- 차단 상태 우선순위 runtime mock: PASS
- 관리자 점검 모드 우회 runtime mock: PASS
- 한국어 토큰 보존 검사: PASS
- 실제 Vite 빌드: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미완료

## 9. 배포 영향

이번 변경은 React 소스 구조만 변경한다.

- Firebase Rules 배포: 불필요
- Firestore 인덱스 배포: 불필요
- Firebase Hosting 설정 변경: 없음
- 로컬 `deploy.ps1`에서 패키지 적용 후 실제 Vite 빌드 확인 필요
