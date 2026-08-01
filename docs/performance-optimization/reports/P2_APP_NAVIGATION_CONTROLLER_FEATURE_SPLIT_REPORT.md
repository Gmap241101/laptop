# P2 App Navigation Controller Feature Split Report

## 1. 작업 개요

- 입력 기준본: `rental-system-popup-footer-content-subscription-controller-split-20260801_1810_deployment_package.zip`
- 작업 대상: `src/App.jsx`의 화면 이동, 브라우저 경로 동기화, 보호 사용자 화면 리다이렉트, 커뮤니티 메뉴 닫기 처리
- 신규 모듈: `src/routing/useAppNavigationController.js`
- 기능 변경 원칙: 라우팅 경로, 로그인 복귀 대상, 보호 화면 접근 정책, 회원 명부 제한 정책, 관리자 전환 안내와 사용자 문구를 변경하지 않고 소유권만 이전

## 2. 분리한 상태

`useAppNavigationState()`로 다음 상태와 ref를 이동했다.

- `view`
- `userTab`
- `selectedFooterPageId`
- `isCommunityMenuOpen`
- `pendingProtectedUserTabRef`
- `communityMenuRef`

기존 변수명과 setter 이름은 유지해 인증, 사용자 작업공간, 관리자 작업공간 및 context 계약을 변경하지 않았다.

## 3. 분리한 실행 흐름

`useAppNavigationController()`가 다음 기능을 담당한다.

- 현재 사용자 경로를 로그인 후 복귀 대상으로 정규화·저장
- 로그인 성공 후 저장된 사용자 경로로 복귀
- 사용자 홈, 공지사항, FAQ, 마이페이지, 푸터 상세 이동
- 대여 신청·신청내역 보호 경로 접근 통제
- Firebase Auth 및 현재 역할 확인 전 보호 경로 요청 보류
- 비로그인 사용자의 로그인 화면 리다이렉트
- 회원 명부 확인이 필요한 사용자의 마이페이지 리다이렉트
- 관리자 계정이 사용자 마이페이지로 접근할 때 관리자 모드 이동
- 계정 상태 안내 화면 이동과 sessionStorage 기록
- `popstate` 기반 뒤로 가기·앞으로 가기 경로 동기화
- `/board`에서 `/board/notice`로 정규화
- 사용자 보호 경로에서 세션 소멸 시 로그인 화면 이동
- 커뮤니티 메뉴 외부 클릭 및 Escape 닫기

## 4. App.jsx에 남긴 통합 경계

다음은 다른 feature의 미저장 변경 처리와 직접 결합되어 있어 이번 단계에서 유지했다.

- `goToAppHome()`
- `handleAdminTabChange()`
- 관리자 설정별 저장·폐기 확인창
- 인증 feature controller에 전달하는 기존 `setView`, `setUserTab`, `setIsCommunityMenuOpen` 호환 bridge
- `UserMyPagePanel`의 기존 `pushAppPath` 및 `setView` context 계약

이 영역은 이후 context 조립부 정리 단계에서 일괄 축소한다.

## 5. 기존 동작 보존

- 사용자 홈·공지사항·FAQ 이동 시 화면 상단으로 즉시 이동
- 푸터 상세 이동 시 부드러운 스크롤
- 로그인·회원가입 화면에서 다른 공개 화면 이동 시 로그인 복귀 대상 삭제
- 존재하지 않거나 비활성화된 푸터 페이지 복귀 요청은 사용자 홈으로 대체
- 대여 신청·신청내역은 로그인 필요
- 등록 회원 명부 확인 필요 계정은 마이페이지로 이동
- 관리자 계정의 사용자 마이페이지 접근 시 관리자 재인증 안내
- 계정 상태 안내 화면의 sessionStorage 저장
- 관리자 초기화면 배너 미저장 확인 절차 유지

기존에 선택 상태를 직접 초기화하지 않던 마이페이지, 계정 상태 화면, 푸터 상세 이동은 동일하게 유지하도록 `preserveFooterSelection` 및 `preserveNoticeSelection` 옵션을 사용했다.

## 6. 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 5,089 | 4,708 | -381 |
| `App.jsx` 크기 | 147,858 bytes | 138,899 bytes | -8,959 bytes |
| `App.jsx` `useState()` | 29 | 25 | -4 |
| `App.jsx` `useEffect()` | 13 | 9 | -4 |
| `App.jsx` `useRef()` | 7 | 5 | -2 |
| 초기 정적 모듈 | 68 | 69 | +1 |
| 초기 정적 소스 | 858,961 bytes | 863,209 bytes | +4,248 bytes |

신규 컨트롤러는 511줄, 13,207 bytes이다. 이번 단계는 번들 지연 로딩이 아니라 `App.jsx` 책임 분리 작업이므로 초기 정적 모듈이 1개 증가했다.

## 7. Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot()`: 35 → 35
- `getDocs()`: 48 → 48
- `getDoc()`: 28 → 28
- `getCountFromServer()`: 18 → 18
- Firestore Rules 변경 없음
- Firestore 인덱스 변경 없음
- Firestore 감사 정책 변경 없음

## 8. 검증 결과

- React Hook import 감사 통과
- Firestore strict 감사 통과
- 상대 import 379개 검사, 누락 0개
- TypeScript 기준본 대비 신규 의미 오류 0건
- 한국어 문자열 발생 2,196 → 2,196, 삭제·추가 0건
- 사용자 푸터 경로 이동 runtime mock 통과
- 존재하지 않는 푸터 경로의 홈 fallback runtime mock 통과
- 계정 상태 화면 이동 runtime mock 통과
- 비로그인 보호 경로의 로그인 리다이렉트 runtime mock 통과
- 관리자 계정의 마이페이지 접근 시 관리자 모드 이동 runtime mock 통과

## 9. 실제 Vite 빌드 제한

검증 환경에서 `npm ci --ignore-scripts` 실행 시 내부 npm 저장소가 `yargs-parser-21.1.1.tgz`를 반환하지 않아 실제 Vite 프로덕션 빌드를 완료하지 못했다. 로컬 `deploy.ps1`에서 `npm run build`와 최종 완료 메시지를 확인해야 한다.

## 10. 다음 우선순위

1. 전역 UI 상태 컨트롤러
2. 대시보드 파생값·선택자 모듈
3. 초기화·구형 데이터 호환성 서비스
4. context 조립부 및 최종 `App.jsx` 셸 정리
