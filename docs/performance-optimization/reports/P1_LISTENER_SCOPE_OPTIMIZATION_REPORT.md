# P1 화면별 리스너 범위 및 팝업 렌더링 최적화 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p1-query-scope-optimization-deployment-package.zip`
- 작업 우선순위: 후속 우선순위 3
- 목표:
  1. 화면에서 사용하지 않는 Firestore 실시간 구독 즉시 해제
  2. 최상위 `App`의 1분 팝업 시계 제거
  3. 화면 이탈 후 숨은 데이터 상태 정리
  4. 기존 팝업 노출·숨김 기능과 푸터 관리 기능 유지

## 2. 확인된 문제

### 2.1 관리자 모든 화면에서 푸터 데이터 상시 구독

수정 전에는 관리자 인증 여부만으로 다음 두 구독이 활성화됐습니다.

- `siteFooter/config` 단일 문서
- `footerPages` 전체 컬렉션

따라서 실시간 대시보드, 신청 관리, 자산 관리, 회원 관리 등 푸터와 무관한 화면에서도 푸터 데이터를 읽었습니다.

### 2.2 최상위 App의 1분 팝업 시계

수정 전 `App.jsx`에 다음 상태와 타이머가 있었습니다.

```jsx
const [popupNowMs, setPopupNowMs] = useState(Date.now());

useEffect(() => {
  const intervalId = window.setInterval(
    () => setPopupNowMs(Date.now()),
    60_000
  );
  // ...
}, []);
```

이 타이머는 팝업이 표시되지 않는 관리자 화면과 사용자 공지·FAQ·마이페이지에서도 계속 동작했습니다. 1분마다 최상위 `App`과 전체 `uiContext`가 다시 생성되는 구조였습니다.

## 3. 수정 내용

### 3.1 푸터 구독 범위 제한

푸터 구독은 다음 화면에서만 활성화됩니다.

```text
사용자 화면 전체
관리자 > 푸터 관리
```

관리자 일반 화면에서는 구독하지 않습니다.

```jsx
const shouldLoadUserFooter = view === 'user';
const shouldLoadAdminFooter =
  isAdminAuthenticated &&
  view === 'admin' &&
  adminTab === 'footerManagement';

const shouldSubscribeFooter =
  shouldLoadUserFooter || shouldLoadAdminFooter;
```

관리자 일반 화면으로 이동하면 다음 상태를 정리합니다.

```jsx
setFooterConfig(createDefaultFooterConfigDraft());
setFooterConfigDraft(createDefaultFooterConfigDraft());
setFooterPages([]);
setFooterConfigReady(true);
setFooterPagesReady(true);
```

#### 화면별 활성 구독 변화

| 화면 | 수정 전 | 수정 후 |
|---|---:|---:|
| 사용자 화면 | 푸터 설정 1 + 푸터 페이지 1 | 동일 |
| 관리자 푸터 관리 | 푸터 설정 1 + 푸터 페이지 1 | 동일 |
| 관리자 대시보드 | 푸터 설정 1 + 푸터 페이지 1 | 0 |
| 관리자 신청·자산·회원 등 | 푸터 설정 1 + 푸터 페이지 1 | 0 |

푸터 페이지가 `N`개라면 관리자 일반 화면 최초 연결 또는 재연결 시 발생할 수 있던 약 `1 + N`건의 푸터 문서 초기 읽기를 제거합니다.

### 3.2 팝업 시계를 화면 내부로 이동

공통 훅을 추가했습니다.

```text
src/hooks/useMinuteClock.js
```

이 훅은 다음 기능을 제공합니다.

- 기본 60초 간격 시간 갱신
- 브라우저 탭이 다시 보일 때 즉시 시간 동기화
- 컴포넌트 해제 시 interval과 visibility listener 정리

최상위 `App`에서는 팝업 시계 상태와 interval을 완전히 제거했습니다.

### 3.3 사용자 팝업 계산을 UserPopupLayer로 이동

수정 전에는 `App.jsx`가 매분 다음 작업을 수행했습니다.

- 팝업 노출 기간 판정
- 대상 화면 필터링
- 임시·세션·7일 숨김 필터링
- 표시 순서 정렬
- `visibleUserPopups` 재생성

수정 후에는 `UserPopupLayer`가 실제로 렌더링될 때만 처리합니다.

```text
사용자 홈
로그인한 사용자의 대여 신청 화면
```

다른 사용자 화면과 관리자 화면에서는 `UserPopupLayer` 자체가 마운트되지 않습니다.

### 3.4 관리자 팝업 관리 시계 지역화

`AdminPopupPanel`은 패널이 열려 있을 때만 자체 `useMinuteClock()`을 사용합니다.

따라서 노출예정·노출중·노출종료 상태는 계속 1분 단위로 갱신되지만, 다른 관리자 메뉴에서는 타이머가 존재하지 않습니다.

### 3.5 팝업 날짜·상태 함수 분리

신규 파일:

```text
src/utils/popupUtils.js
```

분리된 함수:

- `getPopupDateMillis()`
- `getPopupVersionKey()`
- `toDateTimeLocalValue()`
- `formatPopupDateTime()`
- `getPopupDisplayStatus()`

기존 함수 본문을 그대로 이동했으며 팝업 노출 판정 기준은 변경하지 않았습니다.

## 4. 수정된 파일

### 기존 파일

```text
src/App.jsx
src/admin/AdminPopupPanel.jsx
src/user/UserPopupLayer.jsx
```

### 신규 파일

```text
src/hooks/useMinuteClock.js
src/utils/popupUtils.js
```

## 5. 변경하지 않은 영역

```text
rules/firestore.rules
firestore.indexes.json
firebase.json
.firebaserc
Firestore 컬렉션과 문서 구조
팝업 숨김 저장 키
팝업 노출 대상 페이지
푸터 저장·수정·삭제 로직
사용자·관리자 화면 문구
```

Firebase Rules와 인덱스를 다시 배포할 필요가 없습니다.

## 6. 코드 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 21,084 | 20,978 | 106줄 감소 |
| `App.jsx` 크기 | 610,528 bytes | 606,870 bytes | 3,658 bytes 감소 |
| 최상위 팝업 interval | 1개 | 0개 | 제거 |
| 관리자 일반 화면 푸터 구독 | 2개 | 0개 | 제거 |

신규 훅과 유틸리티 파일이 추가됐으므로 프로젝트 전체 소스 크기 자체를 줄이는 작업은 아닙니다. 이번 작업의 핵심은 비활성 화면의 실시간 구독과 최상위 주기 렌더링을 제거하는 것입니다.

## 7. 동작 결과

### 관리자 로그인 후 대시보드

```text
푸터 설정 구독 안 함
푸터 페이지 구독 안 함
팝업 시계 없음
```

### 관리자 팝업 관리

```text
팝업 컬렉션 구독
AdminPopupPanel 내부 1분 시계
다른 패널 이동 시 모두 해제
```

### 관리자 푸터 관리

```text
푸터 설정 구독
푸터 페이지 전체 구독
다른 패널 이동 시 모두 해제하고 상태 정리
```

### 사용자 홈

```text
사용자용 푸터 구독
활성 팝업 구독
UserPopupLayer 내부 1분 시계
```

### 사용자 공지·FAQ·마이페이지 등

```text
사용자용 푸터 구독 유지
팝업 구독 해제
팝업 레이어와 팝업 시계 없음
```

## 8. 배포

이번 변경에는 Firestore Rules와 인덱스 변경이 없습니다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```

## 9. 다음 순차 작업

다음 우선순위는 **앱 시작 및 공통 전역 리스너 추가 축소**입니다.

검토 대상:

- 비로그인 상태의 사용자 세션 정책 구독 필요성
- 사이트 설정·공개 대여 정책의 실시간 유지 범위
- 사용자 홈의 공지·배너·팝업·푸터 공개 데이터 통합 가능성
- 관리자 보안 설정 구독 범위
