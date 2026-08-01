# P2 앱 초기화·준비 상태 조립부 분리 보고서

## 1. 기준본과 결과물

- 기준 패키지: `rental-system-dead-code-unused-binding-cleanup-20260801_2255_deployment_package.zip`
- 결과 패키지: `rental-system-app-initialization-readiness-controller-split-20260801_2318_deployment_package.zip`
- 작업 목적: `App.jsx`에 남아 있던 사이트 공통 설정 초기화, 문서 메타데이터 반영, 반응형 자산 그리드 계산 및 인증·관리자 화면 준비 상태 계산을 전용 모듈로 분리

## 2. 신규 모듈

### 2.1 `src/features/settings/useSiteSettingsController.js`

다음 책임을 이동했다.

- `rentalSystem/siteSettings` 실시간 구독
- 문서 미존재 시 기본 사이트 설정 적용
- 구독 오류 시 기본 설정 fallback 및 오류 메시지 유지
- MK 주황색 CSS 변수 반영
- 브라우저 제목 반영
- meta description 생성·갱신
- favicon 생성·갱신
- 원본 설정과 정규화 설정의 단일 공급

기존 사용자 문구와 Firestore 조회 대상은 변경하지 않았다.

### 2.2 `src/hooks/useResponsiveAssetGridColumns.js`

관리자 자산 편집 패널의 삽입 위치 계산에 사용하는 열 수를 별도 Hook으로 이동했다.

- 1280px 이상: 3열
- 640px 이상: 2열
- 그 미만: 1열
- 최신 `MediaQueryList.addEventListener()`와 구형 `addListener()` 모두 지원
- 같은 breakpoint 안에서의 불필요한 상태 갱신 방지

### 2.3 `src/selectors/appReadinessSelectors.js`

다음 파생 상태를 순수 선택자로 이동했다.

- Firebase 인증 세션 존재 여부
- 현재 Firebase 계정의 관리자·일반회원 판정
- 등록 명부 정책 활성화 여부
- 회원 identity claim 준비 상태
- 회원 명부 버전 불일치에 따른 접근 제한
- 회원 명부 감사 상태
- 분리 저장소 준비 여부
- 관리자 로딩 화면 표시 조건
- 관리자 계정 오류 화면 표시 조건
- 관리자 로그인 화면 표시 조건
- 관리자 실제 접근 가능 여부

## 3. `App.jsx` 연결 변경

사이트 설정은 다음 전용 Hook에서 공급한다.

```jsx
const {
  normalizedSiteSettings,
  siteSettings,
  siteSettingsLoadErrorMessage,
  siteSettingsReady,
} = useSiteSettingsController();
```

반응형 열 수는 다음 한 줄로 교체했다.

```jsx
const assetGridColumns = useResponsiveAssetGridColumns();
```

인증·데이터 준비 상태는 관리자 인증 컨트롤러 실행 후 한 번에 계산한다.

```jsx
const {
  hasAdminAccess,
  hasFirebaseAuthSession,
  isCurrentFirebaseAuthAdmin,
  isCurrentFirebaseAuthGeneralUser,
  isSplitStorageReady,
  isUserDirectoryAccessRestricted,
  memberDirectoryAudit,
  memberDirectoryPolicyEnabled,
  memberIdentityClaimsReady,
  shouldShowAdminAccountsErrorPage,
  shouldShowAdminLoadingPage,
  shouldShowAdminLoginPage,
} = selectAppReadiness({
  adminAccountsLoadErrorMessage,
  adminAccountsReady,
  adminLogoutInProgress,
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  dataSettings: data.settings,
  firebaseAuthCurrentUser: firebaseAuth.currentUser,
  firebaseAuthReady,
  firebaseAuthUser,
  firebaseLoadErrorMessage,
  firebaseReady,
  isAdminAuthenticated,
  splitPublicConfig,
  splitStorageVersion,
  userProfile,
  view,
});
```

## 4. 기능 보존

| 기능 | 결과 |
|---|---|
| 사이트 설정 실시간 구독 | 유지 |
| 사이트 설정 오류 fallback | 유지 |
| 시스템 안내 배너 설정 공급 | 유지 |
| 사이트 로고·제목·메타 설명 공급 | 유지 |
| CSS 브랜드 색상 변수 | 유지 |
| 자산 카드 반응형 열 수 | 유지 |
| 관리자 로딩·로그인·오류 화면 조건 | 유지 |
| 일반회원·관리자 역할 판정 | 유지 |
| 회원 명부 버전 제한 | 유지 |
| 분리 저장소 준비 판정 | 유지 |
| 사용자·관리자 컨텍스트 키 | 변경 없음 |
| Firestore 문서 구조·쿼리 조건 | 변경 없음 |

## 5. `App.jsx` 감소

| 항목 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 3,215 | 3,084 | -131 |
| 크기 | 97,415 bytes | 93,060 bytes | -4,355 bytes |
| `useState()` | 21 | 17 | -4 |
| `useEffect()` | 6 | 3 | -3 |
| `useMemo()` | 19 | 19 | 0 |
| `useRef()` | 4 | 4 | 0 |
| `useCallback()` | 10 | 10 | 0 |
| `onSnapshot()` | 1 | 0 | -1 |

`onSnapshot()`은 제거된 것이 아니라 사이트 설정 컨트롤러로 이동했다.

## 6. 신규 모듈 규모

| 파일 | 줄 수 | 크기 |
|---|---:|---:|
| `useSiteSettingsController.js` | 91 | 3,018 bytes |
| `useResponsiveAssetGridColumns.js` | 60 | 1,558 bytes |
| `appReadinessSelectors.js` | 101 | 2,964 bytes |

## 7. 초기 소스 그래프

| 항목 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 78 | 81 | +3 |
| 초기 정적 소스 | 875,401 bytes | 878,249 bytes | +2,848 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

세 모듈은 앱 초기 설정과 화면 준비 상태에 필요하므로 정적 import를 유지했다. 기존 관리자·사용자 화면의 동적 로딩 경계는 변경하지 않았다.

## 8. Firestore 영향

| 호출 | 기준본 | 수정본 | 변화 |
|---|---:|---:|---:|
| 전체 감사 대상 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

다음 파일은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `tools/firestore-audit-policy.json`
- `package.json`
- `package-lock.json`

Firebase Rules와 인덱스 배포는 필요하지 않다.

## 9. 검증 요약

- 입력 패키지 SHA-256: 438/438 PASS
- JS·JSX·MJS 구문 분석: 137개 PASS
- 미사용 바인딩: 0개
- React Hook import 감사: PASS
- 상대 import: 413개, 누락 0개
- Firestore strict 감사: PASS
- 준비 상태 선택자 runtime mock: PASS
- 사이트 문서 표시 runtime mock: PASS
- 반응형 그리드 breakpoint runtime mock: PASS
- 한국어 토큰: 14,851 → 14,851
- 한국어 고유 토큰: 2,562 → 2,562
- 실제 Vite 빌드: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 미완료

## 10. 다음 단계

1. 관리자 화면 이동·미저장 변경 중재 컨트롤러 분리
2. 대여 신청 날짜 입력 JSX와 선택 자산 자동 해제 effect 분리
3. 실제 소비되지 않는 컨텍스트 공급값 최종 감사
4. 사용자·관리자 주요 흐름 회귀 검사와 로컬 Vite 프로덕션 빌드
