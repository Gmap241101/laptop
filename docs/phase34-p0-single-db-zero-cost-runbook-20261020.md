# Phase 34 P0 — 기존 Essential-0 단일 DB·web dyno 무추가비용 전환

기준선: `rental-system-phase34-p0-web-backup-verification-20261020_deployment_package.zip`; 신규 수정분은 이를 확장한 Full ZIP이다.

## 1. 확정 비용/보안 정책

- 기존 Staging Heroku `notebook-rental-api-staging-01`, Essential-0 PostgreSQL, Basic web 1개만 사용한다. **새 DB, Worker dyno, S3/Azure, 추가 유료 애드온을 생성하지 않는다.**
- Heroku 기존 PGBackups 예약 작업은 운영 콘솔에서 그대로 관리한다. 기존 설정: Staging 매일 오전 03:00 Asia/Seoul. 최신 수동 백업 `b003`는 사용자가 생성·다운로드·검증해 `E:\project\rental-system\backups\staging-b003-20261020.dump`에 별도 보관한 상태(사용자 보고).
- 사이트의 `백업·데이터 안전검사`는 PostgreSQL **읽기 전용 논리 검사**이다. **`pg_dump`, `pg_restore`, 전체 DB 백업 생성, 독립 DB 복원 증빙 발급을 수행하지 않는다.** 통계는 검증 시작 시점의 일관된 읽기 스냅샷 기준이며 전체 DB 물리적 복구 가능성을 증명하지 않는다.
- 기존 JSON 백업 다운로드·파일 업로드·미리보기·없는 데이터 추가·동일 ID 덮어쓰기·SQL 42P02 바인드 수정·롤백·감사 로직 유지.
- JSON 선택 복원 실행 시, 지원 범위의 변경 전 행을 같은 PostgreSQL에 **원자적 복구 기록**으로 남긴다. 이 사본은 **DB 자체 장애 시 함께 소실될 수 있으므로 전체 DB 백업 대체가 아니다.** 변경 전 행 기록은 최대 4MiB, 대상 행 총합 최대 2,500개. 기록 생성 실패하면 전체 복원이 롤백된다.
- **데이터 전체 초기화는 독립 DB 복원 검증 없이는 차단 유지**. 단일 DB 논리 검증을 기존 60분/1회용 전체 DB 복구 증빙으로 발급하거나 둔갑시키지 않는다.
- 최고관리자 자격 및 최근 Clerk 재인증(fva, 재인증 식별자) 검사는 유지한다. Clerk 사용자 속성/토큰 커스터마이징은 Staging에서 실제 검증 후 적용한다.
- 신규 Migration **041**은 기존 DB에 복원 변경 전 행 기록용 테이블 1개를 추가한다. 이전 001~040 변경 없음.

## 2. Staging 배포 전 점검

1. 현재 정상 운영 Production을 유지한다. 해당 Full ZIP SHA-256 확인 후 `deploy.ps1 v13.5`로 `gh-pages-3`에 적용한다. Firebase 배포 `0`, Production 직접 발행 `N`.
2. Git 변경·파일 목록·신규 Migration 041 확인 후 Staging Heroku Backend 배포:

```powershell
cd E:\project\rental-system\test_new
git fetch origin
git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main
```

3. 마이그레이션 결과 확인:

```powershell
heroku pg:psql -a notebook-rental-api-staging-01 `
  --command "SELECT name FROM schema_migrations WHERE name LIKE '040_%' OR name LIKE '041_%' ORDER BY name;"
```

4. 최초 1회 명시적으로 `single-db` 모드 활성화. 기존 `BACKUP_VERIFY_TARGET_DATABASE_URL`, `BACKUP_S3_*`, `BACKUP_ENCRYPTION_KEY_HEX`를 **새로 만들거나 요구하지 않는다**.

```powershell
heroku config:set BACKUP_VERIFY_MODE=single-db -a notebook-rental-api-staging-01
```

이 설정은 Heroku 기존 앱을 다시 시작시키므로 Staging에서만 먼저 적용한다. `DATABASE_URL`을 변경하면 안 된다. 신규 `worker` 프로세스를 활성화하지 않는다.

5. Clerk Development 앱의 세션 JWT에 재인증 고유 식별자 `reverification_id`가 정상 포함되는지, `fva[0]`가 재인증 직후 새로 갱신되는지 확인한다. 실제 구현과 다르면 코드를 우회하지 말고 원인 분석 후 수정한다. **비밀 토큰/비밀번호 공유 금지.**
6. `https://mkrental.vercel.app` 프런트엔드가 해당 `gh-pages-3` 소스와 일치하는지 배포 SHA로 확인한다. `/health`는 200이어야 한다.

## 3. Staging 수용검증

- 최고관리자 `시스템 > 데이터 관리 > 백업·데이터 안전검사`: 이메일 재인증, 시작, 대기/진행/완료/취소, 새로고침, 비관리자 403을 확인한다.
- 성공 문구는 **논리 검사 완료**여야 하며 **전체 백업·복원 성공/60분 복구 증빙이 없어야 한다.** DB 설정값/행수 스냅샷·스키마 마이그레이션·invalid index/constraint 검증이 모두 완료돼야 한다.
- JSON 복원은 Staging **시험용 데이터만** 사용한다. 파일 선택 → 범위/모드 → 미리보기 → 확인 문구 → 실행 → 실제 DB 반영 확인. 사이트/게시판/자산/명부의 기존 정상 데이터는 덮어쓰지 않는다.
- 시험용 동일 ID 1건 덮어쓰기는 동작 성공뿐 아니라 변경 전 행이 `app_system_data_restore_preimages`에 1개 이상 포함됐는지 확인한다. **복구 기록은 민감정보 포함 가능하므로 결과 원문 출력·채팅 공유 금지**.
- 트랜잭션 중 SQL 실패 주입, 오래된 미리보기, 스키마 차이, JSON redaction, 2,500행 초과, 복구 기록 용량 초과, 권한 오류, 연속 중복 요청을 검사한다. 실패 시 DB 원상 유지.
- 전체 초기화는 단일 DB 논리검사 성공 후에도 서버에서 거부되어야 한다. Staging에서도 초기화 버튼을 실제 시험할 때는 **별도 승인과 시험 데이터**가 필요하다.
- 기존 관리자/사용자 인증, Device Trust, 대여 신청·관리, 자산, 게시판·문의, 사이트 설정, 데이터 관리 보안 회귀 8개 PASS.
- 전체 PostgreSQL 재해복구 검증은 이 패키지에서 **미구현/미검증**으로 명시하고 별도 DB 없이 완료 판정하지 않는다.

## 4. 기존 자원 사용 및 장애대응

- 추가 유료 서비스 없음. `Procfile`에서 별도 `worker` 프로세스 선언 제거.
- 백업 파일은 사용자가 보관한 `E:\project\rental-system\backups` 폴더에 유지한다. 개인정보 포함 가능하므로 NTFS 접근 제한/암호화와 Git 저장소 제외 확인.
- 기존 PGBackups 자동 백업 성공 여부는 Heroku CLI에서 조회한다. 웹 논리검사 Job은 Heroku PGBackups를 캡처·조회하지 않는다.
- 기존 web dyno가 재시작하면 실행 중인 논리검사를 실패/중단 처리한다. 인프라 자원이 추가되지 않는 대신 CPU/DB 사용량을 모니터링한다.
- **Production 변경 금지**: Staging 실제 수용검증 후 사용자의 별도 승인으로만 승격한다. 운영 DB 백업 보유와 복구 정책은 계속 별도 관리한다.

## 5. 사용자가 `deploy.ps1` 외에 수행할 사항

Staging Heroku Backend push, Migration 041 확인, `BACKUP_VERIFY_MODE=single-db` 환경변수 설정, Clerk 재인증 실제 시험, Vercel Staging 프런트 배포 SHA 확인, 시험 데이터 JSON 복원 E2E, 핵심 8개 업무 회귀검증. 신규 유료 DB·스토리지·Worker 비용과 설정은 **없다**.
