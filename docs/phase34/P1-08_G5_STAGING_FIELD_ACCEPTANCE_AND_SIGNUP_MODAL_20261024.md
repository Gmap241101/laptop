# Phase 34 P1-08 — Staging 수용 종료·G5 현장 수용 및 신원 중복 모달

작성: 2026-10-24

## 종료된 Staging 수용 게이트
사용자가 제출한 실제 현장검증: 회원가입 UX 10/10 PASS(신원 중복 토스트·인라인 안내, 가입 정보 저장, 완료화면 깜빡임 없음, account-status 유지, 관리자 승인 전/후 로그인, 관리자 로그인 및 Outbox 안전). 이전 8개 업무 PASS, Heroku v299 / Migration 049 / 완료 백업 / ID5 미발송 증빙과 함께 **Staging 9/13 완료**. 과거 증빙은 사용자 제출을 근거로 하며, 운영 환경을 이번 패키지 작성 과정에서 직접 확인하지 않음.

## 추가 변경: 409 중복 신원정보 안내 모달
- 기존 이메일 입력칸 아래 `signupSubmissionError` 인라인 오류 블록 제거. 같은 메시지의 중복 toast도 제거.
- 실제 에러문구: **동일한 부서와 이름으로 등록된 회원이 있습니다. 기존 계정 여부를 확인하거나 관리자에게 문의해 주세요.**
- `role=alertdialog`, aria-labelledby/describedby, 우선 포커스, Esc/Tab 처리. 버튼 **기존 계정으로 로그인**과 **가입 정보 수정**. 수정 선택 시 현재 폼에 머무르고 입력한 이름/부서 등 작성정보 유지. 동일 오류 재시도 시 재표시. 승인된 중복차단은 우회하지 않음.
- 기존 이메일 인증 및 성공 안내 `/account-status` 라우팅 변경 없음.

## G5 개발 범위
- 이전 소스의 실제 서버 읽기 전용 `GET /api/admin/mail-delivery/g5-owner-check` 보존. 환경이 Staging이고 `P108_G5_OWNER_READONLY_ENABLED=true`일 때만 존재. 기본 404, GET 이외 405, 부적격 403, 성공 200.
- 브라우저 기존 최고관리자 > 이메일 알림 화면에 **최고관리자 본인 확인** 버튼. Clerk 이메일 6자리 본인 확인 후 `getToken({skipCache:true})`의 재인증 클레임을 받은 다음 서버의 기존 G5 API를 **GET**으로 호출. JWT·개인식별정보는 UI/로그/스토리지에 출력하지 않음.
- 서버는 RS256 JWT, `azp`, 세션 활성/만료, 최근 5분 재인증, PostgreSQL owner/active/linked/잠금/강등 상태 확인. `emailSent/vendorCalls/DB mutation` 0이라는 고정 결과 확인. Brevo·Resend 전송 코드는 불변.
- 인증 코드 발송은 기존 **Clerk의 본인 인증 메일** 사용. 이는 애플리케이션 Brevo 메일 실발송과 다르며, 신규 앱 메일 발송 허가를 부여하지 않음.

## 실행 순서 — 사용자 Windows Staging
1. **새 전체 소스 ZIP 파일 SHA-256 검증** 후 별도 검사 폴더에 해제. Windows 권장 Node 22 / npm 10.
2. `npm run package:guard`, `npm run frontend:phase34:signup-modal-g5:smoke`, `npm run frontend:phase34:signup-ux:smoke`, `npm run server:phase34:g5-owner-readonly:smoke`, `npm ci`, `npm run build:staging` 실행. 모든 정상 종료 필요.
3. 기존 `deploy.ps1`에서 **ZIP 경로 직접 입력(2)**, Firebase 생략(0), Production 발행 `n`, GitHub `gh-pages-3`만 푸시. 실제 Vercel Ready/커밋 확인. 백엔드 Heroku push는 별도 아래 절차.
4. 기존 Heroku Staging의 **정확한 설정값 존재와 strict 조건만** 확인(비밀키 값은 출력·공유 금지): `heroku config:get APP_ENV -a notebook-rental-api-staging-01`, `heroku config:get CLERK_AUTHORIZED_PARTIES -a notebook-rental-api-staging-01`, `heroku config:get CLERK_REJECT_PENDING_SESSION -a notebook-rental-api-staging-01`, `heroku config:get CLERK_CLOCK_SKEW_SECONDS -a notebook-rental-api-staging-01`. `APP_ENV=staging`, 허용 출처에 `https://mkrental.vercel.app`, pending 거부(기본값 true), clock skew 0~30(기본값 5). **CLERK_JWT_KEY·CLERK_SECRET_KEY·DATABASE_URL 원문 출력 금지.**
5. Heroku 배포 전 완료 백업 증빙 확인: `heroku pg:backups -a notebook-rental-api-staging-01`. 최신 GitHub 소스의 Backend 변경범위를 검토한 후, 사용자 승인된 기존 Staging 배포 절차에서만 `git push heroku-staging gh-pages-3:main` 실행. **`heroku` Production remote 사용 금지.** Staging 배포 전후 현재 migration 049 확인. 이번 소스에는 신규 migration 없음.
6. 서버 신규 API가 배포됐으나 **플래그 OFF**이면 무인증 `GET` 404 확인. 그 후에만 `heroku config:set P108_G5_OWNER_READONLY_ENABLED=true -a notebook-rental-api-staging-01`(dyno 재시작 발생; 신규 자원 없음). 배포 후 `heroku releases` 확인.
7. **플래그 ON + 무인증** GET 403, POST 405 확인. 실제 최고관리자 `/admin` 로그인 후 **이메일 알림 > 최고관리자 본인 확인 > 인증코드 받기 > 6자리 인증 확인**. UI `최고관리자 본인 확인이 완료되었습니다.` 이면 서버 실제 JWT + DB 권한 결속 긍정 시험 성공. DevTools의 해당 GET Status 200, `g5OwnerCheck.result=PASS`, `readOnly=true`, `emailsSent/vendorCalls=0`, `canSend=false` 확인. JWT/쿠키/전체 HAR 공유 금지.
8. **부정 시험**: 새 재인증 없이 같은 GET → 403; 로그인 일반관리자·일반회원·무인증 → 403; POST → 405; 모조/만료 JWT 거부(자동보안검증 증빙 사용, 실제 타 사용자 토큰 수집 금지); 토큰 클레임 누락은 403으로 fail closed. 누락·권한강등 등 Staging 운영계정 변경은 하지 않음.
9. 테스트 후 `heroku config:unset P108_G5_OWNER_READONLY_ENABLED -a notebook-rental-api-staging-01`로 **OFF 복귀** 및 404 확인. 앱의 통상 기능 정상, Outbox ID5 queued/0 attempts, migration 049, 완료 백업 상태 유지 확인.
10. 실제 Staging 긍정+부정 시험 및 롤백·기능 OFF 증빙이 확인돼야 G5를 10/13(76.9%)으로 수용. 그렇지 않으면 9/13(69.2%) 유지.

## 중단 기준
- G5 활성화 시 서버 구성이 잘못되어 기동 실패/500이면 즉시 OFF로 복귀하고 로그를 **비밀 값 제거 후** 조사.
- 관리자 권한 확인 403이면 Clerk 서명된 `azp`, `fva`, `reverification_id`, PostgreSQL 권한 조건을 확인하되 검증 완화/프런트엔드 추측값 대체 금지.
- 서버 무인증 호출이 200이면 즉시 플래그 OFF, 보안 사고로 수용 차단.
- 어떠한 경우에도 새 DB·Worker·저장소, Brevo/Resend 실전송, Production 변경 없음.
