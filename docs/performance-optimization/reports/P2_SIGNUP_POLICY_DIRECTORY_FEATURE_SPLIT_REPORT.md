# 회원가입 정책·부서 사용자 명부 Feature 분리 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p2-member-actions-feature-split-deployment-package.zip`
- 작업 목적:
  - `App.jsx`에 남아 있던 회원가입 정책 임시 상태와 저장 로직 분리
  - 부서·사용자 명부 검증과 저장 로직 분리
  - 전체 회원 계정·식별키·복구키 색인 재구성 로직 분리
  - 기존 화면, Firestore 문서 구조, Rules, 인덱스 및 메시지 유지

## 2. 변경 파일

### 기존 파일 수정

- `src/App.jsx`
- `tools/firestore-audit-policy.json`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 파일

- `src/features/members/useAdminSignupPolicyDirectoryActions.js`
- `src/features/members/memberDirectorySaveService.js`

## 3. 분리한 기능

### `useAdminSignupPolicyDirectoryActions.js`

다음 상태와 액션을 소유한다.

- `tempRequireRegisteredMemberForSignup`
- `tempAutoApproveNewMembers`
- `signupPolicySaving`
- `signupPolicyDirty`
- `peopleSettingsDirty`
- 회원가입 정책 변경 취소
- 회원가입 정책 저장
- 명부 제한 해제 후 `directoryMismatch` 회원 자동 복원 호출
- 부서·사용자 변경 취소
- 부서·사용자 명부 저장
- 저장 성공 후 편집 상태 초기화

### `memberDirectorySaveService.js`

다음 업무를 담당한다.

- 부서명 정규화
- 중복 부서 검사
- 사용자명·부서 정규화
- 사용자명 형식 검사
- 동일 부서 내 중복 사용자 검사
- 신규 사용자 문서 ID 생성
- `memberDirectoryKeys` identity key 생성
- 전체 `userAccounts` 기반 계정 색인 재구성
- 전체 `memberIdentityClaims` 재구성
- 전체 `accountRecoveryKeys` 재구성
- 삭제된 명부·사용자 문서 정리
- `memberDirectoryVersion` 증가
- `memberIdentityClaimsReady: true` 저장

명부 저장 서비스는 실제 저장 버튼을 누를 때만 동적 import된다.

## 4. 회원가입 정책 저장

기존 정책은 유지한다.

```text
등록 명부 확인 ON
→ 자동 승인 옵션 사용 가능

등록 명부 확인 OFF
→ 자동 승인도 강제로 OFF
→ 명부 불일치로 전환된 기존 회원 상태 자동 복원 시도
```

저장 문서:

```text
rentalSystem/publicConfig
```

저장 필드:

```text
settings.requireRegisteredMemberForSignup
settings.autoApproveNewMembers
settings.memberDirectoryVersion
updatedAt
```

가입 제한 활성화 여부가 변경될 때만 명부 버전을 1 증가시킨다.

## 5. 부서·사용자 명부 저장

검증 순서:

1. 부서명 공백 정리
2. 빈 부서 제거
3. 대소문자를 무시한 부서 중복 검사
4. 사용자명과 부서명 정규화
5. 존재하지 않는 부서에 속한 사용자 제외
6. 사용자명 형식 검사
7. 동일 부서 내 사용자명 중복 검사
8. directory identity key 생성
9. 계정·claim·복구키 전체 재색인
10. 명부 버전 증가 및 공개 설정 저장

저장·정리 대상:

```text
rentalBorrowers
memberDirectoryKeys
memberIdentityClaims
accountRecoveryKeys
userAccounts 일부 색인 필드
rentalSystem/publicConfig
```

## 6. 기존 동작 유지

다음 동작과 문구는 변경하지 않았다.

- 부서·사용자 탭 진입 시 임시 목록 초기화
- 드래그 순서 저장
- 변경 취소
- 저장하지 않은 상태에서 관리자 메뉴 이동 시 확인창
- 가입 제한 해제 후 회원 자동 복원
- 재가입 이력 및 대여 제한 상속
- 명부 저장 후 전체 검사 결과 초기화
- 기존 성공·오류 메시지
- Firestore 컬렉션 및 문서 필드

## 7. 코드 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 19,425 | 19,050 | -375 |
| `App.jsx` 크기 | 562,950 bytes | 550,747 bytes | -12,203 bytes |
| `App.jsx` `useState()` | 222 | 219 | -3 |
| `App.jsx` `useEffect()` | 67 | 66 | -1 |
| `App.jsx` `useMemo()` | 41 | 39 | -2 |
| `App.jsx` `useRef()` | 19 | 19 | 동일 |

신규 모듈:

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `useAdminSignupPolicyDirectoryActions.js` | 372 | 10,622 bytes |
| `memberDirectorySaveService.js` | 260 | 6,685 bytes |

## 8. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 37 | 38 | +1 |
| 초기 정적 소스 | 824,686 bytes | 823,105 bytes | -1,581 bytes |
| 동적 진입점 | 13 | 14 | +1 |

`memberDirectorySaveService.js`는 명부 저장 시점에만 로드되므로 초기 정적 경로에서 제외됐다.

## 9. Firestore 접근 변화

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 접근 위치 | 123 | 123 |
| `onSnapshot()` | 32 | 32 |
| `getDocs()` | 48 | 48 |
| `getDoc()` | 23 | 23 |
| `getCountFromServer()` | 20 | 20 |

조회 개수와 조건은 변경하지 않고 위치만 feature 서비스로 이동했다.

명부 저장 시 수행하는 전체 조회 4건:

- `userAccounts`
- `memberDirectoryKeys`
- `memberIdentityClaims`
- `accountRecoveryKeys`

관리자가 명부 저장을 직접 실행할 때만 수행되는 일회성 무결성 작업이다. 기존 Firestore 감사 예외의 ID만 새 파일 위치 기준으로 갱신했다.

## 10. Firestore Rules·인덱스

변경 없음.

```text
rules/firestore.rules      변경 없음
firestore.indexes.json     변경 없음
firebase.json              변경 없음
```

따라서 Rules 또는 인덱스 단독 배포는 필요하지 않다.

## 11. 검증 결과

- JS·JSX·MJS 변환 검사: 81개, 오류 0건
- 상대 import 검사: 160개, 누락 0건
- Firestore 엄격 감사: PASS
- Firestore 미승인 경고: 0건
- Firestore 미승인 오류: 0건
- 회원 관리 패널 컨텍스트: 39/39 일치
- 회원가입 정책 패널 컨텍스트: 17/17 일치
- 기존 고유 한국어 문자열 삭제: 0건
- 신규 고유 한국어 화면 문자열: 0건
- 부서·사용자 검증 모의검사: 통과
- 전체 색인 저장 모의검사: 통과

## 12. 프로덕션 빌드 제한

`npm ci --no-audit --no-fund`를 실행했으나 컨테이너 `ClientError`로 완료되지 않았다. `node_modules/.bin/vite`가 생성되지 않아 실제 Vite 프로덕션 빌드는 이 환경에서 수행하지 못했다.

다만 실제 프로젝트의 `deploy.ps1`은 게시 전에 다음 단계를 실행한다.

```text
Firestore 엄격 감사
→ Vite 프로덕션 빌드
→ 배포
```

빌드 오류가 발생하면 게시 전에 중단된다.

## 13. 배포

Rules와 인덱스 변경이 없으므로 웹만 배포한다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
