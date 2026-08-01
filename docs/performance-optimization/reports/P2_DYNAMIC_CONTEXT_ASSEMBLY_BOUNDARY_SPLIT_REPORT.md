# P2 동적 Context 조립 경계 분리 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-admin-account-tab-initialization-effect-transfer-20260802_0152_deployment_package.zip`
- 작업 범위: `App.jsx`의 `dynamicContextValueGroups` 직접 조립 제거
- 목표: 화면 Context의 기능 그룹 및 파생값 조립 책임을 Context 계층으로 이동
- 기능 변경: 없음

## 2. 문제 구조

기준본에서는 `App.jsx`가 `shared`, `identity`, `rental`, `boards`, `operations`, `content`, `dialogs`의 7개 중첩 객체를 직접 조립했습니다. 그러나 `useAppContextAssembler`는 이 객체를 즉시 하나의 평면 객체로 다시 병합한 뒤 `APP_CONTEXT_GROUP_KEYS`로 화면별 Context를 재선택했습니다.

따라서 기능 그룹 객체는 실제 화면 계약이 아니라 `App.jsx` 내부의 중간 조립 단계였고 다음 문제가 있었습니다.

- `App.jsx`가 Context 그룹 내부 구조를 직접 알아야 함
- 회원·신청 준비 상태 같은 파생 키 계산이 최상위 컴포넌트에 남음
- 지연 상태 콜백의 내부 이름과 공개 Context 이름 변환이 `App.jsx`에 노출됨
- 중첩 그룹 생성 후 즉시 평면화하는 중복 조립 발생

## 3. 수정 내용

### 3.1 App.jsx

`dynamicContextValueGroups` 7개 중첩 그룹을 제거하고, 화면 Context의 원재료만 담은 평면 `dynamicContextSourceValues` 계약으로 변경했습니다.

`App.jsx`는 더 이상 다음 사항을 결정하지 않습니다.

- 값이 `shared`, `identity`, `rental` 등 어느 중간 그룹에 속하는지
- 회원 계정 화면의 준비 상태 계산
- 관리자 신청 화면의 준비 상태 계산
- 회원 명부용 `data.borrowers`, `data.settings`, `data.teams` 별칭 생성
- 내부 지연 상태 콜백을 공개 Context 콜백 이름으로 변환하는 작업

### 3.2 appDynamicContextValues.js

기존의 중첩 그룹 평면화 함수 `mergeAppDynamicContextValueGroups`를 `createAppDynamicContextValues`로 교체했습니다.

새 함수는 다음 작업을 수행합니다.

1. App이 전달한 평면 원본 값을 유지
2. 내부 전용 콜백 3개를 원본 이름으로는 노출하지 않음
3. 공개 Context 별칭 3개 생성
4. 회원·신청 준비 상태와 회원 명부 데이터 별칭 6개 생성
5. 최종 평면 동적 Context 계약 반환

### 3.3 useAppContextAssembler.js

입력 계약을 `dynamicValueGroups`에서 `dynamicSourceValues`로 변경했습니다.

Context 조립 계층에서 `createAppDynamicContextValues(dynamicSourceValues)`를 실행한 뒤 기존과 동일하게 정적 값과 합치고, `APP_CONTEXT_GROUP_KEYS`로 화면별 최소 Context를 생성합니다.

### 3.4 자동 감사 확장

`tools/audit-app-flow-contracts.mjs`에 다음 검사를 추가했습니다.

- App이 평면 동적 Context 원본 계약을 제공하는지
- App에 중첩 `dynamicContextValueGroups` 구현이 남아 있지 않은지
- Context assembler가 Context 계층의 파생 함수로 위임하는지
- 파생 공개 키 9개가 모두 존재하는지
- 내부 콜백 이름이 추가 Context 키로 누출되지 않는지

## 4. Context 계약 보존

| 항목 | 수정 전 | 수정 후 |
|---|---:|---:|
| App 원본 동적 값 | 379개 | 379개 |
| 내부 전용 콜백 | 3개 | 3개 |
| 파생 공개 Context 키 | 9개 | 9개 |
| 최종 공개 동적 Context 키 | 385개 | 385개 |
| 누락 | 0개 | 0개 |
| 추가 | 0개 | 0개 |
| 중복 | 0개 | 0개 |
| 중간 기능 그룹 | 7개 | 0개 |

화면별 Context 키 선택은 기존 `APP_CONTEXT_GROUP_KEYS`를 그대로 사용하므로 각 사용자·관리자 패널이 받는 최종 값의 이름과 참조는 변경되지 않았습니다.

## 5. 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| App.jsx 줄 수 | 2,173 | 2,137 | -36 |
| App.jsx 바이트 | 67,448 | 66,164 | -1,284 |
| App.jsx 직접 useState | 1 | 1 | 0 |
| App.jsx 직접 useEffect | 0 | 0 | 0 |
| App.jsx 직접 useMemo | 0 | 0 | 0 |
| App.jsx 직접 useRef | 0 | 0 | 0 |
| App.jsx 직접 useCallback | 0 | 0 | 0 |
| 초기 정적 모듈 | 87 | 87 | 0 |
| 초기 정적 소스 | 880,935 bytes | 879,655 bytes | -1,280 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

## 6. Firestore 영향

Firestore 호출, 쿼리 조건, Rules, 인덱스 및 Firebase 설정은 변경하지 않았습니다.

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| onSnapshot | 35 | 35 |
| getDocs | 48 | 48 |
| getDoc | 28 | 28 |
| getCountFromServer | 18 | 18 |
| runTransaction | 24 | 24 |
| setDoc | 34 | 34 |
| updateDoc | 5 | 5 |
| deleteDoc | 6 | 6 |

## 7. 기능 보존

- 회원 계정 선행 준비 상태: 동일
- 관리자 신청 선행 준비 상태: 동일
- 회원 명부 데이터 별칭: 동일 참조 유지
- 회원 명부·가입 정책 지연 상태 콜백: 동일 함수 참조 유지
- 관리자 신청 패널 상태 변경 콜백: 동일 함수 참조 유지
- 사용자·관리자 Context 선택 키: 동일
- 화면 문구: 추가 0개, 삭제 0개
- Firestore 접근: 증가 0건

## 8. 빌드 판정

- `npm run prebuild`: PASS
- `npm ci`: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 실패
- 실제 Vite 빌드: 미수행
- 로컬 `deploy.ps1`에서 `npm run build` 성공 확인 필요
