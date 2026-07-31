# P2 관리자 인증 컨트롤러 분리 보고서

## 1. 기준본과 작업 범위

- 입력 기준본: `rental-system-admin-data-maintenance-controller-split-20260730_1757_deployment_package.zip`
- 작업 대상: `src/App.jsx`의 관리자 로그인, 로그아웃, 세션 저장, 유휴 만료, 절대 만료, 보안정책 변경 재로그인, 계정 잠금 및 Firebase Auth 일치 검증
- 신규 모듈:
  - `src/features/auth/useAdminAuthenticationController.js`
  - `src/features/auth/authSessionService.js`
- UI, Firestore 문서 구조, Rules, 인덱스, 사용자 문구 변경: 없음

## 2. 분리된 상태

다음 관리자 인증 상태를 `useAdminAuthenticationState()`로 이동했습니다.

- 관리자 로그인 폼
- 로그인 처리 중 상태
- 로그아웃 처리 중 상태
- 인증된 관리자 ID
- 유휴 세션 만료 시각
- 절대 세션 만료 시각
- 관리자 보안정책 버전
- 중복 로그아웃 방지 ref

`App.jsx`에는 상태 Hook의 반환값과 관리자 화면 context 연결만 남겼습니다.

## 3. 분리된 인증 실행 흐름

### 관리자 로그인

- 로그인 이메일·비밀번호 필수 검증
- 관리자 보안 설정에 따른 Firebase Auth persistence 적용
- 일반회원 세션 제거
- Firebase Email/Password 로그인
- `adminAccounts/{uid}` 권한 문서 조회
- 문서 ID·`id`·`authUid` 일치 검증
- 잠금 계정 로그인 차단
- 최근 로그인 시각과 Auth 메타데이터 저장
- 최신 시스템 보안 설정 재조회
- 관리자 세션 생성
- 관리자 대시보드 이동
- 실패 시 Firebase Auth 정리와 로컬 세션 제거

### 관리자 로그아웃

- 중복 로그아웃 차단
- 관리자 Firebase Auth 세션만 선택적으로 로그아웃
- 관리자 세션 제거
- 보호된 사용자 화면에서 로그아웃한 경우 사용자 홈으로 이동
- Firebase Auth 로그아웃 실패 시 별도 오류 안내

### 관리자 세션 보안

- 유휴 시간 만료 타이머
- 절대 세션 만료 상한 유지
- pointerdown·keydown·scroll·touchstart 및 visibilitychange에 따른 활동 갱신
- 30초 미만 연속 활동 갱신 제한
- 보안정책 버전 변경 시 즉시 재로그인 요구
- 관리자 권한 문서 삭제·UID 불일치·계정 잠금 시 세션 제거
- 세션 저장 위치를 브라우저 종료 정책에 따라 sessionStorage/localStorage로 선택

## 4. 공용 인증 세션 서비스

`authSessionService.js`로 다음 공용 기능을 이동했습니다.

- 관리자·사용자 세션 읽기, 저장, 삭제
- 유휴 만료와 절대 만료 계산
- 정책 버전과 최근 활동 시각 저장
- Firebase Auth persistence 설정
- 관리자 로그인 폼 기본값 생성

사용자 로그인·회원가입 컨트롤러는 기존과 동일하게 `configureFirebaseAuthPersistence()`를 전달받아 사용합니다. 사용자 세션 정책과 저장 형식은 변경하지 않았습니다.

## 5. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 10,176 | 9,559 | -617 |
| 크기 | 296,485 bytes | 277,692 bytes | -18,793 bytes |
| `useState()` | 122 | 114 | -8 |
| `useEffect()` | 55 | 52 | -3 |
| `useRef()` | 20 | 19 | -1 |
| `useMemo()` | 27 | 27 | 0 |
| `getDoc()` | 6 | 4 | -2 |
| `setDoc()` | 1 | 0 | -1 |

신규 모듈 규모:

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `useAdminAuthenticationController.js` | 614 | 17,928 bytes |
| `authSessionService.js` | 206 | 5,593 bytes |

## 6. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 55 | 57 | +2 |
| 초기 정적 소스 | 810,442 bytes | 815,170 bytes | +4,728 bytes |

이번 단계는 지연 로딩이 아니라 인증 책임을 `App.jsx` 밖으로 이동하는 구조 분리입니다.

## 7. Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot`: 35 → 35
- `getDocs`: 48 → 48
- `getDoc`: 28 → 28
- `getCountFromServer`: 18 → 18
- 로그인 과정의 단일 관리자 문서 및 보안 설정 문서 조회 위치만 신규 컨트롤러로 이동
- Firestore Rules·인덱스·Firebase 설정 변경 없음
- Firestore 감사 정책 변경 없음

## 8. UI 및 문구 보존

전체 `src`의 한국어 문자열을 비교했습니다.

- 발생 횟수: 2,186 → 2,186
- 고유 문자열: 1,693 → 1,693
- 삭제된 문자열: 0개
- 추가된 문자열: 0개

관리자 로그인 폼, 버튼, 로딩 문구, 성공·실패 토스트, 로그아웃 버튼과 관리자 인증 표시 UI는 변경하지 않았습니다.

## 9. 삭제 파일

- 이번 작업 신규 삭제 경로: 0개
- 기존 `package-meta/REMOVED_FILES.txt` 누적 목록 그대로 승계
