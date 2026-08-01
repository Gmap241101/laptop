# P2 App 동적 컨텍스트 값 조립부 분리 보고서

## 1. 기준본과 출력본

- 기준본: `rental-system-app-shell-component-split-20260801_2212_deployment_package.zip`
- 출력본: `rental-system-app-dynamic-context-values-split-20260801_2227_deployment_package.zip`
- 변경 목적: `App.jsx`의 388개 평면 동적 컨텍스트 값을 기능별 소스 그룹으로 분리하고, 병합·중복 검증 책임을 컨텍스트 모듈로 이동한다.

## 2. 변경 구조

### 신규 파일

`src/context/appDynamicContextValues.js`

- 허용된 동적 컨텍스트 그룹 순서를 정의한다.
- 기능별 그룹을 기존 평면 컨텍스트 계약으로 병합한다.
- 서로 다른 그룹에 동일 키가 들어오면 즉시 오류를 발생시킨다.
- 지원하지 않는 그룹명이 전달되면 즉시 오류를 발생시킨다.

### 수정 파일

`src/context/useAppContextAssembler.js`

- 기존 `dynamicValues` 평면 객체 대신 `dynamicValueGroups`를 입력받는다.
- 신규 병합기를 호출한 후 기존 `APP_CONTEXT_GROUP_KEYS`와 `useStableContextGroups()` 계약을 그대로 사용한다.

`src/App.jsx`

- 388개 값이 혼재된 단일 `dynamicContextValues` 객체를 제거했다.
- 값을 다음 7개 그룹으로 분리했다.

| 그룹 | 키 수 | 범위 |
|---|---:|---|
| `shared` | 34 | 여러 화면이 공동 사용하는 인증, 데이터, 이동, 토스트 값 |
| `identity` | 86 | 사용자 인증, 회원, 관리자 계정 값 |
| `rental` | 82 | 대여 신청, 신청내역, 관리자 신청, 자산 값 |
| `boards` | 80 | 공지사항, FAQ 값 |
| `operations` | 41 | 시스템 설정, 공휴일, 운영 관리 값 |
| `content` | 36 | 팝업, 푸터 값 |
| `dialogs` | 29 | 공통 대화상자 값 |
| 합계 | 388 | 기존 평면 계약과 동일 |

## 3. 계약 보존

기준본의 388개 동적 컨텍스트 키와 수정본의 병합 결과를 비교했다.

- 누락 키: 0개
- 추가 키: 0개
- 중복 키: 0개
- 값 표현식 변경: 0개
- 정적 컨텍스트 키: 78개 유지
- 전체 컨텍스트 계약: 466개 유지

화면별 컨텍스트 슬라이스와 패널 키 계산 방식은 변경하지 않았다.

## 4. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 3,683 | 3,419 | -264 |
| 파일 크기 | 104,423 bytes | 104,035 bytes | -388 bytes |
| `useState()` | 21 | 21 | 0 |
| `useEffect()` | 6 | 6 | 0 |
| `useMemo()` | 19 | 19 | 0 |
| `useRef()` | 4 | 4 | 0 |
| `useCallback()` | 10 | 10 | 0 |

줄 수 감소는 컨텍스트 값을 기능별 묶음으로 정리하면서 단순 shorthand 항목을 압축 배치한 결과다. 상태 수와 실행 흐름은 변경하지 않았다.

## 5. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 76 | 77 | +1 |
| 초기 정적 소스 | 876,398 bytes | 877,545 bytes | +1,147 bytes |

신규 병합 모듈은 앱 컨텍스트 조립에 필수이므로 정적 import로 연결했다. 기존 동적 화면 청크는 변경하지 않았다.

## 6. Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot()`: 35 → 35
- `getDocs()`: 48 → 48
- `getDoc()`: 28 → 28
- `getCountFromServer()`: 18 → 18

Rules, 인덱스, Firebase 설정 및 감사 정책은 변경하지 않았다.

## 7. 검증 요약

- React Hook import 감사: PASS
- Firestore strict 감사: PASS
- TypeScript transpile 구문 검사: PASS
- 상대 import 실파일 검사: PASS
- 388개 동적 컨텍스트 계약 비교: PASS
- 중복 키 및 미지원 그룹 runtime guard: PASS
- 한국어 문자열 리터럴 보존: PASS
- 실제 Vite 빌드: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미완료

## 8. 패키지 구조

- 프로젝트 파일: 429개
- `package-meta` 파일: 4개
- ZIP 전체 항목: 433개
- 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- `REMOVED_FILES.txt` SHA-256: `17ad59f08176c623ca2eaa4d3b232992555e62b3ad1b22c824cb1af10778f212`
