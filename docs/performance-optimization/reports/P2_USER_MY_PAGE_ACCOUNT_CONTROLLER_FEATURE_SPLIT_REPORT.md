# P2 사용자 마이페이지 계정 컨트롤러 분리 보고서

- 작업 일시: 2026-07-30 14:21 KST
- 입력 기준본: `rental-system-user-signup-controller-split-20260730_1400_deployment_package.zip`
- 작업 코드: `P2_USER_MY_PAGE_ACCOUNT_CONTROLLER_FEATURE_SPLIT`
- 작업 목적: `App.jsx`가 직접 소유하던 일반 회원 마이페이지 기본정보 수정 및 회원 탈퇴 상태·실행 흐름을 feature controller로 이동

## 1. 작업 범위

신규 파일 `src/features/members/useUserMyPageAccountController.js`를 추가했다.

이 파일은 다음 두 경계를 제공한다.

1. `useUserMyPageAccountState`
   - 회원정보 수정 폼
   - 회원정보 저장 로딩
   - 회원 탈퇴 확인창
   - 탈퇴 재인증 비밀번호
   - 탈퇴 처리 로딩

2. `useUserMyPageAccountController`
   - 탈퇴 가능 여부 메시지 계산
   - 일반 회원 기본정보 저장
   - 탈퇴 확인창 열기·취소
   - 현재 비밀번호 재인증 후 회원 탈퇴
   - 탈퇴 transaction 실패 시 Firestore 상태 복원

마이페이지 진입 재인증 및 비밀번호 변경은 이미 `src/features/members/useUserMyPageSecurity.js`에 분리되어 있으므로 이번 작업에서 중복 이동하거나 동작을 변경하지 않았다.

## 2. `App.jsx` 변경

### 제거한 직접 소유 상태

- `userProfileForm`
- `userProfileSaving`
- `withdrawalDialogOpen`
- `withdrawalPassword`
- `withdrawalLoading`

### 제거한 직접 실행 로직

- `withdrawalBlockMessage` 계산
- `saveMyUserProfile`
- `openWithdrawalDialog`
- `cancelWithdrawal`
- `submitMembershipWithdrawal`

### 유지한 통합 경계

- Firebase Auth 사용자 상태
- 사용자 계정 Firestore snapshot listener
- 대여 신청·제한 상태 계산
- 사용자 계정 상태 변경 자동 이동·로그아웃
- `UserMyPagePanel` context 제공

## 3. 기능 보존

다음 동작과 데이터 구조를 변경하지 않았다.

- 성명 형식 검증
- 부서·팀 필수 검증 및 등록 명부 정책 적용
- 국내 연락처 검증
- 회원 identity claim 생성·해제
- 계정 복구키 및 이메일 검증값 갱신
- 명부 불일치 상태 정상 복원
- Firebase Auth displayName 갱신
- 진행 중 신청·대여 및 검토 중 사용자 요청에 대한 탈퇴 차단
- 연체 및 대여 제한 상태에 대한 탈퇴 차단
- 탈퇴 전 현재 비밀번호 재인증
- 탈퇴 회원 개인정보 비식별화
- claim restriction snapshot 및 과거 연체 횟수 보존
- Firebase Auth 사용자 삭제 실패 시 Firestore rollback
- 화면 문구, 버튼, className, Firestore 컬렉션·문서 구조

## 4. 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 16,513 | 15,946 | -567 |
| `App.jsx` 크기 | 478,977 bytes | 460,043 bytes | -18,934 bytes |
| `App.jsx` `useState()` | 187 | 182 | -5 |
| `App.jsx` `useMemo()` | 33 | 32 | -1 |
| `App.jsx` `useEffect()` | 59 | 59 | 0 |
| `App.jsx` `useRef()` | 21 | 21 | 0 |
| 신규 컨트롤러 | 없음 | 722줄 / 22,785 bytes | +1 파일 |
| 초기 정적 모듈 | 43 | 44 | +1 |
| 초기 정적 소스 | 779,356 bytes | 783,207 bytes | +3,851 bytes |

이번 단계는 지연 로딩이 아니라 책임 분리 작업이다. `App.jsx`에서 제거한 코드보다 신규 모듈의 import 및 controller 경계 코드가 더 크므로 초기 정적 소스는 3,851 bytes 증가했다.

## 5. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 접근 위치 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

다음 파일은 입력 기준본과 SHA-256이 동일하다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`

Firebase Rules와 인덱스 배포는 필요하지 않다.

## 6. 삭제 파일 누적 관리

- 직전 `REMOVED_FILES.txt`: 67개
- 이번 신규 삭제: 0개
- 복원되어 제외한 경로: 0개
- 최종 누적 삭제: 67개
- 중복 경로: 0개
- 기존 `REMOVED_FILES.txt` SHA-256 유지: `17ad59f08176c623ca2eaa4d3b232992555e62b3ad1b22c824cb1af10778f212`

## 7. 검증 결과

- 입력 기준본 프로젝트 파일 274개 SHA-256: PASS
- TypeScript transpile syntax 검사 104개 파일: PASS
- TypeScript 표적 의미 검사 99개 파일: PASS
- React Hook import 감사 99개 파일: PASS
- 상대 import 253개 실파일 해석: PASS
- Firestore strict 감사: PASS
- 한국어 문자열 집합 비교: 삭제 0 / 추가 0
- 마이페이지 계정 컨트롤러 runtime mock 7개 시나리오: PASS
- 실제 Vite 빌드: 검증 환경 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미수행

실제 배포 전 로컬 `deploy.ps1`의 `npm run build` 성공을 반드시 확인해야 한다.
