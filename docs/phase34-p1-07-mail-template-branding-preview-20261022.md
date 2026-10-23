# Phase 34 P1-07 — 19종 이메일 공통 디자인·발신 표시명·안전한 미리보기

- 작성: 2026-10-22
- 코드 기준: 사용자가 Staging에서 최종 수용한 P1-06.1 `d216ed3cd829dc3e6e55ba5ade20a2b105147055`, Heroku `v289`, Migration 047, 사전 백업 `b008`.
- **본 문서는 P1-07 개발·로컬 자동검증 결과**. 현재까지 P1-07 배포와 Heroku Migration 048 적용/브라우저 수용은 실행하지 않음.
- 제약: 기존 Staging 앱 `notebook-rental-api-staging-01` / 기존 PostgreSQL **단일 DB** / 기존 web dyno에서만. 추가 유료 자원, DB, Worker, 외부 스토리지, DNS, Production, Firebase 배포 금지. 실제 메일 발송은 기술적으로 잠금 유지.

## 범위
1. 관리자 **이메일 알림 관리** 상단에 공통 디자인 설정: `발신자 표시명(senderName)`, `메일 상단 제목(brandTitle)`, `메일 하단 안내 문구(footerText)`. 사이트 MK Orange `#FF6B00` 고정, 이미지·외부 폰트·동영상·추적 픽셀 없음.
2. 19종 개별 알림의 기존 제목/본문/RichTextEditor/변수/ON·OFF를 그대로 유지. **미리보기**는 미저장 초안도 시험용 가상 데이터로 표시하며 제목/발신자 표시명/반응형 HTML을 보임. `iframe sandbox=""`로 렌더링, 미리보기 서버 API는 DB 변경·Outbox 등록·실메일 발송 없음.
3. 공통 디자인은 이미 사용 중인 `app_system_configuration`의 **기존** `mail-notification-settings` JSON payload `.design`에 저장. 기존 revision CAS + advisory transaction lock을 재사용하며 동시 저장은 409; 기존 유형별 ON/OFF와 제목/본문 설정은 변경하지 않음. 감사 이벤트 `_design` 추가.
4. 업무 트랜잭션이 Outbox를 enqueue할 때 원문 템플릿과 디자인을 **같은 PostgreSQL client 조회 결과**로 읽고, 동일 렌더러로 제목·본문 HTML·본문 텍스트를 생성해 스냅샷으로 저장. 기존 idempotency key, 원자성, 동시성, OFF 정책 유지.
5. Migration 048은 **기존** `app_mail_outbox`에 `sender_name TEXT` 스냅샷 컬럼만 추가. 기존 데이터는 기본값 `기기 대여 시스템`이며 데이터 삭제 없음. `createMailDeliveryRepository.claim()`이 senderName을 반환할 수 있으나 발송기는 여전히 mock-only. **실제 provider From 헤더 반영 여부는 P1-08에서 실메일 허용 후 별도 검증**. `MAIL_FROM_ADDRESS` 등 DNS/Clerk 설정을 UI로 변경하지 않음.

## API / 권한
- `GET /api/admin/mail-notifications`는 기존 형태 + `design`을 반환.
- `PATCH /api/admin/mail-design` (최고관리자만): 디자인 3필드+`expectedRevision`만 허용. 내용 길이 1~80/1~80/0~360, HTML, 변수식, CRLF 헤더 인젝션/제어문자 거부. 거래와 감사, 409 충돌 보호.
- `POST /api/admin/mail-preview` (최고관리자만): `{key,template,design}`. 기존 19종 중 하나만 처리하고 변수 whitelist 및 HTML sanitizer 재사용. 실제 이름·메일 주소·대여내역 조회/저장 없음. 최고관리자가 아니면 403.
- 모든 메일 UI 오류는 사용자 행동 안내 중심으로 표시; 실패 시 코드 포함. 프론트에서 이미지·동영상 삽입 금지 유지.

## 테스트 / 확인
- 신규 `npm run server:phase34:p1-07-templates:smoke`: 123개 로컬 검사 PASS. 19종 예시 렌더링/변수 이스케이프/unsafe HTML/디자인 검증/동시성·감사/미리보기 무상태/Outbox 스냅샷/권한 보호/실메일 차단.
- `npm run verify:phase34` 전체 PASS (개별 및 전체 결과는 별도 한글 보고서 참조).
- 타입스크립트 JSX 파서의 문법 검사 PASS. 이 실행환경은 프론트 의존성 `npm ci` 설치 단계가 네트워크 제한으로 완료되지 않아 **Vite 번들 빌드는 미실행**. 따라서 Staging 배포시 `deploy.ps1`의 Vite 빌드 통과 필수.
- PostgreSQL 실환경 Migration 048, 설정 저장 후 재조회, 대상 19종 미리보기, 기존 업무 8영역 회귀, 새 Outbox `sender_name`, 고장 차단은 **Staging에서 사용자 확인 필요**.

## 검증 및 배포 주의
1. 배포 전 수동 백업 생성 후 `Completed` 확인(`b008`은 과거 수용 기준선 백업).
2. ZIP SHA256 및 안전성 검사, `deploy.ps1`: ZIP 직접 입력/`Y`/Firebase `0`/`START`/Production `N`. Staging `gh-pages-3`만 발행.
3. `git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main`; Heroku Migration 048 적용 확인. Production remote는 절대 사용 금지.
4. 최고관리자 공통 디자인 저장/새로고침 값 유지/19종 임의 미리보기/미저장 초안 반영; 미리보기 전후 Outbox 건수 동일 확인.
5. 시험용 대여 신청을 사용해 이벤트 ON 시 `sender_name`, HTML 디자인 스냅샷을 확인하되, 실메일은 보내지 말고 테스트 `queued` 기록을 UI에서 취소. 타인의 실 데이터로 시험하지 말 것.
6. 발신자 이름 설정만으로 Brevo/Resend 발송이 시작되지 않는다. Clerk 6자리 인증 이메일 설정은 별개다.

## 후속 잔여
- P1-05 관리자 가입 승인 요청 실환경 검증.
- P1-06 반납 예정/연체 2종 정기 실행(기본 OFF) 승인 및 실환경 검증.
- P1-08 도메인/DKIM/DMARC·발신 From 헤더·실메일 허용·위험한 실패 재처리 보안·전체 회귀 검증; 별도 사용자의 명시적 승인 전 실메일과 Production 활성화 금지.
