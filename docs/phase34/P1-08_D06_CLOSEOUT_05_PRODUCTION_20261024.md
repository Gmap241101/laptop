# Phase 34 P1-08 D06 — 개별 종료·수용 체크리스트

**기준일: 2026-10-24 / 기준 소스: G4 loopback CIDR hotfix → G5 readonly acceptance**

공통 원칙: Brevo Free 선택 유지, Resend 기능 삭제 금지, 자동 공급자 전환/이중 발송 금지, 기존 Heroku web dyno·essential-0 단일 PostgreSQL 자원 사용, 신규 DB·Worker·저장소·요금제 증액 금지. 이번 산출물에는 실발송 허가가 없다.

수용 진행은 `오프라인 개발 → 소스 검증 → 해당 환경 실검증 → 증빙 확인 → 단계 종료`로 구분한다. 합성 테스트는 현장 수용을 대신하지 않는다.

## 05. Production 최종 승격 (P2)

- [ ] 앞의 4개 관리단계 모두 최종 PASS 수용 증빙.
- [ ] 기존 Production 전체 백업 Completed와 **검증 가능한 복원 계획** 확보.
- [ ] 신규 유료 자원/DB/Worker/스토리지 추가 없음 확인.
- [ ] 승인된 Git 커밋·Staging과 Production 환경변수 diff (비밀값 표시 금지), DB migration 적용 순서 확정.
- [ ] 사용자·관리자 로그인·Device Trust·8영역 회귀·메일 권한/기본 차단 검증.
- [ ] DNS/SPF/DKIM/DMARC 및 기존 notebook.recruit.kro.kr 도메인 정책 확인.
- [ ] 최종 변경 승인/작업 시간/담당자/롤백 기준과 종료 조건 서명.
- [ ] Production 배포 이후 건강상태, DB, 성능, 수신, 무중복, 개인정보 유출 여부 확인.

**종료 조건:** 최종 승인과 Production 환경 실검증 PASS. 본 ZIP 배포만으로 자동 승격되지 않는다.
