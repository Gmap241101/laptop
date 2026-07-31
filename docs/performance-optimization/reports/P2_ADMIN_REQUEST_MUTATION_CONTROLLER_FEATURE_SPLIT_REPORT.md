# P2 관리자 대여 신청 변경 컨트롤러 분리 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-user-membership-status-controller-split-20260731_1616_deployment_package.zip`
- 출력 풀패키지: `rental-system-admin-request-mutation-controller-split-20260731_1632_deployment_package.zip`
- 출력 프로젝트 파일: 352개
- 출력 ZIP 파일 항목: 356개
- 작업 대상: `src/App.jsx`에 남아 있던 관리자 대여 신청 변경·복구·상태 변경·메모 저장 실행 흐름
- 기능 변경 원칙: Firestore 문서 구조, 상태 전이 규칙, UI 문구, 버튼과 context 계약은 변경하지 않고 코드 소유 위치만 이동

## 2. 신규 모듈

### `src/features/requests/useAdminRequestMutationController.js`

다음 기능을 소유한다.

- `adminRequestMutationService.js` 지연 로딩
- 다른 현재 연체 신청 존재 여부 조회
- 관리자 신청정보 수정 커밋
- 관리자 신청 상태 복구 커밋
- 신청 승인·보류·불허·반납확정 상태 변경
- 관리자 메모의 로컬 편집 상태 반영
- 관리자 메모 Firestore transaction 저장과 감사 로그 생성
- 변경 성공 후 관리자 신청 목록, 가용성 목록, 자산 목록 동기화
- 관리자 신청 검색·페이지·선택 상태 갱신 호출

## 3. App.jsx 연결

`App.jsx`에는 다음 controller 호출과 반환 함수 연결만 유지한다.

```jsx
const {
  commitAdminRequestEdit,
  commitAdminRequestStatusRestore,
  saveRequestMemo,
  updateRequest,
  updateRequestMemo,
} = useAdminRequestMutationController({
  clearAdminRequestPanelSelection,
  dataSettings: data.settings,
  getAdminRequestById,
  getCurrentAdminAuditActor,
  isSplitStorageReady,
  notifyAdminRequestMutation,
  resetAdminRequestPanelPage,
  setData,
  triggerToast,
  updateAdminRequestPanelRequests,
});
```

다른 현재 연체 신청 확인 함수는 동일 모듈의 named export로 이동했으며, 아직 `App.jsx`에 남은 사용자 후속 요청 검토 로직에서도 같은 함수를 재사용한다.

```jsx
import useAdminRequestMutationController, {
  hasOtherCurrentOverdueRequest,
} from './features/requests/useAdminRequestMutationController.js';
```

## 4. 분리된 기존 함수

- `hasOtherCurrentOverdueRequest`
- `commitAdminRequestEdit`
- `commitAdminRequestStatusRestore`
- `updateRequest`
- `updateRequestMemo`
- `saveRequestMemo`
- `loadAdminRequestMutationService`

## 5. 기능 보존

### 신청정보 수정

- Firestore 분리 저장소 준비 상태 확인
- 정식 신청 문서와 관리자 감사 actor 확인
- 필수 필드·기간·자산·충돌 검증
- 휴무일 반납일 자동 조정 안내
- 신청·가용성·자산 로컬 상태 동기화

### 상태 복구

- 복구 사유 검증
- 허용된 상태 전이 검증
- 동일 자산 기간 충돌 검증
- 신청·가용성·자산 상태 동기화

### 상태 변경

- 승인·보류·불허·반납확정 처리
- 반납 시 다른 현재 연체 신청 존재 여부 조회
- 기존 mutation service를 통한 연체 페널티와 감사 로그 처리
- 성공 후 신청 선택 해제, 페이지 초기화, mutation version 증가

### 관리자 메모

- 입력 중 로컬 신청 목록 즉시 반영
- 실제 저장 시 최신 신청 문서 재조회
- 내용이 동일한 경우 불필요한 쓰기 생략
- 변경 시 신청 문서와 `rentalRequestLogs` 감사 로그를 transaction으로 저장

## 6. 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 8,918 | 8,184 | -734 |
| `App.jsx` 크기 | 258,159 bytes | 239,681 bytes | -18,478 bytes |
| `App.jsx` `runTransaction()` | 3 | 2 | -1 |
| `App.jsx` `getDocs()` | 7 | 6 | -1 |
| `App.jsx` `useState()` | 109 | 109 | 0 |
| `App.jsx` `useEffect()` | 48 | 48 | 0 |

신규 컨트롤러는 803줄, 20,182 bytes이다.

## 7. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 59 | 60 | +1 |
| 초기 정적 소스 | 821,860 bytes | 823,564 bytes | +1,704 bytes |

`adminRequestMutationService.js`는 이전과 동일하게 동적 import를 유지한다. 이번 작업은 번들 지연 로딩이 아니라 `App.jsx` 책임 분리 작업이다.

## 8. Firestore 영향

전체 감사 대상 호출은 129개로 유지된다.

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

다음 파일은 입력 기준본과 SHA-256이 동일하다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- `tools/firestore-audit-policy.json`

Firebase Rules와 인덱스 배포는 필요하지 않다.

## 9. 누적 삭제 목록

- 직전 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- 중복 경로: 0개
- `REMOVED_FILES.txt` SHA-256: `17ad59f08176c623ca2eaa4d3b232992555e62b3ad1b22c824cb1af10778f212`

## 10. 후속 분리 대상

다음 순차 대상은 `App.jsx`에 남은 `reviewUserActionRequest`이다. 사용자 신청정보 변경·취소·연장·조기 반납 요청의 관리자 승인·불허 transaction을 전용 컨트롤러로 옮기는 작업이다.
