# P2 사용자 신청내역 후속 조치 컨트롤러 분리 보고서

## 1. 작업 개요

- 입력 기준본: `rental-system-user-rental-request-controller-split-20260730_1430_deployment_package.zip`
- 출력 패키지: `rental-system-user-request-history-action-controller-split-20260730_1455_deployment_package.zip`
- 분리 대상: 사용자 신청내역의 신청정보 수정, 신청 취소, 대여 연장 신청, 조기 반납 요청 차단 흐름
- 기능 정책 변경: 없음
- Firestore 데이터 구조 변경: 없음
- UI 문구·버튼·className 변경: 없음

## 2. 신규 모듈

`src/features/requests/useUserRequestHistoryActionController.js`

이 모듈이 다음 책임을 소유합니다.

- 사용자 후속 조치 다이얼로그 상태 3개
- 현재 다이얼로그 대상 신청 계산
- 부서별 대여자 후보 계산
- 신청정보 수정 다이얼로그 진입과 검증
- 관리자 처리 전 신청 취소 transaction
- 자동/수동 대여 연장 transaction
- 연체 제한 상태 재확인
- 후속 조치 완료 후 로컬 신청·자산·가용성 상태 동기화
- 조기 반납 요청 기능 비제공 안내

## 3. App.jsx 변경

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 15,499 | 14,480 | -1,019 |
| 파일 크기 | 447,316 bytes | 417,913 bytes | -29,403 bytes |
| `useState()` | 179 | 176 | -3 |
| `useMemo()` | 32 | 30 | -2 |
| `useEffect()` | 59 | 59 | 0 |
| `useRef()` | 20 | 20 | 0 |
| `runTransaction()` | 9 | 7 | -2 |

신규 컨트롤러는 1,126줄, 32,240 bytes입니다.

## 4. App.jsx 연결 구조

상태 소유권은 다음 hook으로 이동했습니다.

```jsx
const {
  setUserActionDialog,
  setUserActionForm,
  setUserActionSaving,
  userActionDialog,
  userActionForm,
  userActionSaving,
} = useUserRequestHistoryActionState();
```

실행 흐름은 다음 controller로 연결했습니다.

```jsx
const {
  activeUserActionRentalRequest,
  closeUserActionDialog,
  openUserActionDialog,
  submitUserActionRequest,
  userActionBorrowers,
} = useUserRequestHistoryActionController({
  currentUserRentalRestrictionStatus,
  currentUserRequests,
  dataBorrowers: data.borrowers,
  dataSettings: data.settings,
  firebaseAuthUser,
  loadFreshRentalRestrictionStatus,
  setData,
  setRentalRequests,
  setUserActionDialog,
  setUserActionForm,
  setUserActionSaving,
  siteSettings,
  triggerToast,
  userActionDialog,
  userActionForm,
  userActionSaving,
});
```

## 5. 보존된 동작

- 본인 소유 신청만 후속 조치 가능
- 신청정보 수정은 신청중·보류 상태에서만 가능
- 신청 취소는 관리자 처리 전 신청중 상태에서만 가능
- 시작일·반납일·영업일·최대 기간 검증 유지
- 동일 자산 기간 충돌 검사 유지
- 직접 취소 시 신청 문서와 가용성 문서 삭제 유지
- 자산 `reservations` 동기화 유지
- 연장 전 최신 연체 제한 상태 재조회 유지
- 수동 연장은 검토 대기 상태로 저장
- 자동 연장은 신청·가용성·자산을 transaction으로 동시 갱신
- 조기 반납 요청은 기존과 동일하게 제공하지 않음

## 6. 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 45 | 46 | +1 |
| 초기 정적 소스 | 785,354 bytes | 788,191 bytes | +2,837 bytes |

이번 단계는 지연 로딩이 아니라 책임 분리 작업입니다.

## 7. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 전체 접근 위치 | 129 | 129 | 0 |
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

| 파일 | SHA-256 | 판정 |
|---|---|---|
| `rules/firestore.rules` | `9b703839184e09c7303b80fde2209722a4545feefabc837ad8e885e0466b1d3e` | 동일 |
| `firestore.indexes.json` | `e8331250b347f49156fc64e50c6bef5e198e310708f192ddd67ce472e3d9c70f` | 동일 |
| `firebase.json` | `9f47f5d83c8ac8006ca7ec119dbf681d9b5d773ac9957c9254517bc01e514e8f` | 동일 |
| `.firebaserc` | `b17b7da5c0ba946de5766077657b967dddd43541da4150600374412e8bc463b1` | 동일 |
| `package.json` | `89e3c902da4fa8b75af380e3d56609546106b12eb9777ebcc1bc28f59a90b36e` | 동일 |
| `package-lock.json` | `59ff408bd366536cd0bf655e197f5c48be56ef06d744b03e0b30ed767a8ac175` | 동일 |

Firebase Rules와 인덱스 배포는 필요하지 않습니다.

## 8. 삭제 목록

- 직전 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- `package-meta/REMOVED_FILES.txt`: 바이트 단위 그대로 승계

## 9. 검증

- 기준본 SHA-256 284개: PASS
- JavaScript/JSX/MJS TypeScript 구문 검사: PASS
- React Hook import 감사: PASS
- 상대 import 264개: 누락 0개
- Firestore strict 감사: PASS
- 사용자 요청 컨트롤러 runtime mock: PASS (5개 시나리오)
- context 정의·제공·사용 계약: PASS
- 한국어 UI 문자열: 템플릿 식별자만 이동에 맞게 변경, 렌더링 문구 변화 없음
- Vite 프로덕션 빌드: 현재 환경 npm registry E404로 미수행
