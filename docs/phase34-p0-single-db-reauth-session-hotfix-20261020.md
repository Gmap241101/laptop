# Phase 34 P0 — Staging 단일 DB 백업 검증 재인증 회귀 핫픽스

## 1. 장애 및 원인 구분

사용자 실측(2026-10-20): 이메일 인증코드 인증 후 첫 `POST /api/admin/system-data/backup-verification`에서 `backup_verification_reauthentication_required`; 동일 이메일 코드를 다시 입력할 때 `api_response_error` 발생.

기준 Staging 소스 커밋: `9ca1201` (`rental-system-phase34-p0-single-db-zero-cost-20261020_deployment_package.zip`). Heroku 배포 v258/259, Migration 040·041 적용 보고됨.

코드 추적: 서버는 검증 작업 생성 전 `fva[0]`(5분 미만)과 서명된 Clerk 세션 JWT의 `reverification_id`를 검사하며, 누락/오래된 경우 HTTP 403. 프런트엔드는 첫 인증코드 성공 직후 백엔드 요청이 거절되더라도 인증코드를 다시 검증하는 상태로 남아 있었다. 이메일 인증 코드는 일회용이므로 재시도 과정에서 Clerk가 실패할 수 있다. 이는 코드상 재현 가능 흐름이며, 실제 403의 원인이 `fva`와 커스텀 클레임 중 어느 쪽인지는 토큰 민감정보 없이 별도 확인이 필요하다.

## 2. 수정

- 이메일 코드를 Clerk가 승인한 뒤에는 그 코드를 다시 사용하지 않는다. 백엔드 실패 후 `검증 시작 재시도`는 새 세션 토큰 획득+Job 시작만 다시 실행한다. 새 이메일 재인증은 명시적인 `다시 본인 확인` 버튼으로 분리했다.
- `getToken({skipCache:true})` 직후 JWT의 `fva[0]` 및 `reverification_id` 반영 여부를 클라이언트에서 최대 5회 제한 확인한다. 지연 반영은 짧게 재시도하고, 누락 시 `backup_verification_reverification_claim_missing`, 갱신 전이면 `backup_verification_reauthentication_not_reflected`로 안내한다. **이는 UI 진단 보조 수단이다. JWT의 진위·권한은 기존 Backend RS256 검증으로만 판정한다.**
- 서버는 토큰의 `reverification_id` 누락과 오래된 `fva`를 각각 별도 오류로 반환한다. 타 사용자 권한이나 JSON 복원 안전장치를 변경하지 않는다.
- 비밀번호·이메일 코드·JWT 원문은 로그 또는 사용자 오류 알림에 포함하지 않는다.
- 별도 DB·S3·Worker를 추가하지 않는다. Migration 001~041 수정/추가 없음. JSON 다운로드/복원, SQL 42P02 수정과 전체 초기화 차단 유지.

## 3. Clerk Development 사전조건 (사용자 실행)

Clerk **Staging에서 사용하는 Development 인스턴스** → `Sessions` → `Customize session token` → 기존 JSON 설정에 아래 항목을 추가한다. 다른 기존 클레임은 삭제하지 않는다.

```json
{
  "reverification_id": "{{session.reverification_id}}"
}
```

이것은 새로운 JWT 템플릿을 추가하는 것이 아니라 **기본 세션 토큰 사용자 정의 클레임**이다. 기존 항목이 있으면 그대로 유지하면서 키만 병합. 반드시 개발/Staging Clerk 인스턴스에서 먼저 시험하고 Production Clerk 설정은 변경하지 않는다.

Clerk 이메일 재인증 완료 직후 첫 요청이 여전히 거부된다면, 비밀 원문은 공유하지 말고 UI에 표시된 **오류 코드**, 해당 시각의 Staging 서버 로그 중 requestId/오류 코드만 확인한다. `backup_verification_reverification_claim_missing`는 Clerk 세션 토큰 커스텀 클레임 적용 여부, `backup_verification_reauthentication_not_reflected`는 재인증 이후 토큰 반영 시점을 점검한다.

## 4. 사용자 배포 절차

1. 새 Full ZIP 하나를 `E:\project\rental-system\test_new`에서 `deploy.ps1 v13.5`로 적용. Firebase `0`, `gh-pages` 운영 직접 발행 `N`.
2. Staging Heroku Backend 변경이 있으므로 `git fetch origin` 후 `git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main` 실행. 기존 040/041 유지, 신규 Migration 없음. `BACKUP_VERIFY_MODE=single-db` 유지.
3. Vercel Staging이 새 소스 커밋으로 배포됐는지 확인. Clerk Development 세션 토큰 커스텀 클레임 확인.
4. 최고관리자 로그인 → 시스템 > 데이터 관리 → 이메일로 본인 확인 → **새 이메일 코드 한 번만** 입력 → 검증 시작. 실패 시 같은 코드를 다시 입력하지 않는다. 메시지가 설정 오류를 안내하면 세션 클레임 확인.
5. 작업이 성공하면 `데이터 논리 검사 완료`로 표시되어야 한다. 전체 DB 백업/격리 복원 성공 또는 60분 일회용 증빙으로 표시돼서는 안 된다.
6. 기존 8개 Staging 업무 기능, JSON 미리보기/복원 및 전체 초기화 차단 검증. Production 승격은 별도 승인 후 수행.

## 5. 검증 구분

코드/모의 JWT 및 기존 자동검사 PASS는 실제 Clerk Development 세션 JWT가 갱신됨을 증명하지 않는다. 실제 이메일 코드 E2E·Staging PostgreSQL 작업 상태·Vercel 빌드는 사용자가 검증해야 한다.
