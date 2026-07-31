# P2 사용자 회원 상태·명부 재검증 컨트롤러 분리 보고서

- 생성: 2026-07-31 16:16 KST
- 기준본: `rental-system-user-authentication-session-controller-split-20260731_1555_deployment_package.zip`
- 출력본: `rental-system-user-membership-status-controller-split-20260731_1616_deployment_package.zip`

## 1. 작업 범위

`App.jsx`에 남아 있던 다음 책임을 `src/features/members/useUserMembershipStatusController.js`로 이동했다.

- 사용자 회원 상태 변경 감지
- `profile_required` 상태의 마이페이지 강제 이동
- 회원 상태 복원 후 대여 화면 복귀
- 승인 대기·차단·퇴직 계정의 자동 로그아웃
- 등록 회원 명부 정책 버전 변경 감지
- 명부·회원 식별 claim 재검증 transaction
- 계정 복구키의 계정 상태 동기화
- 명부 검증 중 상태와 중복 실행 방지 ref

## 2. 신규 상태 Hook

`useUserMembershipStatusState()`가 다음 상태와 ref를 소유한다.

- `userDirectoryVerificationLoading`
- `userDirectoryVerificationKeyRef`
- `profileRequiredRedirectRef`
- `userStatusLogoutInProgressRef`

`userStatusLogoutInProgressRef`는 기존 보호 화면 로그인 리다이렉트 효과와의 경합 방지에 계속 사용된다.

## 3. 신규 컨트롤러

`useUserMembershipStatusController()`는 다음 함수를 반환한다.

```js
return {
  verifyUserDirectoryMembership,
};
```

반환 함수는 사용자 로그인 컨트롤러에 기존 이름 그대로 전달된다.

```jsx
verifyUserDirectoryMembership,
```

## 4. 회원 상태 자동 처리

- `active`: 명부 불일치 해소 후 마이페이지에 있었다면 대여 화면으로 복귀
- `profile_required`: 마이페이지로 이동하여 성명·부서 수정 유도
- `pending`: 승인 대기 안내 화면으로 이동 후 로그아웃
- `blocked`: 이용 제한 안내 화면으로 이동 후 로그아웃
- 그 밖의 비활성 상태: 퇴직·탈퇴 안내 화면으로 이동 후 로그아웃

자동 로그아웃 시 사용자 세션, Firebase Auth 세션, 관리자 인증 세션, 로그인 복귀 대상과 사용자 인증 폼을 기존 순서대로 정리한다.

## 5. 명부 정책 재검증

다음 조건에서 명부 재검증을 수행한다.

- 명부 불일치로 `profile_required` 상태인 계정
- 명부 정책이 활성화되어 있고 `directoryVerifiedVersion`이 최신 정책 버전과 다른 활성 계정

transaction은 다음 문서를 일관되게 갱신한다.

- `userAccounts/{uid}`
- `memberDirectoryKeys/{identityKey}`
- `memberIdentityClaims/{identityKey}`
- `accountRecoveryKeys/{recoveryKey}`
- `rentalSystem/publicConfig`

명부 정책이 해제된 경우 명부 불일치로 제한된 계정은 이전 상태로 복원한다. 명부와 identity claim이 정상인 경우 최신 정책 버전을 기록한다. 불일치 또는 중복 identity가 확인되면 `profile_required` 상태로 전환한다.

## 6. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 9,363 | 8,918 | -445 |
| 파일 크기 | 271,446 bytes | 258,159 bytes | -13,287 bytes |
| `useState()` | 110 | 109 | -1 |
| `useEffect()` | 50 | 48 | -2 |
| `useRef()` | 18 | 15 | -3 |
| `runTransaction()` | 4 | 3 | -1 |

신규 컨트롤러는 570줄, 17,434 bytes다.

## 7. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 58 | 59 | +1 |
| 초기 정적 소스 | 817,635 bytes | 821,860 bytes | +4,225 bytes |

이번 작업은 지연 로딩이 아니라 책임 분리 단계다.

## 8. 기능·UI 보존

- 기존 한국어 문자열 발생 집합 유지
- 사용자 마이페이지 context의 `userDirectoryVerificationLoading` 유지
- 사용자 로그인 컨트롤러의 명부 검증 함수 계약 유지
- Firestore Rules·인덱스·Firebase 설정 변경 없음
- Firestore 감사 대상 호출 수 129건 유지
- 버튼·화면·문구·className 변경 없음

## 9. 삭제 목록

이번 작업의 신규 삭제 경로는 없다. 기존 `package-meta/REMOVED_FILES.txt`를 그대로 누적 승계한다.

## 10. 빌드 판정

정적 구문·Hook·상대 import·Firestore 감사·런타임 모의시험은 통과했다. 검증 환경의 내부 npm 저장소가 `yargs-parser-21.1.1.tgz`를 404로 반환하여 실제 Vite 프로덕션 빌드는 로컬 `deploy.ps1`에서 확인해야 한다.

## 11. 패키지 구성

- 프로젝트 파일: 347개
- `package-meta` 파일: 4개
- ZIP 전체 파일: 351개
- 신규 삭제 경로: 0개
- 누적 삭제 경로: 67개(설명 주석 제외)
