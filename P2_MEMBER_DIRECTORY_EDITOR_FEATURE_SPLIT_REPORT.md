# P2 부서·사용자 명부 편집 Feature 분리 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p2-signup-policy-directory-feature-split-deployment-package.zip`
- 작업 목적: `src/App.jsx`에 남아 있던 부서·사용자 임시 편집 상태와 조작 로직을 회원 명부 편집 전용 feature 훅으로 분리
- Firestore Rules 변경: 없음
- Firestore 인덱스 변경: 없음
- Firebase 데이터 구조 변경: 없음
- npm 의존성 변경: 없음

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `src/features/members/useAdminSignupPolicyDirectoryActions.js`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/members/useAdminMemberDirectoryEditor.js`

## 3. 신규 편집 훅의 책임

`useAdminMemberDirectoryEditor()`가 다음 상태를 직접 소유합니다.

- 신규 부서명
- 임시 부서 목록
- 수정 중인 부서 인덱스·명칭
- 드래그 중인 부서 인덱스
- 신규 사용자명·선택 부서
- 임시 사용자 목록
- 수정 중인 사용자 인덱스·명칭
- 드래그 중인 사용자 인덱스

다음 조작도 훅으로 이동했습니다.

- 부서 추가·수정·삭제·순서 이동
- 사용자 추가·수정·삭제·순서 이동
- 부서명 변경 시 소속 사용자 부서명 동시 변경
- 부서 삭제 시 해당 부서 사용자 동시 제외
- 현재 선택 부서 기준 사용자 표시 필터
- 원본 명부와 임시 명부의 변경 여부 계산
- 편집 취소와 원본 명부 복원
- 저장 성공 후 새 원본으로 임시 초안 교체
- 탭 진입 또는 서버 원본 변경 시 임시 편집 상태 동기화

## 4. `App.jsx` 수정

### 제거된 상태

```jsx
const [newTeam, setNewTeam] = useState('');
const [tempTeams, setTempTeams] = useState(data.teams || []);
const [editingTeamIndex, setEditingTeamIndex] = useState(null);
const [editingTeamName, setEditingTeamName] = useState('');
const [draggingTeamIndex, setDraggingTeamIndex] = useState(null);
const [newBorrower, setNewBorrower] = useState('');
const [newBorrowerTeam, setNewBorrowerTeam] = useState('전체');
const [tempBorrowers, setTempBorrowers] = useState(data.borrowers || []);
const [editingBorrowerIndex, setEditingBorrowerIndex] = useState(null);
const [editingBorrowerName, setEditingBorrowerName] = useState('');
const [draggingBorrowerIndex, setDraggingBorrowerIndex] = useState(null);
```

### 제거된 effect

- 첫 진입 시 사용자 추가 부서 초기화 effect
- `people` 탭 진입 또는 원본 명부 변경 시 임시 편집 상태를 초기화하는 effect

### 제거된 함수

- `addTempTeam`
- `startEditTempTeam`
- `applyEditTempTeam`
- `deleteTempTeam`
- `moveTempTeam`
- `addTempBorrower`
- `startEditTempBorrower`
- `applyEditTempBorrower`
- `deleteTempBorrower`
- `moveTempBorrower`

### 제거된 파생 계산

```jsx
const displayedTempBorrowers = tempBorrowers
  .map((borrower, originalIndex) => ({ ...borrower, originalIndex }))
  .filter(
    (borrower) =>
      newBorrowerTeam === '전체' ||
      borrower.team === newBorrowerTeam
  );
```

### 신규 연결

```jsx
const {
  addTempBorrower,
  addTempTeam,
  applyEditTempBorrower,
  applyEditTempTeam,
  cancelTempPeopleChanges,
  deleteTempBorrower,
  deleteTempTeam,
  displayedTempBorrowers,
  draggingBorrowerIndex,
  draggingTeamIndex,
  editingBorrowerIndex,
  editingBorrowerName,
  editingTeamIndex,
  editingTeamName,
  moveTempBorrower,
  moveTempTeam,
  newBorrower,
  newBorrowerTeam,
  newTeam,
  peopleSettingsDirty,
  replaceTempPeopleDraft,
  setDraggingBorrowerIndex,
  setDraggingTeamIndex,
  setEditingBorrowerIndex,
  setEditingBorrowerName,
  setEditingTeamIndex,
  setEditingTeamName,
  setNewBorrower,
  setNewBorrowerTeam,
  setNewTeam,
  startEditTempBorrower,
  startEditTempTeam,
  tempBorrowers,
  tempTeams,
} = useAdminMemberDirectoryEditor({
  adminTab,
  borrowers: data.borrowers,
  teams: data.teams,
  triggerToast,
});
```

## 5. 회원가입 정책·명부 저장 훅 축소

`useAdminSignupPolicyDirectoryActions()`는 더 이상 다음 상태 setter를 전달받지 않습니다.

- 부서·사용자 임시 배열 setter
- 신규 부서·사용자 입력 setter
- 편집 인덱스·편집명 setter
- 드래그 인덱스 setter

저장 성공 시 편집 훅이 제공하는 함수 하나만 호출합니다.

```jsx
replaceTempPeopleDraft({
  nextTeams,
  nextBorrowers,
});
```

이에 따라 정책·저장 훅에서 다음 로직을 제거했습니다.

- 명부 변경 여부 비교
- 편집 UI 전체 초기화
- 명부 변경 취소
- 임시 부서·사용자 배열 직접 교체

## 6. 기존 동작 유지

다음 동작은 변경하지 않았습니다.

- 빈 부서명 차단
- 같은 명칭의 부서 중복 차단
- 부서명 수정 시 해당 부서 소속 사용자 부서명 변경
- 부서 삭제 시 해당 부서 사용자 임시 삭제
- 사용자명 한글·영문 2~30자 검증
- 공백 제거
- 같은 부서 내 동일 사용자명 중복 차단
- 부서 카드 드래그 순서 변경
- 사용자 카드 드래그 순서 변경
- 선택 부서별 사용자 필터
- 임시 변경 후 저장 필요 안내 문구
- 취소 시 서버 원본 명부로 복원
- 저장 후 새 명부를 편집 기준값으로 사용
- 저장 전 페이지 이탈 경고용 `peopleSettingsDirty`
- `AdminOrganizationPanel`의 JSX·className·버튼 구성

## 7. 컨텍스트 계약

`AdminOrganizationPanel`이 사용하는 컨텍스트 키는 수정 전과 동일한 39개입니다.

- 정의된 키: 39개
- 실제 패널 구조 분해 키: 39개
- 누락: 0개
- 과잉: 0개

패널 UI를 변경하지 않고 데이터의 소유 위치만 `App.jsx`에서 feature 훅으로 이동했습니다.

## 8. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 19,050 | 18,853 | -197 |
| `App.jsx` 크기 | 550,747 bytes | 543,901 bytes | -6,846 bytes |
| `App.jsx` `useState()` | 219개 | 208개 | -11개 |
| `App.jsx` `useEffect()` | 66개 | 64개 | -2개 |
| 정책·명부 저장 훅 크기 | 10,622 bytes | 8,486 bytes | -2,136 bytes |
| 신규 편집 훅 | 없음 | 11,552 bytes | +1개 |

## 9. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 38개 | 39개 | +1개 |
| 초기 정적 소스 | 823,105 bytes | 825,675 bytes | +2,570 bytes |

이번 단계는 초기 다운로드 축소가 아니라 다음 구조 개선이 목적입니다.

- 최상위 `App` 상태 수 감소
- 명부 편집 기능의 응집도 향상
- 정책 저장과 UI 편집 책임 분리
- 편집 기능 단독 검증 가능
- 다음 단계에서 관리자 패널 하위 지연 로딩으로 옮길 수 있는 경계 확보

신규 훅이 현재 `App.jsx`에서 정적 import되므로 초기 정적 소스는 2,570 bytes 증가했습니다.

## 10. Firestore 접근

이번 feature 훅은 Firestore를 직접 호출하지 않습니다.

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 Firestore 접근 위치 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

Firestore 엄격 감사 결과는 PASS이며 승인 정책 파일은 변경하지 않았습니다.

## 11. 검증

- JS·JSX·MJS 소스 78개 TypeScript transpile 검사: 오류 0건
- 상대 import 162개 검사: 누락 0건
- 부서·사용자 패널 컨텍스트: 39/39 일치
- 기존 고유 한국어 문자열 삭제: 0건
- 신규 고유 한국어 문자열 추가: 0건
- `App.jsx` 기존 편집 상태·함수 잔존: 0건
- Firestore 엄격 감사: PASS
- 런타임 모의검사: PASS

런타임 모의검사에서는 다음 흐름을 확인했습니다.

1. 원본 부서·사용자 초기화
2. 부서 신규 추가
3. 중복 부서 차단
4. 부서명 변경과 사용자 소속 동시 변경
5. 사용자 신규 추가
6. 사용자 순서 이동
7. 부서 삭제
8. 취소 후 원본 명부 복원
9. 변경 여부가 다시 `false`로 복원

## 12. 프로덕션 빌드

`npm run build`의 사전 Firestore 감사 단계는 통과했습니다.

```text
Firestore access audit: PASS
```

현재 실행 환경에 Vite 실행 파일이 없어 실제 번들 생성 단계는 수행하지 못했습니다.

```text
sh: 1: vite: not found
```

실제 프로젝트 PC의 `deploy.ps1`은 배포 전에 동일한 `npm run build`를 실행하므로 빌드 오류가 발생하면 배포 전에 중단됩니다.

## 13. 배포

Rules와 인덱스는 변경하지 않았으므로 웹만 배포합니다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```
