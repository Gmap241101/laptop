# Phase 34 P0 — 백업·데이터 안전검사 이메일 인증 UX 핫픽스 개발·검증 보고서

- 작성일: 2026-10-20
- 기준선: `rental-system-phase34-p0-json-file-picker-ux-hotfix-20261020_deployment_package.zip`
- 대상: Staging `mkrental.vercel.app` 관리자 > 시스템 > 데이터 관리 > 백업·데이터 안전검사
- 작업 범위: **프런트엔드 인증코드 입력 UX 및 안내 문구만 수정**. 서버, 인증 정책, JSON 복원·백업 엔진, DB, API 및 전체 초기화 제한은 불변.
- Production 직접 배포: **금지** (사용자 수용검증 후 별도 승인)

## 사용자 요청 4개 모두 반영

1. 이메일 확인 코드 입력을 6개 독립 입력칸으로 표시. 각 칸 입력 시 다음 칸 자동 포커스, Backspace·좌우 화살표 이동, 모바일 숫자 키패드, `one-time-code`, 복사한 6자리 일괄 붙여넣기 지원. '확인 후 검증 시작' 버튼을 입력칸과 **동일 행**에 두고, 좁은 화면에서만 줄바꿈.
2. 버튼명 `이메일로 본인 확인` → `이메일 인증`.
3. `상태 새로고침` 버튼을 `이메일 인증` 바로 옆에 배치. 작업 진행 시 기존 `검증 중단` 버튼은 보존.
4. 별도 주황색 문구를 제거하고, SectionCard 상단의 회색 설명문을 다음과 같이 정확하게 교체:
   > 현재 데이터의 논리적 정합성만 검사합니다. 전체 DB 복원 검사는 지원하지 않으며, 전체 데이터 초기화는 계속 제한됩니다.

## 보존 사항

- 클라이언트 Clerk 이메일 재인증은 기존 `beginBackupReverification` / `completeBackupReverification` 호출 재사용.
- `backupReverifyConfirmed` 상태와 사용한 일회용 코드 재검증 방지 로직 유지.
- 정확히 6자리 숫자가 입력된 경우에만 검증 버튼 활성화. Enter 키도 6자리 완성 상태에서만 실행.
- 인증·논리 검사 결과를 전체 DB 복원 성공으로 표현하지 않음.
- 변경 전 복원 기록·감사 로그·JSON 선택 복원·SQL 42P02 수정·전체 초기화 차단 유지.
- 별도 DB, S3, Worker, Migration, 환경변수 추가 없음.

## 수정 파일

- `src/admin/AdminSettingsPanel.jsx` — 화면 레이아웃, 버튼명·배치 및 안내문 수정
- `tools/frontend/smoke-phase34-web-backup-verification.mjs` — 상단 안내문 변경 회귀검사

## 신규 파일

- `src/components/SixDigitVerificationCodeInput.jsx` — 로그인과 동일한 6칸 UI, 키보드·붙여넣기 상호작용
- `src/components/verificationCodeInputModel.js` — 숫자 정규화 및 6자리 검증 헬퍼
- `tools/frontend/smoke-phase34-backup-otp-ux.mjs` — 새 UX 및 로직 테스트
- `docs/phase34-p0-backup-otp-ui-hotfix-20261020.md` — 이 보고서
- `docs/phase34-p0-backup-otp-ui-staging-runbook-20261020.md` — Staging 배포 및 수용 절차

## 검증 결과

- 신규 6칸 인증코드 모델·UI 테스트: PASS
- 기존 재인증 토큰 클레임·한 번만 사용하는 코드 처리 테스트: PASS
- JSON 파일 선택 UX 회귀 테스트: PASS
- 기존 Phase 34 프런트엔드 스모크: 30/30 PASS
- 기존 Phase 34 백엔드 스모크: 24/24 PASS
- React Hooks 정적 감사, 앱 흐름 계약 감사, 외부 런타임 정적 감사: PASS
- TypeScript TranspileModule 기반 변경 JSX 파싱: 오류 0
- Vite Production 빌드: **미검증**. 현재 검사 환경의 의존성 `node_modules/vite` 실제 파일 부재로 수행 불가; `deploy.ps1 v13.5`의 빌드 성공 여부는 Staging 배포 시 확인 필수.
- 실제 Clerk 이메일 코드 수신/입력 브라우저 E2E: **미검증**. 사용자 Staging 수용 필요.
- Migration 변경: 없음.

## 수용기준

- [ ] 회색 안내문이 지정한 문장과 정확히 일치하고 주황색 중복 안내가 없다.
- [ ] `이메일 인증`과 `상태 새로고침` 버튼이 한 행에서 서로 인접한다.
- [ ] 이메일 인증 클릭 후 6칸 코드 입력과 `확인 후 검증 시작`이 넓은 화면에서 한 행에 표시된다.
- [ ] 6자리 코드 붙여넣기 한 번에 모두 채워지고, 5자리에서는 실행 버튼이 비활성화된다.
- [ ] 화살표·Backspace·자동 포커스·Enter 및 재인증 재시도가 정상이다.
- [ ] 데이터 논리 검사는 성공할 수 있으나 DB 전체 복원 증빙/전체 초기화 허용은 발생하지 않는다.
- [ ] 기존 JSON 파일 선택/추가/덮어쓰기 및 8개 주요 영역 회귀에 이상이 없다.

## 배포

Full ZIP만 제공하며 `deploy.ps1 v13.5`에 맞춰 패키지 파일별 SHA-256을 포함한다. `gh-pages-3` Staging 배포, Firebase 배포 `0`, Production 발행 `N`. 변경이 프런트엔드에 한정되므로 Heroku 재배포·Migration·환경변수 변경은 하지 않는다.
