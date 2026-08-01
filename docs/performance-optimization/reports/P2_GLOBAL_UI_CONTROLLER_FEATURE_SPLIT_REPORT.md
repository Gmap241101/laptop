# P2 전역 UI 상태 컨트롤러 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-app-navigation-controller-split-20260801_1838_deployment_package.zip`
- 작업 범위: 전역 토스트, 확인 모달, 시스템 안내 닫기 상태, 앱 대화상자 지연 활성화·사전 로드
- 기능 정책 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/ui/useGlobalUiController.js`
- `src/dialogs/appDialogsLoader.js`
- 본 작업의 diff·보고서·검증 보고서·소스 그래프 비교 파일

### 삭제

- 신규 삭제 파일 없음
- 기존 `package-meta/REMOVED_FILES.txt` 누적 목록을 그대로 승계

## 3. 분리한 상태

`App.jsx`에서 다음 네 상태를 `useGlobalUiState()`로 이동했다.

- `toast`
- `confirmModal`
- `systemBannerDismissedKey`
- `appDialogsActivated`

상태 setter 이름은 기존과 동일하게 유지해 `AppDialogs`, 인증·대여 구독 컨트롤러 및 관리자 탭 이동 확인창의 계약을 변경하지 않았다.

## 4. 분리한 실행 흐름

`useGlobalUiController()`가 다음을 담당한다.

- 3초 자동 종료 토스트 생성
- 확인 모달 생성
- 시스템 안내의 현재 버전 키 계산과 닫기 처리
- 사용자 화면에서만 시스템 안내를 표시하는 기존 조건 유지
- 사용자 요청·공지·FAQ·팝업 편집창, 확인 모달, 토스트 중 하나가 열리면 `AppDialogs` 활성화
- 최초 pointerdown 또는 keydown 시 대화상자 모듈 사전 로드
- 동적 import 실패 시 캐시된 Promise를 초기화해 재시도 가능 상태 유지

## 5. 대화상자 로더 분리

`React.lazy()`와 사전 로드가 같은 Promise를 공유하도록 `src/dialogs/appDialogsLoader.js`를 추가했다.

```js
let appDialogsModulePromise = null;

export const loadAppDialogsModule = () => {
  if (!appDialogsModulePromise) {
    appDialogsModulePromise = import('./AppDialogs.jsx').catch((error) => {
      appDialogsModulePromise = null;
      throw error;
    });
  }

  return appDialogsModulePromise;
};
```

따라서 최초 사전 로드와 실제 렌더가 중복 다운로드를 만들지 않는 기존 동작을 유지한다.

## 6. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 4,708 | 4,667 | -41 |
| 크기 | 138,899 bytes | 137,290 bytes | -1,609 bytes |
| `useState()` | 25 | 21 | -4 |
| `useEffect()` | 9 | 7 | -2 |
| `useRef()` | 5 | 5 | 0 |
| `useMemo()` | 26 | 26 | 0 |

신규 모듈은 총 129줄, 3,408 bytes다.

## 7. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 69 | 71 | +2 |
| 초기 정적 소스 | 863,209 bytes | 865,008 bytes | +1,799 bytes |

전역 UI 상태와 대화상자 로더는 초기 셸에서 필요하므로 정적 import를 유지했다. `AppDialogs.jsx` 자체는 계속 동적 import 대상이다.

## 8. 기능 보존

- 토스트 기본 유형과 3초 자동 종료 유지
- 확인 모달의 title, message, onConfirm 계약 유지
- 고급 확인 모달은 기존처럼 `setConfirmModal()` 직접 설정 가능
- 시스템 안내는 사용자 화면에서만 표시
- 시스템 안내 level·message 조합이 바뀌면 다시 표시
- 대화상자 모듈은 최초 사용 전 지연 로드
- 편집 다이얼로그·토스트·확인창 중 하나가 열리면 대화상자 레이어 활성화
- 한국어 UI 문자열 삭제·추가 없음

## 9. Firestore 영향

전체 감사 대상 호출은 129개로 동일하다.

- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

Firestore 호출 위치를 이동하지 않았으며 Rules, 인덱스, Firebase 설정, 감사 정책 파일도 변경하지 않았다.

## 10. 빌드 판정

정적 검사와 패키지 무결성 검사는 통과했다. 검증 환경의 내부 npm 저장소에서 `yargs-parser-21.1.1.tgz`를 찾지 못해 `npm ci`가 E404로 중단됐으므로 실제 Vite 프로덕션 빌드는 로컬 `deploy.ps1`에서 확인해야 한다.
