# P2 데드 코드·미사용 바인딩 정리 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-app-blocking-state-screen-split-20260801_2250_deployment_package.zip`
- 작업 목적: 누적 구조 분리 이후 `App.jsx`와 주변 화면 모듈에 남은 미사용 import, 지역 helper, 상태 반환값 및 컨텍스트 구조분해 항목 제거
- 기능 변경: 없음
- Firestore 구조·호출 조건 변경: 없음

## 2. 주요 정리 내용

### App.jsx

- 미사용 Firebase import 제거
- 분리 완료 후 남아 있던 리치 텍스트·대여 정책·회원 정책·시스템 설정 import 제거
- 더 이상 참조되지 않는 구형 관리자 비밀번호 PBKDF2/SHA-256 지역 구현 제거
- 더 이상 참조되지 않는 회원 상태 표시 helper 제거
- 컨트롤러·selector 반환값 중 실제 소비되지 않는 8개 바인딩 제거

삭제한 구형 관리자 비밀번호 지역 구현은 현재 관리자 인증 경로에서 호출되지 않았으며, 관리자 계정은 Firebase Authentication 기반 컨트롤러로 처리됩니다.

### 주변 모듈

다음 파일에서 사용되지 않는 import 또는 컨텍스트 구조분해 항목을 제거했습니다.

- `src/admin/AdminHolidayManagementPanel.jsx`
- `src/admin/AdminRequestsPanel.jsx`
- `src/admin/AdminSettingsPanel.jsx`
- `src/admin/AdminWorkspace.jsx`
- `src/components/RichTextContent.jsx`
- `src/components/RichTextEditor.jsx`
- `src/dialogs/AppDialogs.jsx`
- `src/features/settings/useAdminDataMaintenanceController.js`
- `src/user/UserBoardPanel.jsx`

## 3. 미사용 바인딩 감사 결과

TypeScript 5.8.3의 `noUnusedLocals` 진단을 JS/JSX 전체 소스에 적용했습니다.

| 항목 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 TS6133 미사용 바인딩 | 53 | 0 |
| App.jsx TS6133 | 34 | 0 |
| 기타 소스 TS6133 | 19 | 0 |

이번 정리는 실제 참조가 없는 항목만 대상으로 했습니다. 함수 파라미터는 계약 보존을 위해 자동 제거 대상에서 제외했습니다.

## 4. 변경 규모

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| App.jsx 줄 수 | 3,363 | 3,215 | -148 |
| App.jsx 크기 | 101,082 bytes | 97,415 bytes | -3,667 bytes |
| 초기 정적 모듈 | 78 | 78 | 0 |
| 초기 정적 소스 | 879,075 bytes | 875,401 bytes | -3,674 bytes |
| 동적 엔트리 | 14 | 14 | 0 |
| 전체 JS/JSX/MJS 소스 파일 | 134 | 134 | 0 |

소스 변경 통계는 10개 파일, 5줄 추가, 169줄 삭제입니다.

## 5. 사용자 문구 영향

실제 UI 경로에서 사용되지 않던 `getProfileRequiredReasonLabel()` 제거로 다음 세 문자열이 소스에서 삭제됐습니다.

- `부서·성명 중복 계정`
- `등록 명부 불일치`
- `등록 정보 확인 필요`

해당 helper는 호출 지점이 없었으므로 사용자 화면에 표시되는 문구에는 변화가 없습니다.

## 6. Firestore 영향

| 항목 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 감사 대상 호출 | 129 | 129 |
| onSnapshot | 35 | 35 |
| getDocs | 48 | 48 |
| getDoc | 28 | 28 |
| getCountFromServer | 18 | 18 |

Rules, 인덱스, Firebase 설정 및 감사 정책은 변경하지 않았습니다.

## 7. 결론

이번 단계는 기능 분리가 아니라 누적 분리 작업 후 남은 정적 잔여물을 정리하는 단계입니다. 초기 모듈 수와 동적 청크 구조는 그대로 유지하면서 `App.jsx`와 초기 정적 소스 크기를 줄였습니다.

## 8. 패키지 구성

- 출력 패키지: `rental-system-dead-code-unused-binding-cleanup-20260801_2255_deployment_package.zip`
- 프로젝트 파일: 438개
- `package-meta` 파일: 4개
- ZIP 전체 파일: 442개
- 누적 삭제 경로: 67개
- 신규 삭제 경로: 0개
