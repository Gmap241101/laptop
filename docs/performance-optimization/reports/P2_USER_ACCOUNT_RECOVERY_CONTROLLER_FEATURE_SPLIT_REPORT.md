# 사용자 계정 복구 컨트롤러 Feature 분리 보고서

## 1. 작업 목적

`src/App.jsx`에 직접 들어 있던 사용자 이메일 찾기와 비밀번호 재설정 상태·이벤트 처리를 인증 feature 훅으로 분리했다.

이번 단계는 사전에 정한 인증 분리 순서 중 첫 번째 작업이다.

1. 이메일 찾기·비밀번호 재설정 상태와 제출 컨트롤러
2. 로그인·로그아웃 상태와 제출 컨트롤러
3. 회원가입 제출 흐름
4. 인증 화면 이동·초기화 정리

이번 작업에서는 1번만 수행했다. 사용자 로그인, 로그아웃, 회원가입, 세션 만료, 회원 명부 재검증 로직은 이동하지 않았다.

## 2. 변경 파일

### 기존 파일 수정

- `src/App.jsx`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 파일

- `src/features/auth/useUserAccountRecoveryController.js`
- `docs/performance-optimization/diffs/P2_USER_ACCOUNT_RECOVERY_CONTROLLER_FEATURE_SPLIT.diff`
- `docs/performance-optimization/measurements/P2_USER_ACCOUNT_RECOVERY_CONTROLLER_SOURCE_GRAPH_COMPARISON.json`
- `docs/performance-optimization/reports/P2_USER_ACCOUNT_RECOVERY_CONTROLLER_FEATURE_SPLIT_REPORT.md`
- `docs/performance-optimization/validation/P2_USER_ACCOUNT_RECOVERY_CONTROLLER_FEATURE_SPLIT_VALIDATION_REPORT.txt`

### 삭제 파일

- 없음

기존 `package-meta/REMOVED_FILES.txt`의 누적 삭제 목록은 변경 없이 승계한다.

## 3. 주요 변경 내용

### 3.1 계정 복구 상태를 feature 훅으로 이동

수정 전에는 `App.jsx`가 다음 6개 상태를 직접 소유했다.

```jsx
const [accountRecoveryForm, setAccountRecoveryForm] = useState(...);
const [accountRecoveryLoading, setAccountRecoveryLoading] = useState(false);
const [accountRecoveryResult, setAccountRecoveryResult] = useState(null);
const [passwordResetForm, setPasswordResetForm] = useState(...);
const [passwordResetLoading, setPasswordResetLoading] = useState(false);
const [passwordResetVerificationResult, setPasswordResetVerificationResult] = useState(null);
```

수정 후에는 `useUserAccountRecoveryController()`가 상태를 소유하고 `App.jsx`는 사용자 인증 패널에 필요한 값과 조작 함수만 전달한다.

```jsx
const {
  accountRecoveryForm,
  accountRecoveryLoading,
  accountRecoveryResult,
  goToUserEmailRecovery,
  goToUserPasswordReset,
  passwordResetForm,
  passwordResetLoading,
  passwordResetVerificationResult,
  resetAccountRecoveryForLogin,
  resetAccountRecoverySearch,
  setAccountRecoveryForm,
  submitAccountRecovery,
  submitPasswordReset,
  updatePasswordResetForm,
} = useUserAccountRecoveryController(...);
```

### 3.2 이메일 찾기 처리 이동

다음 처리 전체를 신규 훅으로 옮겼다.

- 성명·부서·연락처 검증
- 복구키 조회
- 마스킹 이메일 결과 저장
- 조회 실패 토스트
- 계정 존재 여부 노출을 완화하기 위한 최소 600ms 응답 지연
- 검색 결과 초기화

기존 `accountRecoveryService.js`를 그대로 사용하며 Firestore 조회 조건은 변경하지 않았다.

### 3.3 비밀번호 재설정 처리 이동

다음 처리 전체를 신규 훅으로 옮겼다.

- 가입 이메일·성명·부서·연락처 검증
- 복합 SHA-256 `emailVerifier` 비교
- 기존 계정의 검증값 누락 안내
- 네 항목 불일치 안내
- Firebase 비밀번호 재설정 메일 발송
- 성공 시 `passwordResetSent` 상태 화면 전환
- 검증 결과 초기화
- 최소 600ms 응답 지연

메일 발송 조건과 사용자 안내 문구는 변경하지 않았다.

### 3.4 계정 복구 화면 이동 처리 이동

신규 훅이 다음 화면 이동을 소유한다.

- 로그인 화면 → 이메일 찾기
- 로그인 화면 → 비밀번호 재설정
- 이메일 찾기 결과 → 입력값을 유지한 비밀번호 재설정

기존 `pushAppPath('user', ...)`, `setView('user')`, `setUserTab(...)`, 커뮤니티 메뉴 닫기 순서를 유지했다.

로그인 화면으로 돌아갈 때 필요한 계정 복구 상태 초기화는 `resetAccountRecoveryForLogin()`으로 묶었다.

## 4. 유지된 기능과 미변경 영역

다음 동작은 변경하지 않았다.

- 로그인 제출
- 로그아웃
- 회원가입과 약관 동의
- 회원가입 Firestore transaction
- 사용자 세션 저장·갱신·만료
- 회원 명부 재검증
- 관리자 로그인과 관리자 비밀번호 재설정
- `UserAuthPanel.jsx` UI, 문구, 버튼 배열, className
- Firestore 컬렉션·문서 경로
- Firestore Rules와 인덱스
- 계정 복구 SHA-256 키 생성 규칙
- 600ms 최소 응답 지연

## 5. 코드 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 17,353줄 | 17,225줄 | -128줄 |
| `App.jsx` 크기 | 507,096 bytes | 502,785 bytes | -4,311 bytes |
| `App.jsx` `useState()` | 195개 | 189개 | -6개 |
| `App.jsx` `useEffect()` | 59개 | 59개 | 0개 |
| `App.jsx` `useRef()` | 21개 | 21개 | 0개 |
| `App.jsx` `useMemo()` | 33개 | 33개 | 0개 |
| 신규 계정 복구 훅 | 없음 | 198줄 / 6,276 bytes | +1개 |

## 6. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 39개 | 40개 | +1개 |
| 초기 정적 소스 | 768,222 bytes | 770,187 bytes | +1,965 bytes |
| `App.jsx` 소스 | 507,096 bytes | 502,785 bytes | -4,311 bytes |

이번 단계는 지연 로딩 최적화가 아니라 구조 분리다. 전용 훅의 import·반환 계약이 추가되어 초기 정적 소스 총량은 증가했다. 후속 로그인·로그아웃·회원가입 분리에서 동일 인증 feature 경계를 확장하면 중복 연결 비용을 다시 평가한다.

## 7. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 Firestore 접근 위치 | 129개 | 129개 | 0개 |
| `onSnapshot()` | 35개 | 35개 | 0개 |
| `getDocs()` | 48개 | 48개 | 0개 |
| `getDoc()` | 28개 | 28개 | 0개 |
| `getCountFromServer()` | 18개 | 18개 | 0개 |

계정 복구 서비스의 `getDoc()` 호출 위치, 문서 경로, 실행 횟수는 변경하지 않았다.

## 8. 컨텍스트 계약

`appContextSlices.js`의 사용자 인증 context 키 33개를 다음 세 위치와 대조했다.

- 인증 context 정의
- `App.jsx`의 `uiContext` 제공값
- `UserAuthPanel.jsx`의 `ctx` 구조 분해

검사 결과:

```text
정의 키: 33
실제 제공: 33
패널 사용: 33
누락: 0
과잉: 0
```

## 9. 배포 영향

다음 파일은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`

`deploy.ps1`은 로컬 v13.1 보호 파일이므로 풀패키지에 포함하지 않았다. 따라서 이번 작업은 React 소스만 배포하면 된다. Firestore Rules와 인덱스 재배포는 필요하지 않다.

## 10. 다음 분리 우선순위

다음 순차 작업은 사용자 로그인·로그아웃 상태와 제출 컨트롤러 분리다. 회원가입 transaction은 로그인·로그아웃 분리 검증 후 별도 단계에서 진행한다.
