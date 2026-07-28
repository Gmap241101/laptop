# P2 관리자 신청 상세·다이얼로그 Feature 분리 보고서

## 1. 작업 목적

직전 단계에서 관리자 신청 목록·검색·페이지네이션을 `AdminRequestsPanel` 내부로 이동했지만, 다음 상태와 UI 제어는 여전히 `App.jsx`와 공용 `AppDialogs.jsx`에 남아 있었습니다.

- 선택 신청 ID
- 선택 신청 처리 이력 실시간 구독
- 신청정보 수정 다이얼로그 상태와 입력 폼
- 상태 복구 다이얼로그 상태와 복구 사유
- 수정·복구 저장 중 상태
- 상태 복구 가능 대상 계산
- 관리자 신청 수정·복구 다이얼로그 JSX

이번 단계에서는 위 기능을 관리자 신청 화면 전용 feature로 이동했습니다. 실제 Firestore 트랜잭션은 기존 동작을 보존하기 위해 `App.jsx`의 매개변수형 명령 함수로 유지했습니다.

## 2. 변경 구조

### 수정 전

```text
App.jsx
├─ selectedAdminRequestId
├─ rentalRequestLogs 상태 및 onSnapshot
├─ 수정 다이얼로그 상태
├─ 복구 다이얼로그 상태
├─ 수정·복구 열기/닫기 함수
├─ 수정·복구 Firestore 트랜잭션
└─ AppDialogs 컨텍스트 전달

AppDialogs.jsx
├─ 관리자 신청정보 수정 다이얼로그
├─ 관리자 상태 복구 다이얼로그
└─ 사용자·공지·FAQ·팝업 공용 다이얼로그
```

### 수정 후

```text
App.jsx
├─ commitAdminRequestEdit({ requestId, form })
├─ commitAdminRequestStatusRestore({ requestId, nextStatus, restoreReason })
└─ 관리자 신청 패널 명령 브리지

AdminRequestsPanel.jsx — React.lazy 하위
├─ useAdminRequestsController
│  └─ 선택 신청 ID
├─ useAdminRequestDetailController
│  ├─ 처리 이력 onSnapshot
│  ├─ 수정·복구 다이얼로그 상태
│  ├─ 수정·복구 열기/닫기
│  └─ 상태 복구 대상 계산
└─ AdminRequestDialogs
   ├─ 신청정보 수정 UI
   └─ 상태 복구 UI

AppDialogs.jsx
└─ 사용자·공지·FAQ·팝업 공용 다이얼로그만 유지
```

## 3. 변경 파일

### 수정

- `src/App.jsx`
- `src/admin/AdminRequestsPanel.jsx`
- `src/context/appContextSlices.js`
- `src/dialogs/AppDialogs.jsx`
- `src/features/requests/useAdminRequestsController.js`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/admin/AdminRequestDialogs.jsx`
- `src/features/requests/useAdminRequestDetailController.js`

Firestore Rules, 인덱스, Firebase 설정, npm 의존성은 변경하지 않았습니다.

## 4. 선택 신청 상태 이동

기존 `App.jsx`의 다음 상태를 제거했습니다.

```jsx
const [selectedAdminRequestId, setSelectedAdminRequestId] = useState('');
```

수정 후 `useAdminRequestsController`가 선택 신청 ID를 직접 소유합니다.

```jsx
const [selectedRequestId, setSelectedRequestId] = useState('');
```

대시보드에서 특정 신청 상세로 이동하는 경우에는 이동 요청 객체에 선택 ID를 포함합니다.

```jsx
setAdminRequestsNavigationRequest((currentRequest) => ({
  requestId: Number(currentRequest?.requestId || 0) + 1,
  query: String(query || ''),
  quickFilter: String(
    quickFilter || ADMIN_REQUEST_QUICK_FILTER.ALL
  ),
  requestTab: String(
    requestTab || ADMIN_REQUEST_TAB.PENDING
  ),
  selectedRequestId: String(selectedRequestId || ''),
}));
```

컨트롤러는 새 이동 요청을 받을 때 선택 ID까지 반영합니다.

```jsx
setSelectedRequestId(
  String(navigationRequest?.selectedRequestId || '')
);
```

## 5. 신청 처리 이력 구독 이동

기존 `App.jsx`의 다음 구독을 제거했습니다.

```text
rentalRequestLogs
rentalRequestLogsReady
rentalRequestLogsLoadErrorMessage
선택 신청 requestId 기준 onSnapshot
```

신규 `useAdminRequestDetailController`가 선택 신청이 있을 때만 처리 이력을 구독합니다.

```jsx
return onSnapshot(
  firestoreQuery(
    RENTAL_REQUEST_LOGS_COLLECTION_REF,
    where('requestId', '==', selectedRequestId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(100)
  ),
  // success / error
);
```

기존 정책은 유지됩니다.

- 선택 신청이 없으면 구독하지 않음
- 최신 처리 이력부터 내림차순 정렬
- 최대 100건
- 선택 신청 변경 시 기존 구독 해제
- 관리자 신청 패널이 닫히면 자동 해제

## 6. 수정·복구 상태 전용 훅

신규 파일:

```text
src/features/requests/useAdminRequestDetailController.js
```

이 훅이 소유하는 상태:

```text
신청 처리 이력
처리 이력 로딩 상태
처리 이력 오류 상태
수정 다이얼로그
수정 입력 폼
수정 저장 중 상태
복구 다이얼로그
복구 대상 상태
복구 사유
복구 저장 중 상태
```

수정 다이얼로그 열기:

```jsx
setEditDialog({ requestId: request.id });
setEditForm(createDefaultAdminRequestEditForm(request));
```

복구 다이얼로그 열기:

```jsx
const targetOptions =
  getAdminRequestRestoreTargetsForLogs(request, requestLogs);

setRestoreDialog({
  requestId: request.id,
  targetOptions,
});
setRestoreTarget(targetOptions[0]);
setRestoreReason('');
```

## 7. 상태 복구 대상 계산 유지

복구 대상은 다음 우선순위로 계산합니다.

1. 최신 상태 변경·복구 이력의 `previousStatus`
2. 현재 상태별 기본 복구 대상
3. 현재 상태에서 허용된 전이 목록으로 최종 필터링

```jsx
return [
  ...new Set(
    [latestStatusLog?.previousStatus, ...fallbackTargets]
      .filter(Boolean)
  ),
].filter((targetStatus) =>
  (RENTAL_REQUEST_STATUS_TRANSITIONS[request.status] || [])
    .includes(targetStatus)
);
```

기존 상태 전이 정책은 변경하지 않았습니다.

## 8. Firestore 트랜잭션 명령 함수 변경

실제 수정·복구 트랜잭션은 `App.jsx`에 유지하되, 최상위 UI 상태를 직접 참조하지 않도록 매개변수형 함수로 변경했습니다.

### 신청정보 수정

수정 전:

```jsx
const saveAdminRequestEdit = async () => {
  const requestId = adminRequestEditDialog?.requestId || '';
  const requestedDueDate = adminRequestEditForm.dueDate || '';
  // ...
};
```

수정 후:

```jsx
const commitAdminRequestEdit = async ({
  requestId = '',
  form = {},
} = {}) => {
  const requestedDueDate = String(form.dueDate || '');
  // 기존 트랜잭션 유지
};
```

### 상태 복구

수정 전:

```jsx
const restoreAdminRequestStatus = async () => {
  const requestId = adminRequestRestoreDialog?.requestId || '';
  const nextStatus = adminRequestRestoreTarget;
  const restoreReason = adminRequestRestoreReason;
  // ...
};
```

수정 후:

```jsx
const commitAdminRequestStatusRestore = async ({
  nextStatus = '',
  requestId = '',
  restoreReason = '',
} = {}) => {
  const normalizedRestoreReason =
    String(restoreReason || '').trim();
  // 기존 트랜잭션 유지
};
```

성공 시 `true`, 실패나 검증 중단 시 `false` 또는 `undefined`를 반환하며, 전용 훅은 성공한 경우에만 다이얼로그를 닫습니다.

## 9. 관리자 신청 다이얼로그 UI 이동

신규 파일:

```text
src/admin/AdminRequestDialogs.jsx
```

공용 `AppDialogs.jsx`에서 다음 UI를 제거했습니다.

- 대여 신청정보 수정
- 신청 상태 되돌리기

새 컴포넌트는 `AdminRequestsPanel` 안에서 렌더링됩니다.

```jsx
<AdminRequestDialogs
  adminRequestEditDialog={adminRequestEditDialog}
  adminRequestEditForm={adminRequestEditForm}
  adminRequestRestoreDialog={adminRequestRestoreDialog}
  restoreAdminRequestStatus={restoreAdminRequestStatus}
  saveAdminRequestEdit={saveAdminRequestEdit}
  settings={data.settings}
  triggerToast={triggerToast}
/>
```

기존 JSX, className, 안내 문구, 날짜 자동 조정 로직은 유지했습니다.

## 10. 공용 다이얼로그 컨텍스트 축소

`app.dialogs` 컨텍스트에서 다음 15개 값을 제거했습니다.

```text
adminRequestEditBorrowers
adminRequestEditDialog
adminRequestEditForm
adminRequestEditSaving
adminRequestRestoreDialog
adminRequestRestoreReason
adminRequestRestoreSaving
adminRequestRestoreTarget
closeAdminRequestEditDialog
closeAdminRequestRestoreDialog
restoreAdminRequestStatus
saveAdminRequestEdit
setAdminRequestEditForm
setAdminRequestRestoreReason
setAdminRequestRestoreTarget
```

`AppDialogs` 컨텍스트는 67개에서 52개로 감소했습니다.

관리자 신청 패널 컨텍스트에서는 기존 상세 상태 대신 다음 두 명령 함수만 전달합니다.

```text
commitAdminRequestEdit
commitAdminRequestStatusRestore
```

관리자 신청 패널 컨텍스트 계약은 정의 38개, 실제 사용 38개로 일치합니다.

## 11. `App.jsx` 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 18,217줄 | 17,942줄 | **-275줄** |
| 크기 | 526,542 bytes | 519,468 bytes | **-7,074 bytes** |
| `useState()` | 205개 | 194개 | **-11개** |
| `useEffect()` | 60개 | 59개 | **-1개** |
| `useMemo()` | 35개 | 33개 | **-2개** |
| `useRef()` | 20개 | 20개 | 동일 |
| `useCallback()` | 9개 | 10개 | +1개 |

추가된 `useCallback()`은 패널 선택 상태를 안전하게 초기화하는 최소 명령 브리지입니다.

## 12. 공용 `AppDialogs.jsx` 감소

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 1,161줄 | 876줄 | **-285줄** |
| 크기 | 46,152 bytes | 34,828 bytes | **-11,324 bytes** |

따라서 공지·FAQ·팝업·사용자 요청 다이얼로그를 처음 열 때 관리자 신청 전용 UI를 함께 읽지 않습니다.

## 13. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 32개 | 32개 | 동일 |
| 초기 정적 소스 | 746,259 bytes | 738,633 bytes | **-7,626 bytes** |
| 감소율 | — | — | **약 1.02%** |
| 최상위 동적 진입점 | 13개 | 13개 | 동일 |

신규 상세 훅과 다이얼로그 컴포넌트는 지연 로딩되는 `AdminRequestsPanel`의 하위 정적 의존성이므로 일반 사용자 초기 그래프에 포함되지 않습니다.

## 14. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 접근 위치 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

처리 이력 구독 위치만 `App.jsx`에서 신규 feature 훅으로 이동했습니다.

변경하지 않은 항목:

- 로그 최대 100건
- requestId 조건
- createdAt 내림차순
- 신청 수정 transaction
- 상태 복구 transaction
- 자산 예약 충돌 검사
- 공개 자산 상태 갱신
- 관리자 감사 로그 생성
- Firestore Rules와 인덱스

## 15. 화면 문구

기존 한국어 고유 문자열은 1,352개이며 삭제된 문자열은 없습니다.

방어적 오류 처리를 위해 다음 두 문자열만 추가했습니다.

```text
신청 정보 수정 기능을 불러오지 못했습니다.
신청 상태 복구 기능을 불러오지 못했습니다.
```

기존 사용자 노출 문구, 버튼명, 안내문은 변경하지 않았습니다.

## 16. 검증 요약

- React Hook import 감사: PASS
- JS·JSX·MJS 변환 검사: 88개, 오류 0건
- 상대 import: 176개, 누락 0건
- 미정의 식별자 `TS2304/TS2552`: 0건
- Firestore 엄격 감사: PASS
- 컨텍스트 계약: PASS
- 구조 회귀 검사: 16/16 PASS
- 사전 빌드 검사: PASS
- 실제 Vite 빌드: 현재 검증 환경에 `vite` 실행 파일이 없어 미완료

## 17. 배포 범위

Rules와 인덱스 변경은 없으므로 최신 전체 패키지를 교체한 뒤 웹만 배포합니다.

## 18. 패키지 구성 및 자동 교체

최신 전체 패키지는 프로젝트 전체 파일 236개와 누적 삭제 경로 66개를 포함합니다.

```text
package-meta/PACKAGE_FILES.txt
package-meta/PACKAGE_SHA256SUMS.txt
package-meta/REMOVED_FILES.txt
```

`replace-project-from-zip.ps1`을 사용하면 다음 순서로 적용됩니다.

1. 교체 대상 기존 파일 백업
2. 패키지 내부 SHA-256 검증
3. 누적 삭제 경로 66개 제거
4. 최신 파일 236개 덮어쓰기
5. 교체 결과 SHA-256 재검증

자동 교체 시뮬레이션에서 `.git`, `node_modules`, `.env.local`, 패키지 외 로컬 파일 보존을 확인했습니다.
