# P2 관리자 시스템·휴일·자산 카테고리 컨트롤러 분리 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-admin-popup-footer-content-controller-split-20260730_1652_deployment_package.zip`
- 작업 목적: `src/App.jsx`에 남아 있던 대여 정책 설정, 휴일 관리, 자산 카테고리 관리 상태와 Firestore 저장 로직을 feature controller로 분리한다.
- 작업 성격: 기능 변경이 아닌 코드 소유권 이동
- UI, 한국어 문구, Firestore 컬렉션·문서 구조, Rules, 인덱스는 변경하지 않는다.

## 2. 신규 feature 모듈

### `src/features/settings/useAdminSystemSettingsController.js`

다음 상태를 소유한다.

- 대여 정책·휴일 공용 임시 설정 `tempSettings`
- 신규 휴일 날짜·명칭·유형
- 공휴일 JSON 불러오기 연도·진행 상태·충돌 모달
- 휴일 관리 연도·월·화면 형식
- 대여 정책·휴일 미저장 변경 여부

다음 동작을 소유한다.

- 대여 정책 입력 검증과 `rentalSystem/publicConfig.settings.*` 저장
- 대여 정책 변경 취소
- 휴일 사유 추가·수정·삭제
- 정적 공휴일 JSON 불러오기
- 중복 휴일 제외·병합·교체 처리
- 휴일 목록 저장과 변경 취소
- 설정 탭 진입 시 임시 버퍼 동기화

### `src/features/assets/useAdminAssetCategoryController.js`

다음 상태를 소유한다.

- 신규 카테고리명
- 임시 카테고리 목록
- 카테고리명 변경 매핑
- 편집 중 카테고리 인덱스·명칭
- 드래그 중 카테고리 인덱스
- 자산 카테고리 미저장 변경 여부

다음 동작을 소유한다.

- 카테고리 임시 추가·수정·삭제·순서 변경
- 카테고리 변경 취소
- 최신 자산 전체 조회 후 사용 중 카테고리 검증
- 진행 중 예약 자산의 카테고리명 변경 차단
- `rentalAssets`, 공개 설정, 공개 자산 카탈로그 일괄 저장
- 저장 후 사용자·관리자 카테고리 필터 초기화
- 카테고리 탭 진입 시 임시 버퍼 동기화

## 3. App.jsx 통합 경계

`App.jsx`에는 다음 역할을 유지한다.

- 원격 공용 설정·자산·신청 데이터 구독
- 전역 관리자 탭과 미저장 변경 이동 확인
- 전역 관리자 인증 상태
- 전역 toast와 confirm
- 관리자 패널 context 제공
- 사용자 대여 날짜 입력과 정책 적용

기존 context 변수명과 함수명은 유지했다.

## 4. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 11,468 | 10,504 | -964 |
| `App.jsx` 바이트 | 334,576 | 305,279 | -29,297 |
| `App.jsx` `useState()` | 139 | 123 | -16 |
| `App.jsx` `useEffect()` | 58 | 55 | -3 |
| `App.jsx` `useMemo()` | 30 | 27 | -3 |
| `App.jsx` `useRef()` | 20 | 20 | 0 |
| `App.jsx` `runTransaction()` | 4 | 4 | 0 |
| 초기 정적 모듈 | 52 | 54 | +2 |
| 초기 정적 소스 | 803,889 bytes | 809,711 bytes | +5,822 bytes |

신규 모듈 규모:

- `useAdminSystemSettingsController.js`: 769줄, 22,555 bytes
- `useAdminAssetCategoryController.js`: 429줄, 12,564 bytes

이번 단계는 지연 로딩이 아니라 책임 분리이므로 초기 정적 모듈과 소스 바이트는 증가한다.

## 5. 기능 보존

다음 동작을 변경하지 않았다.

- 최장 대여 기간·연장 횟수·연장 기간·연장 대기일 검증
- 연체 페널티 고정 일수·배수 검증
- 토요일·일요일·공휴일 및 업무 종료 이후 시작일 정책 정규화
- 정책 저장 후 휴일 목록 보존
- 휴일 날짜별 복수 사유 지원
- 동일 날짜·동일 사유 중복 차단
- 휴일 날짜 이동 시 대상 날짜 중복 차단
- 정적 공휴일 JSON의 중복 제외·병합·교체
- 카테고리명 중복 차단
- 사용 중인 카테고리 삭제 차단
- 진행 중 예약이 있는 자산의 카테고리명 변경 차단
- 공개 자산 카탈로그 write-through
- 기존 버튼, 입력 UI, className 및 한국어 문구 유지

전체 `src` 한국어 문자열 발생 집합과 발생 횟수는 수정 전후 동일하다.

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

`tools/firestore-audit-policy.json`은 자산 카테고리 저장용 전체 자산 `getDocs()`가 `App.jsx`에서 신규 controller로 이동하여 감사 ID만 갱신했다. 승인 사유와 재검토 조건은 변경하지 않았다.

따라서 Firebase Rules 및 인덱스 배포는 필요하지 않다.

## 7. 누적 삭제 목록

- 직전 누적 삭제 경로: 67개
- 상단 설명 주석: 1줄
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 67개
- `package-meta/REMOVED_FILES.txt`: 바이트 단위 승계

## 8. 검증 결론

다음 검사를 통과했다.

- 입력 패키지 315개 파일 SHA-256 검증
- React Hook import 감사
- JS·JSX·MJS TypeScript 변환
- 미정의·중복 식별자 표적 진단
- 상대 import 실파일 검사
- 휴일·자산 카테고리·대여 정책 panel context 계약
- Firestore strict 감사
- 한국어 문자열 발생 집합·횟수 비교
- 시스템 설정·휴일·자산 카테고리 controller 런타임 모의시험 6개 시나리오

실제 Vite 빌드는 검증 환경의 내부 npm 저장소가 `yargs-parser-21.1.1.tgz`를 404로 반환하여 수행하지 못했다. 로컬 `deploy.ps1`의 `npm run build` 성공을 최종 배포 조건으로 유지한다.
