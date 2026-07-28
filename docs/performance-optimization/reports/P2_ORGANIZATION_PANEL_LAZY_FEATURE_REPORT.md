# P2 관리자 조직 패널 지연 Feature 이동 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p2-member-directory-editor-feature-split-deployment-package.zip`
- 작업 목표:
  - 부서·사용자 편집 훅을 `App.jsx` 초기 정적 경로에서 제거
  - 부서·사용자 명부 저장 액션을 지연 로딩되는 `AdminOrganizationPanel` 내부로 이동
  - 화면 이탈 경고와 저장·취소 확인 기능은 유지
  - Firestore 쿼리·컬렉션·문서 구조·Rules·인덱스는 변경하지 않음

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `src/admin/AdminOrganizationPanel.jsx`
- `src/context/appContextSlices.js`
- `src/features/members/useAdminMemberDirectoryEditor.js`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/members/useAdminMemberDirectorySaveActions.js`
- `src/features/members/useAdminSignupPolicyActions.js`

### 제거

- `src/features/members/useAdminSignupPolicyDirectoryActions.js`

## 3. 구조 변경

### 수정 전

`App.jsx`가 다음 기능을 모두 초기화했습니다.

```text
App.jsx
├─ useAdminMemberDirectoryEditor
│  ├─ 임시 부서·사용자 배열
│  ├─ 추가·수정·삭제·드래그 상태
│  └─ peopleSettingsDirty 계산
└─ useAdminSignupPolicyDirectoryActions
   ├─ 회원가입 정책 저장
   └─ 부서·사용자 명부 저장
```

따라서 일반 사용자가 사이트에 접속해도 부서·사용자 편집 훅과 명부 저장 연결 코드가 초기 정적 그래프에 포함됐습니다.

### 수정 후

```text
App.jsx
├─ 회원가입 정책 전용 훅
├─ people dirty 여부 1개
└─ 저장·취소 함수 참조 브리지

AdminWorkspace (React.lazy)
└─ AdminOrganizationPanel (React.lazy)
   ├─ useAdminMemberDirectoryEditor
   └─ useAdminMemberDirectorySaveActions
      └─ memberDirectorySaveService (동적 import)
```

부서·사용자 화면을 실제로 열기 전에는 다음 파일이 초기 정적 경로에 포함되지 않습니다.

- `src/admin/AdminOrganizationPanel.jsx`
- `src/features/members/useAdminMemberDirectoryEditor.js`
- `src/features/members/useAdminMemberDirectorySaveActions.js`
- `src/features/members/memberDirectorySaveService.js`

## 4. `App.jsx` 변경

### 정적 import 제거

수정 전:

```jsx
import useAdminSignupPolicyDirectoryActions from
  './features/members/useAdminSignupPolicyDirectoryActions.js';
import useAdminMemberDirectoryEditor from
  './features/members/useAdminMemberDirectoryEditor.js';
```

수정 후:

```jsx
import useAdminSignupPolicyActions from
  './features/members/useAdminSignupPolicyActions.js';
```

### 최소 브리지 상태

```jsx
const [peopleSettingsDirty, setPeopleSettingsDirty] = useState(false);
const memberDirectoryDeferredActionsRef = useRef({
  discard: null,
  save: null,
});
```

편집 상세 상태는 `App.jsx`에 남기지 않고 화면 이탈 여부와 저장·취소 함수만 보관합니다.

### 패널 등록 콜백

```jsx
const handleMemberDirectoryDeferredStateChange = useCallback(
  (nextState) => {
    const nextDirty = Boolean(nextState?.dirty);

    memberDirectoryDeferredActionsRef.current = {
      discard:
        typeof nextState?.discard === 'function'
          ? nextState.discard
          : null,
      save:
        typeof nextState?.save === 'function'
          ? nextState.save
          : null,
    };

    setPeopleSettingsDirty((currentDirty) =>
      currentDirty === nextDirty
        ? currentDirty
        : nextDirty
    );
  },
  []
);
```

### 화면 이탈 확인 유지

```jsx
if (tab === 'people' && peopleSettingsDirty) {
  const {
    discard,
    save,
  } = memberDirectoryDeferredActionsRef.current;

  if (
    typeof discard !== 'function' ||
    typeof save !== 'function'
  ) {
    return null;
  }

  return {
    label: '부서·사용자',
    discard,
    save,
  };
}
```

기존 확인창의 세 가지 동작은 유지됩니다.

```text
계속 편집
저장하지 않고 이동
저장 후 이동
```

## 5. 관리자 조직 패널 변경

`AdminOrganizationPanel` 내부에서 편집 훅을 직접 실행합니다.

```jsx
const editor = useAdminMemberDirectoryEditor({
  borrowers: memberDirectoryBorrowers,
  teams: memberDirectoryTeams,
  triggerToast,
});
```

명부 저장 액션도 패널 내부에서 생성합니다.

```jsx
const {
  saveTempPeopleChanges,
} = useAdminMemberDirectorySaveActions({
  currentBorrowers: memberDirectoryBorrowers,
  clearMemberDirectoryAuditResult,
  isSplitStorageReady,
  replaceTempPeopleDraft,
  setData,
  settings: memberDirectorySettings,
  tempBorrowers,
  tempTeams,
  triggerToast,
});
```

dirty 상태와 저장·취소 함수를 `App.jsx` 브리지에 등록합니다.

```jsx
useEffect(() => {
  onMemberDirectoryDeferredStateChange({
    dirty: peopleSettingsDirty,
    discard: discardTempPeopleChanges,
    save: saveTempPeopleChanges,
  });
}, [
  discardTempPeopleChanges,
  onMemberDirectoryDeferredStateChange,
  peopleSettingsDirty,
  saveTempPeopleChanges,
]);
```

패널이 닫히면 등록 정보를 제거합니다.

```jsx
useEffect(
  () => () => {
    onMemberDirectoryDeferredStateChange(null);
  },
  [onMemberDirectoryDeferredStateChange]
);
```

## 6. 명부 저장 액션 분리

신규 파일:

```text
src/features/members/useAdminMemberDirectorySaveActions.js
```

이 훅은 다음 흐름을 담당합니다.

```text
저장 가능 상태 확인
→ memberDirectorySaveService 동적 import
→ 명부 정규화·검증·재색인
→ publicConfig 및 분리 저장소 저장
→ App 데이터 갱신
→ 편집 초안 교체
→ 명부 검사 결과 초기화
→ 성공·오류 토스트
```

전체 재색인 서비스는 저장 버튼을 누른 시점까지 추가로 지연됩니다.

```jsx
const {
  saveMemberDirectory,
} = await loadMemberDirectorySaveService();
```

## 7. 회원가입 정책 훅 분리

기존 혼합 훅:

```text
useAdminSignupPolicyDirectoryActions.js
```

을 다음처럼 분리했습니다.

```text
useAdminSignupPolicyActions.js
  └─ 회원가입 제한·자동 승인 정책만 담당

useAdminMemberDirectorySaveActions.js
  └─ 부서·사용자 명부 저장만 담당
```

회원가입 정책의 다음 동작은 변경하지 않았습니다.

- 가입 제한 활성화·비활성화
- 신규 회원 자동 승인 연동
- 명부 버전 증가
- 정책 해제 시 `directoryMismatch` 회원 복원
- 기존 성공·오류 문구

## 8. 조직 패널 컨텍스트 축소

수정 전 컨텍스트 키: 39개

수정 후 컨텍스트 키: 15개

```text
AdminPageHeader
Button
Edit3
Plus
Save
Trash2
X
clearMemberDirectoryAuditResult
isSplitStorageReady
memberDirectoryBorrowers
memberDirectorySettings
memberDirectoryTeams
onMemberDirectoryDeferredStateChange
setData
triggerToast
```

24개 키, 약 61.54%를 제거했습니다.

패널 내부 상태와 조작 함수를 컨텍스트로 전달하지 않으므로 `App.jsx`와 패널의 결합도가 감소했습니다.

## 9. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 39개 | 38개 | -1개 |
| 초기 정적 소스 | 825,675 bytes | 810,629 bytes | **-15,046 bytes** |
| 초기 정적 소스 감소율 | - | - | **약 1.82%** |
| `App.jsx` 크기 | 543,901 bytes | 543,123 bytes | -778 bytes |
| 최상위 동적 진입점 | 14개 | 13개 | -1개 |
| 조직 패널 컨텍스트 | 39개 | 15개 | **-24개** |

최상위 동적 진입점 수가 1개 줄어든 이유는 편집 훅과 저장 서비스가 사라진 것이 아니라, 이미 지연 로딩되는 `AdminOrganizationPanel` 아래의 중첩 의존성으로 이동했기 때문입니다.

## 10. `App.jsx` 훅 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `useState()` | 208개 | 209개 | +1개 |
| `useRef()` | 19개 | 20개 | +1개 |
| `useEffect()` | 64개 | 64개 | 동일 |
| `useMemo()` | 39개 | 39개 | 동일 |

추가된 상태와 ref는 화면 이탈 보호용 최소 브리지입니다. 편집 상세 상태 11개는 지연 로딩 패널 내부에 존재합니다.

## 11. 유지된 기능

다음 기능은 변경하지 않았습니다.

- 부서 추가·수정·삭제
- 부서 드래그 순서 변경
- 부서명 변경 시 소속 사용자 부서명 연쇄 변경
- 부서 삭제 시 소속 사용자 임시 삭제
- 사용자 추가·수정·삭제
- 사용자 드래그 순서 변경
- 부서별 사용자 필터
- 중복 부서·사용자 검증
- 사용자명 형식 검증
- 변경 취소와 원본 복원
- 저장 후 초안 교체
- 저장되지 않은 변경사항 화면 이탈 확인
- 브라우저 종료 전 경고
- 명부 버전 증가
- 회원 색인 재구성
- 명부 검사 결과 초기화
- 기존 화면 문구·JSX·className

## 12. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 접근 위치 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

조회 위치·조건·배치 크기·컬렉션 구조는 변경하지 않았습니다.

## 13. 검증 결과

- JS·JSX·MJS 변환 검사: 86개, 오류 0건
- 상대 import 검사: 86개 파일, 누락 0건
- Firestore 엄격 감사: PASS
- 승인 위험 항목: 51개
- 미승인 경고: 0건
- 미승인 오류: 0건
- 조직 패널 컨텍스트: 15개 정의 / 15개 사용
- 컨텍스트 누락·과잉: 0건
- 한국어 문자열 비교: 삭제 0건 / 추가 0건
- 초기 정적 그래프 제외 확인: 4개 대상 모두 제외
- ZIP 재추출 후 동일 검사: 통과

## 14. 프로덕션 빌드 제한

`npm ci --no-audit --no-fund`를 실행했지만 현재 실행 환경의 컨테이너 `ClientError`로 완료되지 않았습니다.

```text
node_modules/.bin/vite
→ 생성되지 않음
```

따라서 실제 Vite 프로덕션 번들은 이 환경에서 생성하지 못했습니다. 실제 프로젝트 PC의 `deploy.ps1`은 Firestore 엄격 감사 후 Vite 빌드를 수행하므로 빌드 오류가 있으면 게시 전에 중단됩니다.

## 15. 배포

Rules와 인덱스 변경은 없습니다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
