# Phase 34 P1-08 — G5 높은 권한 인증 경계 강화 및 G4 현장 검증 절차

작성일: 2026-10-24. 이 문서는 G5-PREP를 계승하며 기존 Staging `v299`를 변경하지 않는다.

## 1. 보안 수정

기존 공통 Clerk JWT 검증은 RS256 서명을 확인하지만 `azp`가 **없으면** 발급 출처 검사를 생략한다. G5의 최고관리자 메일 승인 전용 권한 검증은 더 엄격하게 적용한다.

- **서명된 `azp` 필수**: 서버 `clerkAuthorizedParties`에 명시적으로 등록된 HTTPS origin이 없으면 거부한다.
- 세션 `sts=active` 필수. `pending` 및 상태 미제공/예상하지 못한 상태를 거부한다.
- `clerkRejectPendingSession=true`, 클록 스큐 0~30초, 적어도 하나의 허용된 HTTPS 원점을 요구한다. 기존 설정에 개발용 HTTP localhost가 함께 있더라도 G5 최고관리자 메일 승인에서는 서명된 HTTPS 원점만 허용한다.
- PostgreSQL 관리자 권한 조회 이후에도 JWT 만료 시각을 다시 확인한다. 권한 조회가 느려지면서 토큰이 만료되는 경합을 차단한다.
- 기존 최고관리자 `owner`, `active`, `linked`, 잠금 없음, 5분 이내 재인증 및 서명된 재인증 식별자 조건을 유지한다.

**호환성 주의**: G5 실제 현장 연동 전 Clerk의 실 JWT가 `azp`/`sts`/`fva`/`reverification_id`를 실제로 제공하는지 확인해야 한다. 이 필드의 실발급이 입증되지 않으면 G5는 FAIL-CLOSED이며 클라이언트 JSON이나 unsigned claims로 보충해서는 안 된다. 현재 G5는 운영 라우트에 연결되지 않았다.

## 2. 실제 G4 기존 Windows 로컬 복원 DB 시험

시험은 사용자가 보유한 **기존 localhost PostgreSQL 복원본 DB만** 대상으로 한다. Staging/Production/DATABASE_URL 또는 신규 DB는 절대 사용하지 않는다. scratch 시험 스키마는 생성하고 정리한다. 이 실행 자체가 데이터 쓰기를 수반하므로 사용자 실행·승인 이력을 보존한다.

1. 개발 소스 ZIP의 SHA-256을 확인하고 로컬 작업본에 안전한 기존 패키지 설치 절차로 적용한다. `deploy.ps1`로 Staging/Production을 배포하지 않는다.
2. 서버 `pg` 모듈이 없는 경우 기존 프로젝트 서버 의존성을 설치한다 (`cd server`, `npm ci`, `cd ..`). 별도 요금/서비스 생성 금지.
3. PowerShell에서 환경변수 `G4_LOCAL_RESTORE_DATABASE_URL`에 이미 존재하는 로컬 복원 DB URL을 넣는다. DB 비밀번호·환경변수 원문은 채팅·Git·로그에 첨부하지 않는다. 예를 들어 호스트는 `127.0.0.1`, DB명은 `rental_restore_YYYYMMDD_HHMMSS` 등 기존 복원본 형식만 허용된다.
4. 기본 계획 모드: `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\ops\Invoke-Phase34-G4-LocalAcceptance.ps1` — 연결·쓰기 없음.
5. 실제 시험 실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\ops\Invoke-Phase34-G4-LocalAcceptance.ps1 -ExecuteLocal` — 화면에 나오는 동의 문구를 **직접 정확히 입력한 경우에만** 임시 시험 스키마 생성·동시성·감사·제약 검증·스키마 제거를 실행한다.
6. 결과 로그는 `tmp/g4-local-acceptance-logs`에 기록한다. 로그에 개인정보/비밀번호가 없는지 확인한 후 결과(전체 PASS/FAIL, 정리 여부, 스키마 잔존 여부)를 제출한다. 실패 시 재실행 전에 해당 로컬 복원 DB 내 시험 스키마 잔존 여부를 확인한다.

**실행 환경 한계**: 이번 검증 환경에는 `postgres`/`psql` 실행 파일 및 복원 DB가 없다. 따라서 G4 실 PostgreSQL 결과와 G5 실 Clerk 인증 결과는 확보하지 못했다.

## 3. 이후 수용 게이트

- G4: 실제 로컬 PostgreSQL 제약·트리거·원자성·동시성·cleanup 증빙 PASS.
- 기존 승인 Staging의 실제 8영역 업무 회귀, Outbox ID 5 읽기 전용 검토, 백업/복원 증빙.
- G5: 실제 운영 Clerk 토큰의 signed claims 관찰, 서버 검증 및 현재 관리자 DB 계정의 권한·잠금·재인증 검증. **원문 토큰은 수집/공유하지 않는다**.
- Brevo API Sandbox HTTP 1회: 별도 네트워크 승인 필요. Resend 어댑터는 삭제하지 않는다.
- 실메일·Production: 각각 별도 명시적 승인 필요. 현재 하드잠금 유지.
