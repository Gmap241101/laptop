# P2 추가 지연 로딩 최적화 적용 보고서

## 1. 작업 기준

기준 패키지:

```text
rental-system-p2-public-catalog-write-through-deployment-package.zip
```

이번 단계는 사용자 최초 진입 경로에 남아 있던 대화상자, 팝업, 관리자 집계 및 관리자 자산 쓰기 모듈을 실제 사용 시점까지 지연하는 작업이다.

Firestore 데이터 구조, Rules, 인덱스, 업무 상태 전환 로직은 변경하지 않았다.

---

## 2. 수정 파일

기존 파일 수정:

```text
src/App.jsx
src/hooks/useDashboardSummary.js
SOURCE_GRAPH_ANALYSIS_REPORT.json
```

신규 파일:

```text
src/services/publicAssetCatalogWriteThroughLoader.js
P2_ADDITIONAL_LAZY_LOADING_REPORT.md
P2_ADDITIONAL_LAZY_LOADING_VALIDATION_REPORT.txt
P2_ADDITIONAL_LAZY_LOADING_SOURCE_GRAPH_COMPARISON.json
```

---

## 3. 초기 정적 그래프 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32개 | 29개 | 3개 감소 |
| 초기 정적 소스 크기 | 885,031 bytes | 822,570 bytes | 62,461 bytes 감소 |
| 초기 정적 소스 감소율 | - | - | 7.06% 감소 |
| 최상위 동적 진입점 | 10개 | 13개 | 3개 증가 |

초기 경로에서 지연된 주요 모듈:

| 모듈 | 소스 크기 | 로드 시점 |
|---|---:|---|
| `src/dialogs/AppDialogs.jsx` | 46,152 bytes | 최초 사용자 상호작용 또는 대화상자·토스트·확인창 표시 시 |
| `src/user/UserPopupLayer.jsx` | 10,712 bytes | 사용자 홈·대여 화면에 팝업 데이터가 실제로 존재할 때 |
| `src/services/dashboardSummaryService.js` | 14,463 bytes | 인증된 관리자가 관리자 화면에 진입하여 요약을 구독·갱신할 때 |
| `src/services/publicAssetCatalogWriteThrough.js` | 7,126 bytes | 관리자 로그인 후 카탈로그 점검 또는 자산 쓰기 작업 시 |

`useMinuteClock.js`는 사용자 팝업 레이어와 관리자 팝업 패널에서만 사용된다. 사용자 팝업 레이어가 지연되면서 이 모듈도 사용자 초기 정적 그래프에서 함께 제외됐다.

---

## 4. `AppDialogs` 지연 로딩

### 수정 전

```jsx
import AppDialogs from './dialogs/AppDialogs.jsx';

const MemoizedAppDialogs = React.memo(AppDialogs);
```

앱이 시작되면 대화상자가 하나도 열리지 않아도 약 46KB의 대화상자 모듈이 초기 정적 그래프에 포함됐다.

### 수정 후

```jsx
let appDialogsModulePromise = null;

const loadAppDialogsModule = () => {
  if (!appDialogsModulePromise) {
    appDialogsModulePromise = import('./dialogs/AppDialogs.jsx').catch(
      (error) => {
        appDialogsModulePromise = null;
        throw error;
      }
    );
  }

  return appDialogsModulePromise;
};

const AppDialogs = React.lazy(loadAppDialogsModule);
const MemoizedAppDialogs = React.memo(AppDialogs);
```

동적 import가 실패하면 캐시된 실패 Promise를 제거하여 다음 시도에서 다시 불러올 수 있도록 했다.

---

## 5. 대화상자 조건부 마운트

대화상자 모듈은 다음 상태 중 하나가 실제로 존재할 때만 렌더링한다.

```jsx
const hasVisibleAppDialog = Boolean(
  adminRequestEditDialog ||
    adminRequestRestoreDialog ||
    userActionDialog ||
    popupPostDialog ||
    faqPostDialog ||
    noticePostDialog ||
    confirmModal ||
    toast
);
```

```jsx
{shouldRenderAppDialogs && (
  <React.Suspense fallback={null}>
    <DevRenderProfiler id="Shared:AppDialogs">
      <MemoizedAppDialogs ctx={contextGroups.app.dialogs} />
    </DevRenderProfiler>
  </React.Suspense>
)}
```

최초 사용 후에는 컴포넌트를 유지한다.

```jsx
const [appDialogsActivated, setAppDialogsActivated] = useState(false);

useEffect(() => {
  if (hasVisibleAppDialog && !appDialogsActivated) {
    setAppDialogsActivated(true);
  }
}, [appDialogsActivated, hasVisibleAppDialog]);

const shouldRenderAppDialogs =
  hasVisibleAppDialog || appDialogsActivated;
```

이 방식으로 토스트의 종료 애니메이션과 대화상자 내부 상태를 기존처럼 유지한다.

---

## 6. 첫 사용자 상호작용 시 대화상자 사전 로드

토스트나 확인창은 버튼 클릭 직후 표시되는 경우가 많다. 최초 클릭 뒤 모듈을 불러오느라 표시가 늦어지는 현상을 줄이기 위해 `pointerdown` 또는 `keydown`에서 대화상자 청크를 사전 로드한다.

```jsx
useEffect(() => {
  if (appDialogsActivated || typeof window === 'undefined') {
    return undefined;
  }

  const preloadAppDialogs = () => {
    void loadAppDialogsModule().catch((error) => {
      console.error('App dialogs preload error:', error);
    });

    window.removeEventListener('pointerdown', preloadAppDialogs);
    window.removeEventListener('keydown', preloadAppDialogs);
  };

  window.addEventListener('pointerdown', preloadAppDialogs, {
    once: true,
    passive: true,
  });
  window.addEventListener('keydown', preloadAppDialogs, {
    once: true,
  });

  return () => {
    window.removeEventListener('pointerdown', preloadAppDialogs);
    window.removeEventListener('keydown', preloadAppDialogs);
  };
}, [appDialogsActivated]);
```

페이지 최초 렌더링에는 포함되지 않지만, 사용자가 첫 버튼을 누르는 시점부터 청크 다운로드를 시작한다.

---

## 7. 사용자 팝업 레이어 지연 로딩

### 수정 전

```jsx
import UserPopupLayer from './user/UserPopupLayer.jsx';
```

### 수정 후

```jsx
const UserPopupLayer = React.lazy(() =>
  import('./user/UserPopupLayer.jsx')
);

const MemoizedUserPopupLayer = React.memo(UserPopupLayer);
```

팝업 데이터가 비어 있으면 팝업 레이어 자체를 로드하지 않는다.

```jsx
const shouldMountUserPopupLayer =
  view === 'user' &&
  Array.isArray(popupPosts) &&
  popupPosts.length > 0 &&
  (userTab === 'home' ||
    (userTab === 'rental' && Boolean(firebaseAuthUser)));
```

```jsx
{shouldMountUserPopupLayer && (
  <React.Suspense fallback={null}>
    <DevRenderProfiler id="Shared:UserPopupLayer">
      <MemoizedUserPopupLayer ctx={contextGroups.app.popup} />
    </DevRenderProfiler>
  </React.Suspense>
)}
```

팝업 문서가 0건인 일반 사용자 홈에서는 해당 JavaScript 청크를 받지 않는다.

---

## 8. 관리자 대시보드 집계 서비스 지연 로딩

### 수정 전

```jsx
import {
  DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS,
  DASHBOARD_SUMMARY_SCHEMA_VERSION,
  getDashboardSummaryGeneratedAtMillis,
  normalizeDashboardSummary,
  refreshDashboardSummaryDocument,
} from '../services/dashboardSummaryService.js';
```

일반 사용자 화면에서도 관리자 집계 서비스가 초기 정적 그래프에 포함됐다.

### 수정 후

```jsx
let dashboardSummaryServicePromise = null;

const loadDashboardSummaryService = () => {
  if (!dashboardSummaryServicePromise) {
    dashboardSummaryServicePromise = import(
      '../services/dashboardSummaryService.js'
    ).catch((error) => {
      dashboardSummaryServicePromise = null;
      throw error;
    });
  }

  return dashboardSummaryServicePromise;
};
```

요약 갱신 시:

```jsx
const { refreshDashboardSummaryDocument } =
  await loadDashboardSummaryService();

const nextSummary = await refreshDashboardSummaryDocument({
  adminUid,
});
```

요약 구독 시:

```jsx
const { normalizeDashboardSummary } =
  await loadDashboardSummaryService();
```

오래된 요약 판단 시:

```jsx
const {
  DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS,
  DASHBOARD_SUMMARY_SCHEMA_VERSION,
  getDashboardSummaryGeneratedAtMillis,
} = await loadDashboardSummaryService();
```

관리자 화면이 아닌 경우 이 모듈을 불러오지 않는다. 비동기 구독 초기화 중 화면이 바뀌는 경우를 대비해 `cancelled`와 `unsubscribe` 정리도 포함했다.

---

## 9. 공개 카탈로그 쓰기 서비스 지연 로딩

신규 파일:

```text
src/services/publicAssetCatalogWriteThroughLoader.js
```

### 로더

```js
let publicAssetCatalogWriteThroughServicePromise = null;

export const loadPublicAssetCatalogWriteThroughService = () => {
  if (!publicAssetCatalogWriteThroughServicePromise) {
    publicAssetCatalogWriteThroughServicePromise = import(
      './publicAssetCatalogWriteThrough.js'
    ).catch((error) => {
      publicAssetCatalogWriteThroughServicePromise = null;
      throw error;
    });
  }

  return publicAssetCatalogWriteThroughServicePromise;
};
```

기존 함수 이름을 유지하는 비동기 래퍼를 제공한다.

```js
export const writePublicAssetCatalogMutationInTransaction =
  async (...args) => {
    const service =
      await loadPublicAssetCatalogWriteThroughService();

    return service.writePublicAssetCatalogMutationInTransaction(
      ...args
    );
  };
```

적용 함수:

```text
createPublicAssetCatalogPayload
ensurePublicAssetCatalogWriteThrough
getPublicAssetCatalogWriteErrorMessage
rebuildPublicAssetCatalogFromServer
writePublicAssetCatalogMutationInTransaction
```

`App.jsx`의 기존 작업 흐름과 함수 이름은 유지하고, 반환값을 사용하는 위치에 `await`를 적용했다.

```jsx
const catalogPayload =
  await createPublicAssetCatalogPayload(
    nextCatalogAssets,
    options
  );
```

```jsx
const catalogErrorMessage =
  await getPublicAssetCatalogWriteErrorMessage(error);
```

일반 사용자 최초 진입에서는 이 서비스를 로드하지 않는다. 관리자 로그인 후 스키마 점검 또는 실제 자산 추가·수정·삭제·업로드·복원 작업에서 로드한다.

---

## 10. Firestore 비용 및 데이터 동작

이번 작업은 JavaScript 코드 분할 작업이다.

```text
Firestore onSnapshot 호출 위치: 34개 → 34개
```

변경하지 않은 항목:

```text
Firestore Rules
Firestore 인덱스
Firebase 설정
컬렉션 및 문서 구조
요약 갱신 조건
공개 카탈로그 write-through 트랜잭션
사용자 팝업 표시 조건
토스트 및 확인창 동작
```

따라서 Rules 또는 인덱스 재배포는 필요하지 않다.

---

## 11. 검증 결과

| 항목 | 결과 |
|---|---:|
| JavaScript·JSX·MJS 구문 검사 | 67개 통과 |
| 상대 import 경로 검사 | 누락 0건 |
| `AppDialogs` 정적 import | 제거 |
| `UserPopupLayer` 정적 import | 제거 |
| 대시보드 서비스 정적 import | 제거 |
| App의 공개 카탈로그 쓰기 서비스 직접 import | 제거 |
| 동적 import 실패 후 재시도 가능 | 적용 |
| 대화상자 최초 상호작용 사전 로드 | 적용 |
| 팝업 0건일 때 팝업 레이어 미로드 | 적용 |
| Firestore 리스너 호출 위치 | 34개 유지 |
| Rules 변경 | 없음 |
| 인덱스 변경 | 없음 |
| npm 의존성 변경 | 없음 |

### 프로덕션 빌드 제한

작업 환경에서 `npm ci --no-audit --no-fund` 실행이 컨테이너 `ClientError`로 종료됐다. `node_modules/.bin/vite`가 존재하지 않아 실제 Vite 프로덕션 빌드는 수행하지 못했다.

대신 TypeScript `transpileModule`을 사용하여 프로젝트의 JavaScript·JSX·MJS 67개 파일을 파싱하고 변환했으며 오류는 0건이었다.

실제 프로젝트 PC의 `deploy.ps1`은 배포 전에 `npm run build`를 실행하므로 빌드 오류가 있으면 게시 전에 중단된다.

---

## 12. 배포

Rules와 인덱스는 변경하지 않았으므로 웹만 배포한다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
