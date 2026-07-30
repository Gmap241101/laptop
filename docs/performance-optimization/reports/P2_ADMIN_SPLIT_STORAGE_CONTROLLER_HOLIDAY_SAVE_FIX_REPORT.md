# P2 관리자 분리 저장소 전환 컨트롤러 분리 및 휴일 저장 토스트 오류 수정 보고서

## 1. 기준본

- 입력 기준본: `rental-system-admin-system-holiday-asset-category-controller-split-20260730_1703_deployment_package.zip`
- 작업 범위: `App.jsx` 구조 분리와 휴일 저장 후 잘못된 실패 토스트 회귀 수정
- UI·Firestore 문서 구조·Rules·인덱스 변경: 없음

## 2. 휴일 저장 오류 원인과 수정

`saveHolidaySettings()`의 `updateDoc()`는 정상 완료됐지만, 저장 직후 호출되는 `setHolidayImportLoading(false)`가 `App.jsx`에서 컨트롤러로 전달되지 않았습니다. 이로 인해 Firestore 쓰기 완료 후 `TypeError`가 발생하고 같은 `try...catch`의 실패 토스트가 표시됐습니다.

수정 내용:

- `useAdminSystemSettingsState()` 반환값에서 `setHolidayImportLoading` 구조 분해
- `useAdminSystemSettingsController()` 인자로 `setHolidayImportLoading` 전달
- 실제 저장 회귀 모의시험에서 성공 반환값과 성공 토스트 확인

## 3. 다음 순차 구조 분리

신규 파일 `src/features/settings/useAdminSplitStorageMigrationController.js`로 다음을 이동했습니다.

- `splitStorageFinalizeLoading` 상태
- 분리 저장소 최종 전환 관리자 인증 검사
- 공개 설정·자산·예약 잠금·대여자·자산번호 레지스트리 조회
- 예약 잠금과 자산 문서 정합성 검증
- 자산관리번호 중복·누락 검증
- 자산 예약 배열·상태·대표 신청 재계산
- 자산번호 레지스트리 재구축
- 대여자 문서 정규화
- 공개 자산 카탈로그 재구축
- `storageVersion`, `storageMode`, `storageReady` 최종 기록
- 오류별 사용자 안내와 로딩 상태 종료

`App.jsx`에는 상태 hook과 controller 연결만 남겼습니다.

## 4. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 10,504 | 10,176 | -328 |
| 크기 | 305,279 bytes | 296,485 bytes | -8,794 bytes |
| useState | 123 | 122 | -1 |
| useEffect | 55 | 55 | +0 |
| useMemo | 27 | 27 | +0 |
| useRef | 20 | 20 | +0 |
| runTransaction | 4 | 4 | +0 |

신규 컨트롤러: 319줄, 9,525 bytes

## 5. 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 54 | 55 | +1 |
| 초기 정적 소스 | 809,711 bytes | 810,442 bytes | +731 bytes |

이번 단계는 지연 로딩이 아니라 책임 분리이므로 신규 정적 모듈 1개가 추가됐습니다.

## 6. Firestore 영향

- 전체 감사 대상 호출: 129 → 129
- `onSnapshot`: 35 → 35
- `getDocs`: 48 → 48
- `getDoc`: 28 → 28
- `getCountFromServer`: 18 → 18
- 분리 저장소 전환용 전체 조회 4개의 감사 ID만 신규 파일 위치에 맞게 갱신
- Firestore Rules·인덱스·Firebase 설정 변경 없음

## 7. 삭제 파일

- 이번 작업 신규 삭제: 0개
- 기존 `package-meta/REMOVED_FILES.txt` 67개 경로 그대로 승계
