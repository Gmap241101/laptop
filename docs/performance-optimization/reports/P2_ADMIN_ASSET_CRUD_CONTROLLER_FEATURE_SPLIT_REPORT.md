# P2 관리자 자산 CRUD 컨트롤러 분리 보고서

## 1. 작업 기준

- 입력 기준본: `rental-system-admin-board-settings-controller-split-20260730_1521_deployment_package.zip`
- 작업 범위: `App.jsx`에 남아 있던 자산 신규 등록·수정·삭제 상태와 실행 흐름 분리
- 기능 변경: 없음
- UI·문구·Firestore 문서 구조 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 2. 신규 모듈

`src/features/assets/useAdminAssetCrudController.js`

이 모듈은 다음 책임을 소유한다.

- 신규 자산 편집 상태 `newLaptop`
- 기존 자산 편집 상태 `editLaptop`
- 신규 자산 패널 열기·닫기
- 자산 신규 등록 transaction
- 자산관리번호 중복 레지스트리 확인·저장
- 공용 자산 카탈로그 write-through
- 활성 신청이 연결된 자산 삭제 차단
- 자산 영구 삭제 transaction
- 자산 정보 수정 transaction
- 활성 신청 중 자산 카테고리·관리번호 변경 차단
- 자산 수정 후 대표 신청 상태 재계산
- 자산관리번호 레지스트리 변경·정리

공통 자산관리번호 정규화 함수도 같은 feature 경계로 이동했다.

- `normalizeAssetNumber`
- `getAssetNumberRegistryId`

`App.jsx`의 기존 마이그레이션·정합성 검사 코드는 위 두 함수를 named import로 계속 사용한다.

## 3. App.jsx 연결

`App.jsx`에는 다음 통합 경계만 남겼다.

- 관리자·Firebase 인증 주체
- 분리 저장소 준비 상태
- 최신 자산·신청 데이터
- 전역 `setData`
- 사용자 선택 자산 상태
- 공용 confirm·toast
- 업로드 패널과 자산 편집 패널 간 상호 배제

기존 관리자 패널 context에 노출되는 변수명과 함수명은 유지했다.

- `editLaptop`
- `newLaptop`
- `setEditLaptop`
- `setNewLaptop`
- `handleAddLaptopClick`
- `createLaptop`
- `deleteLaptop`
- `saveLaptop`

## 4. 코드 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 13,563 | 12,711 | -852 |
| `App.jsx` 바이트 | 398,116 | 376,638 | -21,478 |
| `App.jsx` `useState()` | 159 | 157 | -2 |
| `App.jsx` `runTransaction()` | 7 | 4 | -3 |
| 초기 정적 모듈 | 48 | 49 | +1 |
| 초기 정적 소스 | 792,759 bytes | 794,659 bytes | +1,900 bytes |

신규 컨트롤러는 941줄, 23,378 bytes다.

## 5. 기능 보존

다음 동작을 변경하지 않았다.

- 신규 등록 시 분리 저장소 전환 완료 여부 확인
- 자산관리번호와 카테고리 필수 검증
- 최신 카테고리 목록 transaction 재검증
- 자산관리번호 중복 등록 차단
- `rentalAssets`·`rentalAssetNumbers`·공용 자산 카탈로그 동시 갱신
- 활성 신청이 있는 자산 삭제 차단
- 삭제 직전 transaction에서 활성 신청 재확인
- 삭제 후 사용자 선택·관리자 수정 패널 정리
- 수정 시 최신 자산·카테고리·레지스트리 재확인
- 활성 신청 중 카테고리·관리번호 변경 차단
- 대표 신청 기준 자산 상태·현재 신청 ID 재계산
- 저장 실패 시 기존 입력 유지 또는 해당 편집 패널 정리 정책

## 6. Firestore 영향

Firestore 접근 위치 총수는 129개로 유지된다.

- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

`runTransaction()` 3개는 삭제된 것이 아니라 `App.jsx`에서 신규 feature 모듈로 이동했다.

다음 파일은 수정하지 않았다.

- `rules/firestore.rules`
- `firestore.indexes.json`
- `firebase.json`
- `.firebaserc`
- `package.json`
- `package-lock.json`

## 7. 누적 삭제 목록

- 이전 누적 삭제 경로: 68개
- 이번 신규 삭제 경로: 0개
- 최종 누적 삭제 경로: 68개
- `package-meta/REMOVED_FILES.txt`: 바이트 단위 승계

## 8. 검증 결론

React Hook import, JS·JSX 구문, 상대 import, Firestore strict audit, 한국어 문자열 보존, 런타임 모의시험 및 ZIP 전수 해시 검증을 수행한다. 실제 Vite 빌드는 검증 환경의 npm 저장소에서 `yargs-parser-21.1.1.tgz`가 404를 반환하여 로컬 `deploy.ps1` 빌드 단계에서 최종 확인해야 한다.
