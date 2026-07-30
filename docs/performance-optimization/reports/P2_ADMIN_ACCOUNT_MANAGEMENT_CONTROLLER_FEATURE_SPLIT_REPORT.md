# P2 관리자 계정 관리 컨트롤러 분리 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-admin-asset-crud-controller-split-20260730_1548_deployment_package.zip`
- 작업 범위: `App.jsx`에 남아 있던 관리자 계정 등록·수정·삭제·잠금과 관리자 본인정보 저장 상태 및 실행 흐름 분리
- 기능 변경: 없음
- UI·문구·Firestore 문서 구조 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 2. 신규 모듈

`src/features/auth/useAdminAccountManagementController.js`

이 모듈은 다음 책임을 소유한다.

- 관리자 계정 등록 폼 및 페이지 상태
- 관리자 계정 편집 상태와 편집 폼
- 관리자 본인정보 폼과 저장 진행 상태
- 관리자 등록 조직·사용자 선택값 계산
- 관리자 목록 페이지네이션 계산
- Firebase Auth 관리자 계정 생성과 실패 롤백
- 관리자 정보·권한 등급·본인 비밀번호 수정
- 관리자 비밀번호 재설정 메일 발송
- 마지막 관리자·마지막 최고 관리자 삭제 방지
- 관리자 권한 문서 삭제
- 최고 관리자 수동 잠금·잠금 해제
- 관리자 본인정보 중복 ID 재검증 및 저장

다음 공용 값도 같은 feature 경계로 이동하고 named export로 유지했다.

- `ADMIN_CUSTOM_OPTION_VALUE`
- `ADMIN_ACCOUNT_PAGE_SIZE`
- `createDefaultAdminAccountForm`
- `createDefaultAdminAccountEditForm`
- `useAdminAccountManagementState`

## 3. App.jsx 연결

`App.jsx`에는 다음 통합 경계만 남겼다.

- 관리자 계정 실시간 목록과 현재 Firebase Auth 역할 상태
- 관리자 인증 세션과 로그아웃
- 전역 confirm·toast
- 관리자 계정 탭 진입 시 등록 폼과 페이지 초기화
- 관리자 패널과 마이페이지 context 제공

기존 context에 노출되는 변수명과 함수명은 유지했다.

- `adminAccountForm`, `adminAccountEditForm`, `adminMyProfileForm`
- `registerAdminAccount`, `saveAdminAccountEdit`, `deleteAdminAccount`
- `toggleAdminAccountLock`, `sendAdminAccountPasswordResetEmail`
- `saveMyAdminProfile`, `startEditAdminAccount`, `cancelEditAdminAccount`

## 4. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 12,711 | 12,042 | -669 |
| `App.jsx` 바이트 | 376,638 | 355,160 | -21,478 |
| `App.jsx` `useState()` | 157 | 151 | -6 |
| `App.jsx` `useEffect()` | 59 | 58 | -1 |
| `App.jsx` `useMemo()` | 30 | 30 | 0 |
| `App.jsx` `useRef()` | 20 | 20 | 0 |
| 초기 정적 모듈 | 49 | 50 | +1 |
| 초기 정적 소스 | 794,659 bytes | 797,973 bytes | +3,314 bytes |

신규 컨트롤러는 813줄, 24,792 bytes다.

## 5. 기능 보존

다음 동작을 변경하지 않았다.

- 관리자 ID·이메일 중복 검사
- 최고 관리자만 최고 관리자 계정 등록·권한 변경 가능
- Firebase Auth 보조 인스턴스를 이용한 관리자 생성
- 관리자 생성 실패 시 Auth 사용자 삭제와 보조 세션 정리
- Firebase Auth 로그인 이메일 직접 변경 차단
- 본인 관리자만 현재 세션에서 비밀번호 직접 변경 가능
- 마지막 관리자 및 마지막 최고 관리자 보호
- 현재 로그인 중인 본인 계정 삭제·잠금 차단
- 관리자 문서 ID와 `authUid` 일치 검증
- 관리자 권한 삭제 시 Firebase Auth 계정은 유지하는 기존 정책
- 수동 잠금 시 장기 `lockUntil`과 잠금 사유 저장
- 관리자 본인정보 저장 전 서버 관리자 목록으로 ID 중복 재검증
- 본인정보 저장 후 현재 관리자 역할 상태와 목록 동기화

## 6. Firestore 영향

Firestore 접근 위치 총수는 129개로 유지된다.

- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

Firestore 호출 위치 이동으로 `tools/firestore-audit-policy.json`의 관리자 계정 중복 확인 `getDocs` 승인 ID만 새 소스 위치 기준으로 갱신했다. 승인 사유와 재검토 조건은 변경하지 않았다.

다음 배포 설정 파일은 수정하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`

## 7. 누적 삭제 목록

- 이전 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- `package-meta/REMOVED_FILES.txt`: 바이트 단위 승계

## 8. 검증 결론

React Hook import, JS·JSX 구문, 상대 import, 대상 TypeScript 의미 진단, 관리자 계정·마이페이지 context 계약, Firestore strict audit, 한국어 문자열 보존, 런타임 모의시험 및 ZIP 전수 해시 검증을 수행한다. 실제 Vite 빌드는 검증 환경의 npm 저장소에서 `yargs-parser-21.1.1.tgz`가 404를 반환하여 로컬 `deploy.ps1` 빌드 단계에서 최종 확인해야 한다.
