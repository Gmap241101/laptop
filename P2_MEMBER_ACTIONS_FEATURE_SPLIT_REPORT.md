# 관리자 회원 액션 Feature 분리 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p2-member-accounts-controller-feature-split-deployment-package.zip`
- 작업 목적: `App.jsx`에 남아 있던 회원 상태 변경, 재가입 이력 검증, 명부 불일치 자동 복원, 전체 회원 명부 검사 로직을 회원 feature 모듈로 분리
- Firestore Rules, 인덱스, 컬렉션·문서 구조는 변경하지 않음

## 2. 변경 파일

### 기존 파일 수정

- `src/App.jsx`
- `src/admin/AdminMemberAccountsPanel.jsx`
- `src/context/appContextSlices.js`
- `tools/firestore-audit-policy.json`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 파일

- `src/features/members/memberAccountPolicy.js`
- `src/features/members/memberAccountIndexService.js`
- `src/features/members/memberAccountHistoryService.js`
- `src/features/members/useAdminMemberActions.js`

## 3. 분리된 회원 액션

`useAdminMemberActions()`가 다음 상태와 작업을 소유합니다.

- 회원 상태 저장 중 UID
- 전체 회원 명부 검사 진행 상태와 결과
- 재가입 회원 활성 승인 전 과거 계정의 진행 신청 검증
- 회원 상태 변경 및 복구키 상태 동기화
- 재가입 계정의 상속 대여 제한 복원
- 가입 제한 정책 해제 시 `DIRECTORY_MISMATCH` 회원 자동 복원
- 전체 회원 명부 검사
- 정보 수정 필요 회원 목록으로 이동
- 회원 상태 변경 확인창 연결

## 4. 재가입 회원 승인 안전성

활성 상태로 변경하려는 계정이 재가입 계정이면 연결된 현재·이전 UID의 대여 신청을 서버에서 다시 조회합니다.

```js
if (
  nextStatus === USER_PROFILE_STATUS.ACTIVE &&
  account.rejoinedAccount
) {
  const historySummary =
    await loadMemberAccountHistorySummary(account);

  if (historySummary.activeRequests > 0) {
    // 기존 신청이 남아 있으면 승인 중단
  }
}
```

연결 UID는 Firestore `in` 쿼리 제한에 맞춰 30개 단위로 분할합니다. 조회 대상 상태와 승인 차단 기준은 기존과 동일합니다.

## 5. 회원 상태 변경

다음 문서를 기존과 동일한 Write Batch에서 갱신합니다.

- `userAccounts/{uid}`
- `accountRecoveryKeys/{recoveryKey}`
- 필요한 경우 `rentalRestrictions/{uid}`

지원 상태도 유지했습니다.

- `pending`
- `active`
- `profileRequired`
- `blocked`
- `retired`

재가입 계정이 이전 계정의 활성 대여 제한을 상속한 경우, 활성 승인 시 제한 문서를 현재 UID에 복원합니다.

## 6. 명부 불일치 자동 복원

가입 제한 정책이 꺼져 있고 관리자 가입정책 화면이 열리면 다음 조건의 회원만 조회합니다.

```text
status == profileRequired
profileRequiredReason == directoryMismatch
```

복원 상태는 `statusBeforeProfileRequired`가 `active` 또는 `pending`이면 해당 상태를 사용하고, 그 외 값은 기존과 동일하게 `active`로 복원합니다. 복구키 문서의 `accountStatus`도 함께 갱신합니다.

`saveSignupPolicyChanges()`에서 정책을 끈 직후 실행하는 명시적 복원 경로도 기존대로 유지했습니다. 복원 실패 시 feature 훅의 시도 키를 초기화해 재시도할 수 있습니다.

## 7. 전체 회원 명부 검사

다음 전체 검사 로직을 `useAdminMemberActions()`로 이동했습니다.

1. 현재 부서·사용자 명부를 정규화하고 identity key 생성
2. `userAccounts`, `memberIdentityClaims`, `accountRecoveryKeys` 조회
3. 회원 계정 색인과 복구키 색인 재구성
4. 동일 부서·성명 중복 계정 판정
5. 명부 불일치 또는 중복 회원을 `profileRequired`로 전환
6. 정상 회원의 명부 버전과 확인 시각 갱신
7. 이전 `directoryMismatch` 상태가 해소된 회원 복원
8. `memberDirectoryAudit` 결과를 `publicConfig`에 기록

계정별 상태 저장은 기존처럼 개별 실패를 집계하면서 가능한 계정은 계속 처리합니다.

## 8. 공통 회원 서비스 분리

### `memberAccountPolicy.js`

- 명부 버전 정규화
- 가입 제한·자동 승인 정책 판정
- claim 현재 UID·이전 UID 정규화
- 복원할 회원 상태 판정
- 회원 상태 한글 라벨과 배지 클래스

### `memberAccountIndexService.js`

- Firestore 작업 400건 단위 커밋
- 회원 identity/recovery index 입력 생성
- identity claim, recovery key, 회원 메타데이터 작업 생성

### `memberAccountHistoryService.js`

- 현재 UID와 이전 UID의 전체 대여 이력 요약
- 이전 계정 이력 수
- 연체 이력 수
- 진행 중 신청·대여 수

## 9. 회원 패널 컨텍스트 축소

`AdminMemberAccountsPanel`은 다음 세 기능을 컨텍스트로 받지 않고 feature 모듈에서 직접 import합니다.

- `loadMemberAccountHistorySummary`
- `getUserAccountStatusLabel`
- `getUserAccountStatusClassName`

회원 패널 컨텍스트 항목 수:

| 구분 | 수정 전 | 수정 후 |
|---|---:|---:|
| 회원 패널 컨텍스트 | 25개 | 22개 |

회원 패널과 가입정책 패널의 실제 구조 분해 키를 컨텍스트 정의와 비교한 결과 누락·과잉 키는 0개입니다.

## 10. `App.jsx` 감소

| 지표 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 20,387줄 | 19,425줄 | -962줄 |
| 크기 | 591,011 bytes | 562,950 bytes | -28,061 bytes |
| `useState()` | 225개 | 222개 | -3개 |
| `useEffect()` | 68개 | 67개 | -1개 |
| `useRef()` | 21개 | 19개 | -2개 |
| `useMemo()` | 41개 | 41개 | 동일 |

## 11. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 33개 | 37개 | +4개 |
| 초기 정적 소스 | 819,594 bytes | 824,686 bytes | +5,092 bytes |
| 초기 소스 중 `App.jsx` 비중 | 약 72.1% | 약 68.3% | -3.8%p |

이번 단계는 다운로드 크기 감소보다 기능 결합도와 최상위 컴포넌트 복잡도 감소가 목적입니다. 신규 feature 파일이 정적 import되므로 초기 소스 총량은 약 5KB 증가했지만, `App.jsx` 자체는 약 28KB 감소했습니다.

## 12. Firestore 접근 변화

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 Firestore 접근 위치 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

조회 로직을 새 파일로 이동했기 때문에 Firestore 감사 승인 ID 5개를 새 파일 위치 기준으로 갱신했습니다. 승인 사유와 재검토 조건은 변경하지 않았습니다.

## 13. 변경하지 않은 영역

- 회원 상태 값과 화면 문구
- 가입 승인 차단 조건
- 재가입 이력 조회 범위
- 대여 제한 상속 방식
- 전체 명부 검사 판정 기준
- Firestore Rules
- Firestore 인덱스
- Firebase 설정
- 데이터 구조
- 다른 관리자·사용자 기능

## 14. 검증 결과

- JS·JSX·MJS 79개 파일 TypeScript `transpileModule` 검사: 오류 0건
- 상대 import 경로: 누락 0건
- 신규 feature 모듈 `node --check`: 통과
- 회원 정책 순수 함수 11개 런타임 검사: 통과
- 회원 관리 패널 컨텍스트 계약: 누락·과잉 0건
- 가입정책 패널 컨텍스트 계약: 누락·과잉 0건
- Firestore 엄격 감사: PASS
- Firestore 미승인 경고·오류: 0건

## 15. 프로덕션 빌드 제한

`npm ci --prefer-offline --no-audit --no-fund`는 현재 컨테이너의 `ClientError`로 완료되지 않았습니다. `npm run build`의 사전 Firestore 감사 단계는 통과했지만 `vite` 실행 파일이 없어 번들 생성은 실행되지 않았습니다.

```text
Firestore access audit: PASS
sh: 1: vite: not found
```

실제 프로젝트 PC의 `deploy.ps1`은 배포 전에 `npm run build`를 실행하므로 빌드 오류가 있으면 게시 전에 중단됩니다.
