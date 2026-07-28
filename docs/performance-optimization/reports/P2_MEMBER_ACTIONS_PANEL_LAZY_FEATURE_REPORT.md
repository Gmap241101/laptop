# P2 회원 액션 패널 지연 로딩 Feature 분리 보고서

## 1. 작업 목적

`App.jsx`에서 정적으로 실행되던 `useAdminMemberActions`를 기능별로 분리하고, 실제 사용하는 지연 로딩 관리자 패널 내부로 이동했습니다.

분리 대상은 다음과 같습니다.

- 회원 상태 변경 및 재가입 승인 전 이력 확인
- 가입 제한 해제 후 명부 불일치 회원 자동 복원
- 전체 회원 명부 검사
- 검사 결과 상태와 정보 수정 필요 회원 화면 이동

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `src/admin/AdminMemberAccountsPanel.jsx`
- `src/admin/AdminOrganizationPanel.jsx`
- `src/admin/AdminSignupPolicyPanel.jsx`
- `src/context/appContextSlices.js`
- `src/features/members/useAdminMemberDirectorySaveActions.js`
- `tools/firestore-audit-policy.json`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/members/useAdminMemberAccountStatusActions.js`
- `src/features/members/useAdminMemberDirectoryAuditActions.js`

### 제거

- `src/features/members/useAdminMemberActions.js`

## 3. 수정 전 구조

```text
App.jsx
└─ useAdminMemberActions (정적 import, 21,126 bytes)
   ├─ 회원 상태 변경
   ├─ 재가입 이력 검사
   ├─ 명부 불일치 자동 복원
   ├─ 전체 회원 명부 검사
   └─ 검사 결과 상태
```

일반 사용자가 접속해도 통합 훅과 `memberAccountHistoryService`가 초기 정적 경로에 포함됐습니다.

## 4. 수정 후 구조

```text
App.jsx
└─ 회원 액션 훅 없음

AdminWorkspace (React.lazy)
├─ AdminMemberAccountsPanel
│  └─ useAdminMemberAccountStatusActions
│     └─ memberAccountHistoryService
└─ AdminSignupPolicyPanel
   └─ useAdminMemberDirectoryAuditActions
      ├─ 명부 불일치 자동 복원
      └─ 전체 회원 명부 검사
```

### 회원 상태 변경 훅

```jsx
const {
  adminUserAccountSavingUid,
  confirmUserAccountStatusChange,
} = useAdminMemberAccountStatusActions({
  isAdminAuthenticated,
  triggerConfirm,
  triggerToast,
});
```

회원 상태 변경과 재가입 회원의 진행 중 신청 확인은 회원 계정 관리 패널이 실제로 열렸을 때만 로드됩니다.

### 명부 검사 훅

```jsx
const {
  memberDirectoryAuditLoading,
  memberDirectoryAuditResult,
  openProfileRequiredMembers,
  resetDirectoryMismatchRestoreAttempt,
  restoreDirectoryMismatchAccountsAfterPolicyDisabled,
  runFullMemberDirectoryAudit,
} = useAdminMemberDirectoryAuditActions({
  authenticatedAdminAccount,
  authenticatedAdminId,
  borrowers: memberDirectoryBorrowers,
  isAdminAuthenticated,
  isSplitStorageReady,
  settings: signupPolicySettings,
  setAdminTab,
  setAdminUserAccountQuery,
  setAdminUserAccountStatusFilter,
  triggerConfirm,
  triggerToast,
});
```

가입 제한 자동 복원과 전체 회원 검사는 회원가입 정책 패널이 열렸을 때만 초기화됩니다.

## 5. `App.jsx` 제거 내용

다음 정적 import를 제거했습니다.

```jsx
import useAdminMemberActions from './features/members/useAdminMemberActions.js';
```

다음 최상위 훅 호출과 반환 상태도 제거했습니다.

```text
adminUserAccountSavingUid
confirmUserAccountStatusChange
memberDirectoryAuditLoading
memberDirectoryAuditResult
clearMemberDirectoryAuditResult
openProfileRequiredMembers
resetDirectoryMismatchRestoreAttempt
restoreDirectoryMismatchAccountsAfterPolicyDisabled
runFullMemberDirectoryAudit
```

## 6. 조직 명부 저장 액션 정리

`clearMemberDirectoryAuditResult`는 기존 통합 훅의 로컬 상태만 초기화했습니다. 조직 패널과 회원가입 정책 패널은 동시에 마운트되지 않으므로 조직 패널로 이동하는 순간 해당 로컬 상태는 이미 폐기됩니다.

따라서 다음 불필요한 교차 패널 의존성을 제거했습니다.

```jsx
clearMemberDirectoryAuditResult();
```

Firestore에 저장된 최근 검사 기록은 기존과 동일하게 유지됩니다.

## 7. 컨텍스트 계약

| 패널 | 수정 전 | 수정 후 | 누락·과잉 |
|---|---:|---:|---:|
| 부서·사용자 관리 | 15 | 14 | 0 |
| 회원가입 정책 | 17 | 18 | 0 |
| 회원 계정 관리 | 22 | 23 | 0 |

회원 계정 패널과 회원가입 정책 패널은 완성된 액션 함수를 전달받는 대신, 각 훅이 필요한 최소 인증·상태·알림 의존성을 전달받습니다.

## 8. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 37개 | 35개 | -2개 |
| 초기 정적 소스 | 806,925 bytes | 782,310 bytes | -24,615 bytes |
| 감소율 | - | - | 3.05% 감소 |
| 최상위 동적 진입점 | 13개 | 13개 | 동일 |

초기 경로에서 제외된 주요 파일은 다음과 같습니다.

- `useAdminMemberActions.js`
- `memberAccountHistoryService.js`
- 신규 회원 상태 액션 훅
- 신규 회원 명부 검사 훅

## 9. `App.jsx` 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 18,837 | 18,801 | -36 |
| 파일 크기 | 543,442 bytes | 542,334 bytes | -1,108 bytes |

## 10. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 접근 위치 | 123 | 123 |
| `onSnapshot()` | 32 | 32 |
| `getDocs()` | 48 | 48 |
| `getDoc()` | 23 | 23 |
| `getCountFromServer()` | 20 | 20 |

쿼리 조건과 호출 수는 변경하지 않았습니다. 이동된 4개 조회의 Firestore 감사 승인 ID만 신규 파일 위치를 기준으로 갱신했습니다.

## 11. 유지된 기능

- 회원 승인·차단·이용 종료·재활성화
- 재가입 승인 전 진행 중 신청 검사
- 과거 계정 제한 상속
- 가입 제한 해제 시 명부 불일치 회원 자동 복원
- 전체 회원 명부 검사
- 중복 identity 판정
- 정보 수정 필요 상태 전환
- 기존 검사 결과 표시
- 정보 수정 필요 회원 화면 이동
- 기존 문구·JSX·className

## 12. 검증 결과

- React Hook import 감사: PASS
- JS·JSX·MJS 변환 검사: 80개 PASS
- 미정의 식별자 `TS2304/TS2552`: 0건
- 상대 import: 164개, 누락 0건
- Firestore 엄격 감사: PASS
- 컨텍스트 계약: 3개 패널 모두 PASS
- 고유 한국어 문자열 삭제·추가: 0건
- Rules·인덱스·Firebase 설정·`package.json`: SHA-256 동일

실제 Vite 번들은 현재 검증 환경에 `vite` 실행 파일이 없어 생성하지 못했습니다. `npm run prebuild`까지는 정상 통과했습니다.

## 13. 패키지 검증

- 전체 패키지 manifest 파일: 221개
- 누락 파일: 0개
- SHA-256 불일치: 0개
- 변경 파일 패키지: 15개 파일
- 삭제 목록: `src/features/members/useAdminMemberActions.js`
- 교체 시뮬레이션: PASS
- `.git`, `node_modules`, `.env.local`, 패키지 외 로컬 파일 보존: PASS
