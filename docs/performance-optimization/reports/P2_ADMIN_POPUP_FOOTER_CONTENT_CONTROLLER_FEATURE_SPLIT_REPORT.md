# P2 관리자 팝업·푸터 콘텐츠 컨트롤러 분리 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-admin-account-management-controller-split-20260730_1616_deployment_package.zip`
- 작업 목적: `src/App.jsx`에 남아 있던 관리자 팝업 게시물과 푸터 콘텐츠 편집 상태·Firestore 변경 로직을 feature controller로 분리한다.
- 작업 성격: 기능 변경이 아닌 코드 소유권 이동
- UI, 문구, Firestore 컬렉션·문서 구조, Rules, 인덱스는 변경하지 않는다.

## 2. 신규 feature 모듈

### `src/features/boards/useAdminPopupPostController.js`

다음 상태를 소유한다.

- `popupPostDialog`
- `popupPostForm`
- `popupPostSaving`
- `popupPostDeletingId`
- `popupPostToggleSavingId`

다음 동작을 소유한다.

- 팝업 신규·수정 다이얼로그 열기와 닫기
- rich HTML 변환·정제
- 노출 시작·종료일시 및 무기한 검증
- 노출 대상 페이지 검증
- 신규·수정 저장과 정렬 순서 정규화
- 사용 여부 변경
- 표시 순서 변경
- 삭제와 남은 문서 순서 재정렬

### `src/features/boards/useAdminFooterContentController.js`

다음 상태를 소유한다.

- `footerConfigDraft`
- `footerConfigSaving`
- `footerPageDialog`
- `footerPageForm`
- `footerPageSaving`
- `footerPageDeletingId`
- `footerPageToggleSavingId`

다음 동작을 소유한다.

- 푸터 공통 정보 저장
- 푸터 메뉴 페이지 신규·수정 다이얼로그
- 미저장 변경 확인 후 닫기
- 텍스트·이미지 제목 검증
- 상세 본문·외부 링크 검증
- 신규·수정 저장
- 사용 여부 변경
- 메뉴 순서 변경
- 삭제와 선택 상세 페이지 초기화

푸터 초기값·정규화·URL 검사·공통 HTML 정제 함수도 feature 모듈로 이동하고, App의 실시간 조회 및 변경 감지에서 필요한 함수만 named import로 재사용한다.

## 3. App.jsx 통합 경계

`App.jsx`에는 다음 역할을 유지한다.

- 팝업과 푸터의 사용자·관리자 조건부 Firestore 조회
- 사용자 팝업 임시·세션·7일 숨김 상태
- 푸터 공통 설정·페이지 조회 결과
- 사용자 푸터 페이지 라우팅
- 전역 관리자 인증 상태
- 전역 confirm·toast
- 관리자 패널 context 제공

기존 context 변수명과 함수명은 유지했다.

## 4. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 12,042 | 11,468 | -574 |
| `App.jsx` 바이트 | 355,160 | 334,576 | -20,584 |
| `App.jsx` `useState()` | 151 | 139 | -12 |
| `App.jsx` `useEffect()` | 58 | 58 | 0 |
| `App.jsx` `useMemo()` | 30 | 30 | 0 |
| `App.jsx` `useRef()` | 20 | 20 | 0 |
| `App.jsx` `runTransaction()` | 4 | 4 | 0 |
| 초기 정적 모듈 | 50 | 52 | +2 |
| 초기 정적 소스 | 797,973 bytes | 803,889 bytes | +5,916 bytes |

신규 모듈 규모:

- `useAdminPopupPostController.js`: 385줄, 11,116 bytes
- `useAdminFooterContentController.js`: 533줄, 15,384 bytes

이번 단계는 지연 로딩이 아니라 책임 분리이므로 초기 정적 모듈과 소스 바이트는 증가한다.

## 5. 기능 보존

다음 동작을 변경하지 않았다.

- 관리자 인증이 없으면 팝업·푸터 저장과 편집을 차단
- 팝업 제목·부제목·본문 중 하나 이상 필수
- 팝업 시작일시와 종료일시 검증
- 팝업 노출 대상 페이지 최소 1개 필수
- 팝업 생성·수정·삭제 후 `sortOrder` 정규화
- 팝업 작성자·등록일 유지
- 푸터 공통 HTML에서 영상 요소 제거
- 구형 `pageType=link`, `linkUrl=#` 페이지를 표시 전용 페이지로 변환
- 이미지 제목 URL은 HTTP·HTTPS만 허용
- 상세 페이지 본문 필수 검증
- 외부 링크 URL 검증
- 푸터 페이지 작성자·등록일·정렬 순서 유지
- 삭제 중인 사용자 선택 상세 페이지 초기화
- 기존 버튼, 입력 UI, className 및 한국어 문구 유지

전체 `src` 한국어 문자열 발생 집합 비교 결과는 수정 전후 동일하다.

## 6. Firestore 영향

Firestore 조회 감사 수치는 수정 전후 동일하다.

- 전체 감사 대상 호출: 129
- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

다음 파일은 변경하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`
- `tools/firestore-audit-policy.json`

따라서 Firebase Rules 및 인덱스 배포는 필요하지 않다.

## 7. 누적 삭제 목록

- 직전 누적 삭제 경로: 67개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- `package-meta/REMOVED_FILES.txt`: 바이트 단위 승계

## 8. 검증 결론

다음 검사를 통과했다.

- React Hook import 감사
- JS·JSX·MJS TypeScript 변환
- 미정의·중복 식별자 표적 진단
- 상대 import 실파일 검사
- 팝업·푸터 관리자 context 계약
- Firestore strict 감사
- 한국어 문자열 발생 집합 비교
- 팝업·푸터 컨트롤러 런타임 모의시험 7개 시나리오

실제 Vite 빌드는 검증 환경의 npm 저장소가 `yargs-parser-21.1.1.tgz`를 404로 반환하여 수행하지 못했다. 로컬 `deploy.ps1`의 `npm run build` 성공을 최종 배포 조건으로 유지한다.
