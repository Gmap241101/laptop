# 기기 대여 시스템 Phase 34 P0 — JSON 파일 선택 표시 UX 핫픽스 개발·검증 보고서

- 날짜: 2026-10-20
- 코드 기준선: `rental-system-phase34-p0-scoped-json-e2e-audit-hotfix-20261020_deployment_package.zip`
- 기준선 ZIP SHA-256: `675b2bed4098f0fec76865deffce236906394f6713b8e721c91da595cbacc3e6`
- 상태: 로컬 코드 수정 및 정적/스모크 검증 완료. 실환경 Staging 수용검증 대기.
- 인프라: 기존 Essential-0 PostgreSQL 1개, 기존 Heroku Basic web dyno 1개만 사용. 신규 유료 서비스/스토리지/DB/Worker 없음.

## 1. 사용자 지적 및 개선

기존 네이티브 `<input type="file">` 선택 후 값(value)을 비워 동일 파일 재선택을 허용하면서, 입력창에는 '선택된 파일 없음'이 남고 별도 문구에 파일명이 나타나는 시각적 불일치를 수정함.

수정 후 단일 파일 선택 영역에 `파일 선택` 컨트롤과 선택된 JSON 파일명이 표시됨. 선택 전에는 `선택된 파일 없음`이 동일 위치에 표시되며, 별도의 `선택한 파일:` 행은 제거함. 긴 파일명은 영역 너비에 따라 생략하고 전체 이름을 `title` 속성에서 확인 가능. 숨겨진 실제 `type=file` 입력을 연동해 네이티브 파일 선택·키보드 초점·비활성화 상태를 보존함.

## 2. 소스 변경 파일

1. `src/admin/AdminSettingsPanel.jsx`: 파일 선택 UI 통합, 이름/레이블 접근성, 키보드 초점 스타일, disabled 상태, 같은 파일 재선택을 위한 input value 초기화 유지.
2. `src/features/settings/useAdminDataMaintenanceController.js`: 기존 백업 스키마 및 용량 검사는 그대로 유지. 파일을 연속 변경했을 때 이전 파일의 비동기 읽기 결과가 뒤늦게 적용되지 않도록 버전 번호를 추가하고, 파일·복원 범위·방식 변경 시 이전 미리보기 요청을 무효화.
3. `tools/frontend/smoke-phase34-json-file-picker-ux.mjs`: UI 연결 계약 검사와 실제 핸들러의 동일 파일 재선택/파일 교체/유효하지 않은 JSON/용량 초과/비동기 경합/오래된 미리보기 무효화 검사.
4. 개발·수용검증 문서 2개 추가.

### 유지 기능

- JSON 데이터 다운로드, JSON 파일 업로드, 백업 형식 검사, 7MB 용량 제한
- 복원 범위 선택, 미리보기, 없는 데이터만 추가, 동일 ID 덮어쓰기
- 같은 DB 트랜잭션의 변경 전 데이터 기록·감사 및 롤백
- Clerk 최고관리자 재인증과 단일 DB 논리 검사
- 전체 데이터 초기화 차단, 전체 DB 복원 증빙 미발급
- 기존 Migration 001~041, 현재 Heroku 설정, Production 소스

## 3. 로컬 검증 결과

- `node tools/frontend/smoke-phase34-json-file-picker-ux.mjs`: PASS (실제 핸들러 실행 포함)
- `tools/frontend/smoke-phase34*.mjs` + `tools/backend/smoke-phase34*.mjs`: 총 53개 PASS, 실패 0
- `npm run audit:react-hooks`: PASS (219 source files)
- `npm run audit:app-flows`: PASS (139 contracts, user routes 13, admin tabs 21)
- `npm run audit:external-runtime:strict`: PASS (278 files, 외부 퇴역 런타임 참조 0)
- 변경 컨트롤러 및 테스트 Node 구문 검사: PASS
- package guard, 개별 파일 SHA-256 및 ZIP CRC: 최종 패키징 시 확인

**검증 제한:** 이 환경은 npm registry DNS 연결이 불가해 `npm ci`가 완료되지 않았으므로 Vite 빌드와 브라우저 E2E는 로컬에서 직접 실행하지 못함. `deploy.ps1 v13.5`의 Vite 빌드 및 실제 Staging UI 검증이 필요. 현재의 스모크 검증을 실환경 PASS로 오기하지 않음.

## 4. Staging 배포·최종 검증 게이트

1. 유일한 기준선이 되는 본 Full ZIP을 `deploy.ps1 v13.5`로 적용하고, 스테이징 소스 브랜치 `gh-pages-3`에만 배포. Firebase=0, Production `gh-pages` 발행=N.
2. 본 변경은 프런트엔드 한정이므로 **Heroku backend 재배포 및 Migration 실행 불필요**. 기존 서버 버전/DB/설정 유지.
3. Staging 로그인 후 백업 JSON 선택 화면에서 최초 '선택된 파일 없음', 정상 선택 시 파일명이 같은 줄에 표시되고 아래 별도 파일명 행이 없는지 확인.
4. 동일 파일 재선택·다른 JSON 교체·유효하지 않은 JSON 선택·복원 미리보기 재조회 확인.
5. 기존 시험 데이터 추가/덮어쓰기 사용자 수용 PASS를 보존. 재실행 시 이미 삭제한 시험 데이터 외 기존 사용자 레코드 변경 금지.
6. 최신 패키지에서 로그인·Device Trust·대여·자산·게시판/문의·사이트 설정·데이터 관리 포함 주요 8개 기능 회귀검증 PASS 후 Production 승격을 별도로 결정.

## 5. 확인된 이전 수용 결과와 남은 과업

사용자는 2026-10-20 Staging에서 JSON 추가 1건, 동일 ID 덮어쓰기 1건, 시험 카테고리 삭제를 확인했으며, 감사 쿼리에서 최신 작업 2건의 `affected_rows=1`/`has_preimage=t`를 확인함. 이는 **기존 기준선의 실사용 검증 결과**이며 이번 UI 핫픽스를 실제 Staging에 적용한 후의 E2E 결과는 아님. 과거 감사 기록 2건의 `has_preimage=f`는 소급 변경하지 않음.

전체 DB 독립 복원 시험은 시행하지 않았으며, 이 때문에 전체 초기화는 계속 차단됨. JSON 백업은 PostgreSQL 전체 장애 복구 증빙을 대체하지 않음.
