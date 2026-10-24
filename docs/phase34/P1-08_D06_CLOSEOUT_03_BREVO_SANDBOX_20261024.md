# Phase 34 P1-08 D06 — 개별 종료·수용 체크리스트

**기준일: 2026-10-24 / 기준 소스: G4 loopback CIDR hotfix → G5 readonly acceptance**

공통 원칙: Brevo Free 선택 유지, Resend 기능 삭제 금지, 자동 공급자 전환/이중 발송 금지, 기존 Heroku web dyno·essential-0 단일 PostgreSQL 자원 사용, 신규 DB·Worker·저장소·요금제 증액 금지. 이번 산출물에는 실발송 허가가 없다.

수용 진행은 `오프라인 개발 → 소스 검증 → 해당 환경 실검증 → 증빙 확인 → 단계 종료`로 구분한다. 합성 테스트는 현장 수용을 대신하지 않는다.

## 03. Brevo 실제 Sandbox HTTP 1회 수용 (P1)

- [ ] G4 로컬 PostgreSQL 26개 PASS 및 scratch 0개 증빙 보존.
- [ ] Staging 8영역·Outbox ID 5·백업 수용 완료.
- [ ] G5 실 Clerk 재인증 수용 완료.
- [ ] Brevo `mail.notebook.recruit.kro.kr` 인증과 발신자 검증을 콘솔에서 확인. 트래킹 브랜딩은 필수 아님.
- [ ] 별도 명시적 승인된 **Sandbox 요청 1회만** 실행. API 키는 서버 환경변수에만 보관·출력 금지.
- [ ] `X-Sib-Sandbox: drop` 헤더와 공급자 응답 HTTP 상태·무송신 결과를 원문 주소 없이 확인.
- [ ] Brevo Free 발송량·속도·알림 한도 확인; 리트라이/자동 전환/실메일 전송/Outbox 청구 없음 확인.
- [ ] 서버 감사기록·요청 중복 방지·오류 격리·복원 절차 PASS.

**종료 조건:** 별도 승인된 실제 Sandbox 1회 + HTTP 수용 + 실메일 0 + Resend 원본 보존. 이 단계 승인으로 실메일을 허가하지 않는다.
