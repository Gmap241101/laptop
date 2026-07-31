# P2 사용자 인증 세션 컨트롤러 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-admin-authentication-controller-split-20260731_1434_deployment_package.zip`
- 출력 패키지: `rental-system-user-authentication-session-controller-split-20260731_1555_deployment_package.zip`
- 작업 범위: 사용자 인증 세션 상태, 유휴·절대 만료, 활동 갱신 및 보안정책 변경 로그아웃 분리

## 2. 변경 파일

### 신규

- `src/features/auth/useUserAuthenticationSessionController.js`

### 수정

- `src/App.jsx`
- `src/features/auth/useAdminAuthenticationController.js`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 삭제 파일

- 없음
- 기존 `package-meta/REMOVED_FILES.txt` 누적 목록을 그대로 승계한다.

## 3. 분리한 책임

신규 컨트롤러는 다음 기능을 소유한다.

- 사용자 세션 ID, 유휴 만료 시각, 절대 만료 시각, 정책 버전 상태
- 사용자 세션 저장·초기화 함수
- 로그인 성공 시 사용자 세션 생성
- 로그아웃·Firebase Auth 해제 시 세션 저장소와 React 상태 동시 초기화
- 사용자 보안정책 버전 변경 감지
- 유휴 만료와 절대 만료 구분
- 세션 만료 시 Firebase Auth 로그아웃과 로그인 화면 이동
- pointerdown, keydown, scroll, touchstart, visibilitychange 기반 활동 시간 갱신
- 30초 이내 반복 활동 저장 제한
- 활동 갱신 시 기존 절대 만료 시각 보존
- `hasEstablishedUserSession` 계산

## 4. 관리자 인증 컨트롤러 연계 정리

관리자 로그인 시 일반 사용자 세션을 제거하는 처리는 기존에 관리자 인증 컨트롤러가 사용자 세션 저장소와 네 개의 setter를 직접 조작했다. 이번 작업에서는 `clearUserAuthenticatedSession` 단일 계약을 전달하도록 변경했다.

이로써 사용자 세션 저장소와 React 상태 초기화 책임은 사용자 인증 세션 feature에 집중된다.

## 5. App.jsx 감소

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 9,559 | 9,363 | -196 |
| 크기 | 277,692 bytes | 271,446 bytes | -6,246 bytes |
| `useState()` | 114 | 110 | -4 |
| `useEffect()` | 52 | 50 | -2 |
| `useRef()` | 19 | 18 | -1 |
| `useMemo()` | 27 | 27 | 0 |

신규 컨트롤러는 311줄, 9,065 bytes이다.

## 6. 초기 정적 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 57 | 58 | +1 |
| 초기 정적 소스 | 815,170 bytes | 817,635 bytes | +2,465 bytes |

이번 단계는 지연 로딩 최적화가 아니라 인증 세션 책임 분리 작업이다.

## 7. 기능 보존

- 로그인 성공 시 기존 사용자 세션 정책 적용
- 세션 저장 위치 정책 유지: sessionStorage 또는 localStorage
- 보안정책 버전 불일치 시 재로그인
- 유휴 시간 초과 시 자동 로그아웃
- 절대 유지시간 초과 시 자동 로그아웃
- 활동 시 유휴 만료 연장
- 활동 갱신 시 절대 만료 시각 유지
- 세션 정보 누락·UID 불일치 시 재로그인
- 관리자 로그인 시 일반 사용자 세션 제거
- 기존 사용자 화면 문구와 context 키 유지

## 8. Firestore 영향

Firestore 접근 위치와 호출 수는 변경하지 않았다.

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot()`: 35
- `getDocs()`: 48
- `getDoc()`: 28
- `getCountFromServer()`: 18

Rules, 인덱스, Firebase 설정, 패키지 의존성은 변경하지 않았다.

## 9. 검증

- 입력 패키지 337개 파일 SHA-256: PASS
- React Hook import 감사: PASS
- TypeScript JSX/JS 구문 변환: PASS
- 표적 의미 진단 신규 오류: 0건
- 상대 import 실파일 검사: PASS
- Firestore strict 감사: PASS
- 사용자 인증 세션 runtime mock: PASS
- UI context의 `hasEstablishedUserSession` 계약 유지: PASS
- 실제 Vite 빌드: 검증 환경 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미수행
