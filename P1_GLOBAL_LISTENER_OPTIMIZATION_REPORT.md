# P1 앱 시작·공통 전역 리스너 최적화 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p1-listener-scope-optimization-deployment-package.zip`
- 작업 목적: 앱 시작 및 사용자 공통 화면에서 저빈도 공개 콘텐츠가 장시간 실시간 구독되는 구조를 축소
- 기능 보존 원칙:
  - 관리자 편집 화면은 실시간 동기화 유지
  - 사이트 운영 모드·대여 정책·관리자 보안 정책은 실시간 반영 유지
  - Firestore 문서 구조·Rules·인덱스·화면 문구 변경 없음

## 2. 수정 파일

### 기존 파일 수정

```text
src/App.jsx
src/user/UserHomePanel.jsx
```

### 런타임과 무관한 보고서

```text
P1_GLOBAL_LISTENER_OPTIMIZATION_REPORT.md
P1_GLOBAL_LISTENER_OPTIMIZATION_VALIDATION_REPORT.txt
```

## 3. 수정 전 문제

사용자 화면에서 변경 빈도가 낮은 다음 콘텐츠도 `onSnapshot()`으로 계속 연결되어 있었다.

- 홈 배너
- 홈 배너 표시 설정
- 홈 화면 고정 공지
- 홈 화면 일반 공지
- 사용자 팝업
- 푸터 공통 설정
- 푸터 메뉴 페이지
- 로그인 전 사용자 세션 정책

이 구조는 최초 조회뿐 아니라 다음 비용을 발생시킬 수 있다.

- 관리자가 문서를 수정할 때 열린 모든 사용자 브라우저로 변경 문서 재수신
- 네트워크 연결이 끊겼다가 복구될 때 리스너 재연결
- 메모리 전용 캐시 환경에서 재연결 시 서버 결과 재조회
- 사용자에게 즉시 반영될 필요가 없는 공개 콘텐츠에 대한 지속 연결 유지

## 4. 사용자 홈 배너 및 홈 설정

### 수정 전

```jsx
const unsubscribe = onSnapshot(enabledQuery, ...);
return unsubscribe;
```

```jsx
const unsubscribe = onSnapshot(HOME_PAGE_CONFIG_DOC_REF, ...);
return unsubscribe;
```

### 수정 후

```jsx
const snapshot = await getDocs(enabledQuery);
```

```jsx
const snapshot = await getDoc(HOME_PAGE_CONFIG_DOC_REF);
```

`UserHomePanel`이 마운트될 때 한 번 읽고, 홈 화면을 벗어나면 취소 플래그로 늦게 도착한 응답의 상태 반영을 차단한다.

관리자 홈 배너 관리 패널의 실시간 구독은 변경하지 않았다.

## 5. 홈 화면 공지사항

공지사항 전체 페이지와 관리자 공지 관리 화면은 계속 실시간 구독한다.

사용자 홈 화면에서 표시하는 다음 데이터만 1회 조회로 변경했다.

- 고정 공지 최대 6건
- 일반 공지 최대 7건 조회 후 6건 표시

```jsx
if (shouldLoadUserHomeNotice) {
  void getDocs(pinnedSource);
} else {
  return onSnapshot(pinnedSource, ...);
}
```

```jsx
if (shouldLoadUserHomeNotice) {
  void getDocs(regularSource);
} else {
  unsubscribe = onSnapshot(regularSource, ...);
}
```

따라서 홈 화면을 계속 열어둬도 공지 컬렉션 리스너 2개가 유지되지 않는다.

## 6. 사용자 팝업

### 사용자 화면

```jsx
void getDocs(
  query(
    POPUP_POSTS_COLLECTION_REF,
    where('enabled', '==', true)
  )
);
```

홈 또는 로그인 사용자의 대여 신청 화면에 진입할 때 활성 팝업 후보를 한 번 조회한다.

### 관리자 팝업 관리

```jsx
return onSnapshot(
  POPUP_POSTS_COLLECTION_REF,
  applyPopupSnapshot,
  handlePopupLoadError
);
```

관리자 편집 중 다른 변경이 즉시 반영되어야 하므로 기존 실시간 구독을 유지했다.

## 7. 사용자 푸터

### 사용자 화면

```jsx
void getDoc(SITE_FOOTER_CONFIG_DOC_REF);
void getDocs(enabledFooterPagesQuery);
```

사용자 화면으로 진입할 때 각각 한 번만 읽는다. 사용자 탭을 이동해도 `view`가 유지되는 동안 다시 조회하지 않는다.

### 관리자 푸터 관리

다음 실시간 구독을 유지한다.

```jsx
return onSnapshot(SITE_FOOTER_CONFIG_DOC_REF, ...);
return onSnapshot(FOOTER_PAGES_COLLECTION_REF, ...);
```

## 8. 사용자 세션 정책

### 수정 전

로그인 여부와 관계없이 앱 시작 직후 다음 문서를 계속 구독했다.

```jsx
onSnapshot(USER_SESSION_POLICY_DOC_REF, ...)
```

### 수정 후

다음 경우에만 구독한다.

1. Firebase Auth에 로그인한 일반 사용자
2. 관리자 `계정 보안 설정` 화면

```jsx
const shouldSubscribeUserSessionPolicy =
  shouldSubscribeForActiveUser ||
  shouldSubscribeForAdminSecurity;
```

로그인 화면에서 정책이 아직 준비되지 않았으면 로그인 처리 직전에 기존 코드의 `getDoc(USER_SESSION_POLICY_DOC_REF)`가 최신 정책을 읽는다. 따라서 로그인 유지 방식과 세션 만료 정책은 기본값으로 임의 처리되지 않는다.

## 9. 실시간 구독을 유지한 항목

다음 항목은 즉시 반영 필요성이 있어 축소하지 않았다.

| 항목 | 유지 이유 |
|---|---|
| `siteSettings/config` | 점검 모드, 읽기 전용 모드, 시스템 배너, 사이트 색상 즉시 반영 |
| `rentalSystem/publicConfig` | 대여 기간·휴일·카테고리·가입 정책의 공통 기준 |
| `systemAdminSettings/main` | 관리자 보안 정책 변경 시 기존 관리자 세션 강제 만료 |
| 로그인 사용자 세션 정책 | 사용자 보안 정책 변경 시 기존 사용자 세션 강제 만료 |
| 사용자 공개 자산 카탈로그 | 자산 가용 상태 화면 반영 |
| `rentalAvailability` | 예약·대여 상태 충돌 방지 |
| 관리자 콘텐츠 편집 화면 | 관리자 작업 중 원격 변경 즉시 반영 |

## 10. 코드 경로 기준 지속 리스너 변화

아래 수치는 특정 화면에서 조건이 모두 충족됐을 때의 Firestore `onSnapshot()` 코드 경로 기준 예상치다. Firebase Auth의 `onAuthStateChanged()`는 포함하지 않는다.

| 화면 | 수정 전 | 수정 후 | 감소 |
|---|---:|---:|---:|
| 비로그인 사용자 홈 | 12개 | 4개 | 8개 |
| 로그인 사용자 홈 | 16개 | 9개 | 7개 |
| 비로그인 로그인 화면 | 5개 | 2개 | 3개 |
| 관리자 일반 화면 | 기존 대비 | 사용자 세션 정책 1개 제거 | 1개 |
| 관리자 계정 보안 | 동일 | 동일 | 0개 |
| 관리자 팝업·푸터 편집 | 동일 | 동일 | 0개 |

### 사용자 홈에서 제거된 지속 리스너

```text
홈 배너                  1
홈 표시 설정             1
고정 공지                1
일반 공지                1
팝업                     1
푸터 공통 설정           1
푸터 페이지              1
비로그인 세션 정책       1
```

로그인 사용자는 세션 정책 실시간 구독이 보안상 유지되므로 7개가 감소한다.

## 11. Firestore 읽기 비용 해석

이번 변경은 콘텐츠의 최초 조회를 삭제한 것이 아니다.

예를 들어 푸터 페이지가 5개라면 사용자 화면 첫 진입 시 여전히 다음 읽기가 발생할 수 있다.

```text
푸터 설정 1문서
푸터 페이지 5문서
```

차이는 조회 후 연결을 닫는다는 점이다.

따라서 절감 대상은 다음이다.

- 화면을 오래 열어둔 동안의 콘텐츠 변경 재수신
- 리스너 재연결 시 재조회
- 불필요한 활성 리스너 유지
- 한 관리자의 콘텐츠 수정이 열린 모든 사용자 세션에 즉시 전파되며 발생하는 읽기

## 12. 갱신 시점 변화

1회 조회로 전환된 공개 콘텐츠는 다음 시점에 다시 읽는다.

- 브라우저 새로고침
- 관리자 화면에서 사용자 화면으로 복귀
- 홈 화면을 벗어났다가 다시 홈으로 진입하여 `UserHomePanel`이 재마운트될 때
- 팝업 대상 화면을 벗어났다가 다시 진입할 때

푸터는 사용자 `view`가 유지되는 동안 탭 이동만으로 다시 읽지 않는다.

## 13. 변경하지 않은 영역

```text
rules/firestore.rules
firestore.indexes.json
firebase.json
.firebaserc
package.json
package-lock.json
Firestore 컬렉션·문서 구조
대여 신청·승인·반납 로직
화면 문구 및 디자인
```

## 14. 배포

Rules와 인덱스 변경이 없으므로 웹 배포만 수행한다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
