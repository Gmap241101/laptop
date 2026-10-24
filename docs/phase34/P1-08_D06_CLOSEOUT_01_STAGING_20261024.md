# Phase 34 P1-08 D06 — 개별 종료·수용 체크리스트

**기준일: 2026-10-24 / 기준 소스: G4 loopback CIDR hotfix → G5 readonly acceptance**

공통 원칙: Brevo Free 선택 유지, Resend 기능 삭제 금지, 자동 공급자 전환/이중 발송 금지, 기존 Heroku web dyno·essential-0 단일 PostgreSQL 자원 사용, 신규 DB·Worker·저장소·요금제 증액 금지. 이번 산출물에는 실발송 허가가 없다.

수용 진행은 `오프라인 개발 → 소스 검증 → 해당 환경 실검증 → 증빙 확인 → 단계 종료`로 구분한다. 합성 테스트는 현장 수용을 대신하지 않는다.

## 01. Staging 8개 업무 영역·Outbox ID 5·백업 수용 (P0)

### 현장 종료 기준
- [ ] 실제 Staging URL/Heroku 앱/커밋·릴리스·Migration 049 상태 확인, 운영과 격리 확인.
- [ ] 관리자 로그인/최고관리자 최근 재인증 PASS (로그아웃 후 admin URL 유지 포함).
- [ ] 일반 사용자 로그인·Device Trust 정상 PASS.
- [ ] 대여 신청·승인/거절·반납 흐름 PASS (시험 데이터만).
- [ ] 자산·카테고리 관리 PASS.
- [ ] 공지·FAQ·1:1 문의 PASS.
- [ ] 사이트 설정·홈페이지 관리 PASS.
- [ ] JSON 백업/복원 미리보기·관리 권한 PASS (운영 복원 실행 금지).
- [ ] 6자리 이메일 인증·데이터 논리 검사 PASS; 이메일 실발송은 별도 승인 없이는 금지.
- [ ] `P1-08_D06_STAGING_READONLY_ACCEPTANCE_20261024.sql`로 Outbox ID 5 상태를 읽기 전용 조회: 존재/부재·상태·attempt/lease를 검토. 삭제·재시도·발송 금지.
- [ ] Heroku 백업 목록/Completed 최신 상태 및 필요한 복구 증빙을 확보. 목록 확인만으로 복원 가능성 확정하지 않는다.
- [ ] 결과 날짜·검증자·각 영역 PASS/FAIL·오류 스크린샷(개인정보 마스킹)·증빙 위치 기록.

### 읽기 전용 SQL 실행 순서
**기존 Staging** `notebook-rental-api-staging-01`에서만 실행한다. Heroku CLI 로그인 후 `heroku pg:psql -a notebook-rental-api-staging-01`을 실행하고 SQL 파일 내용 전체를 복사·붙여넣는다. `.sql`은 `BEGIN TRANSACTION READ ONLY`와 `COMMIT`으로 둘러싸였고 민감한 수신자 이메일·본문·토큰을 선택하지 않는다. 출력은 개인정보·환경변수를 제거 후 보관한다.

### 최종 판정
8영역 전부 PASS + Outbox ID 5 읽기 전용 검토 + 백업 근거 + Staging/Production 분리 확인 시에만 **이 단계 종료**. 미확인 항목을 PASS 처리하지 않는다.
