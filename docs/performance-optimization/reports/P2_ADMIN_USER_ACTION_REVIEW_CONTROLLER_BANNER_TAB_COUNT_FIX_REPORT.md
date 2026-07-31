# P2 관리자 사용자 요청 심사 컨트롤러 분리 및 전역 안내·탭 건수 수정 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-admin-request-mutation-controller-split-20260731_1632_deployment_package.zip`
- 출력 풀패키지: `rental-system-admin-user-action-review-controller-banner-tab-count-fix-20260731_1709_deployment_package.zip`
- 작업 원칙: Firestore 문서 구조, 사용자 요청 처리 정책, 관리자 패널 context 계약을 유지하면서 코드 소유 위치와 표시 오류만 수정

## 2. 사용자 화면 전역 안내 수정

- 전역 안내 표시 조건에 `view === 'user'`를 추가했다.
- 관리자 화면에서는 전역 안내를 표시하지 않는다.
- 글자 크기를 `text-xs`에서 `text-sm leading-5`로 한 단계 확대했다.
- 관리자 설정 설명을 실제 동작에 맞게 사용자 화면 상단 안내로 수정했다.

## 3. 관리자 신청 탭 건수 수정

기존에는 네 건수 조회를 `Promise.all()`로 처리하여 하나라도 실패하면 모든 탭이 초기값 `0`으로 남았다. 수정 후에는 다음과 같이 처리한다.

- `Promise.allSettled()`로 탭별 집계를 독립 처리
- 초기값을 `0`이 아니라 `null`로 관리
- 로딩 중 `…` 표시
- 해당 탭 집계 실패 시 `-` 표시
- 일부 실패 시 별도 안내문 표시
- 집계 실패 중에도 현재 페이지의 `hasNextPage`를 이용해 다음 페이지 이동 가능
- 실제 집계값이 숫자로 확인된 경우에만 전체 페이지 수를 갱신

## 4. 신규 컨트롤러

### `src/features/requests/useAdminUserActionReviewController.js`

다음 기능을 `App.jsx`에서 이동했다.

- 사용자 신청정보 변경 요청 승인·불허
- 사용자 대여 신청 취소 요청 승인·불허
- 사용자 대여 연장 요청 승인·불허
- 조기 반납 요청 승인·불허
- 신청·가용성·자산 문서 transaction 처리
- 연장 횟수·기간·충돌·신청 가능일 검증
- 반납 시 연체 제한 및 페널티 후속 처리
- 관리자 감사 로그 생성
- 관리자 신청 목록과 로컬 자산·가용성 상태 동기화
- 처리 중 요청 ID 상태 관리

`App.jsx`에는 다음 연결만 유지한다.

```jsx
const { reviewUserActionRequest } =
  useAdminUserActionReviewController({
    dataSettings: data.settings,
    getAdminRequestById,
    getCurrentAdminAuditActor,
    getUserRequestActionLabel,
    isSplitStorageReady,
    notifyAdminRequestMutation,
    setAdminUserActionSavingRequestId,
    setData,
    triggerToast,
    updateAdminRequestPanelRequests,
  });
```

## 5. 기능 보존

- 검토 대기 상태 요청만 처리
- 관리자 인증 정보 필수 확인
- 사용자 요청 유형과 현재 신청 상태 검증
- 연장 정책, 최대 횟수, 신청 가능일, 기간 충돌 검증
- 승인·불허 처리 결과와 감사 로그 저장
- 반납 승인 시 연체 제한 문서 및 연관 신청 상태 정리
- 처리 성공 후 관리자 신청 mutation version 갱신
- 기존 성공·실패 토스트 문구 유지

## 6. 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 8,184 | 7,329 | -855 |
| `App.jsx` 크기 | 239,681 bytes | 215,437 bytes | -24,244 bytes |
| `App.jsx` `useState()` | 109 | 108 | -1 |
| `App.jsx` `runTransaction()` | 2 | 1 | -1 |
| 초기 정적 모듈 | 60 | 61 | +1 |
| 초기 정적 소스 | 823,564 bytes | 825,715 bytes | +2,151 bytes |

신규 컨트롤러는 943줄, 26,395 bytes이다.

## 7. Firestore 영향

전체 감사 대상 호출은 129개로 유지된다.

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |

다음 파일은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- `tools/firestore-audit-policy.json`

Firebase Rules와 인덱스 배포는 필요하지 않다.

## 8. UI 문자열 변경

의도적인 변경만 존재한다.

- 제거: `운영 장애나 예정된 점검처럼 모든 화면에서 계속 보여야 하는 짧은 안내입니다.`
- 추가: `운영 장애나 예정된 점검처럼 사용자 화면 상단에 계속 표시할 짧은 안내입니다.`
- 추가: `일부 탭의 전체 건수를 불러오지 못했습니다. '-'로 표시된 탭은 목록을 기준으로 확인해 주세요.`

그 밖의 사용자 요청 심사 관련 문구는 이동 전과 동일하다.

## 9. 누적 삭제 목록

- 직전 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- `REMOVED_FILES.txt`는 직전 기준본에서 그대로 승계

## 10. 다음 순차 분리 대상

1. 대여 제한 조회·관리자 감사 actor 공용 서비스
2. 대여 자산·신청·가용성 실시간 구독 컨트롤러
3. 회원·관리자 권한 및 정책 실시간 구독 컨트롤러
4. 공지사항·FAQ 사용자 조회 컨트롤러
5. 팝업·푸터 사용자 조회 컨트롤러
6. 화면 이동·브라우저 경로 컨트롤러
7. 전역 UI 상태 컨트롤러
8. 대시보드 파생값·선택자 모듈
9. 초기화·구형 데이터 호환성 서비스
10. context 조립부와 최종 App shell 정리
