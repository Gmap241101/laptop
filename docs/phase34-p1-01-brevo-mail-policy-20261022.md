# Phase 34 P1-01 보강: Brevo 우선, 19종 발송 정책 및 관리자 템플릿 편집

## 기준선 / 원칙
- 기반: P1-01 Resend-only Full ZIP SHA-256 `30F0E864751962688F03B8BEB227FB9EFF716AAE8A0637AB7F8497E013357610`; GitHub Staging `bb8971d`.
- 이번 버전은 Brevo 우선 **발송 어댑터·읽기 전용 도메인 조회**, 19종 이벤트 목록, PostgreSQL 설정 CRUD, 최고관리자용 UI를 추가한다.
- P1-01에서는 실메일 발송은 불가능하다. `MAIL_ENABLED=true` 및 UI 개별 ON 여부와 무관하게 `liveSendingReady=false`. Outbox/영속 쿼터/복구는 P1-02·P1-03 후속 단계.
- 기존 PostgreSQL의 `app_system_configuration` 테이블에 `mail-notification-settings` 키로 저장한다. 신규 Migration 없음, 신규 DB/Worker/스토리지 없음.
- Clerk 인증용 6자리 코드 이메일은 업무 알림 관리의 대상이 아니며, 본 설정으로 비활성화할 수 없다.

## 총 19종
- 기존 11종: signup_submitted, signup_approved, signup_rejected, rental_submitted, rental_approved, rental_rejected, rental_returned, rental_overdue, membership_withdrawn, admin_signup_pending, admin_rental_pending
- 사용자 추가 8종: rental_due_reminder, extension_approved, extension_rejected, inquiry_first_answer, inquiry_followup_answer, account_restricted, account_unrestricted, rental_cancelled
- UI는 19개의 개별 ON/OFF, 제목, 본문, 변수 예시를 표시한다. 초기 개별 설정은 전체 OFF.
- 실제 이벤트 훅은 아직 연결하지 않았다. P1-04/P1-05에서 상태 전환 커밋과 Outbox 원자성·중복방지를 완료한 뒤 적용한다. 특히 탈퇴 완료 후 수신 주소 snapshot, 비회원 문의의 이메일 인증/동의, 연체 알림의 일일 중복방지와 반납 사전 알림의 취소 조건을 검증한다.

## 권한 및 안전성
- `GET /api/admin/mail-notifications`·`PATCH /api/admin/mail-notifications/:key` 모두 Clerk/PostgreSQL 인증 후 **owner** 권한 요구. 비권한자는 403.
- 저장은 PostgreSQL advisory xact lock + `FOR UPDATE` + `expectedRevision` optimistic CAS 기반. 동시 변경 409.
- 제목 150자/본문 6,000자 제한, 줄바꿈 헤더 인젝션 거부, 고정 변수만 허용.
- 템플릿 원문은 PostgreSQL에 저장, 향후 HTML 변환 시 escape 처리. 자유 HTML 실행 불가.
- 내부 `revision`, 최근 200건 변경 감사 기록 저장. 실제 메일 발송/SMTP 없음.
- 사용자 UI에는 구현 상태가 아닌 필요한 사용자 행동 및 결과만 표시한다.

## Brevo 공급자
- Brevo 공식 무료 플랜 일일 300통. CLI 제한 기본 daily=300; 9300 월 한도는 **무료 요금제 월 제공량이 아니라 내부 안전 상한**.
- 설정: `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_STAGING_ALLOWLIST`, `MAIL_DOMAIN_VERIFIED` 등. 이 단계에서 Heroku 환경변수에 API 키를 넣을 필요가 없다.
- Brevo 인증상태 GET `https://api.brevo.com/v3/senders/domains/{domainName}`는 `--check-domain`을 명시했을 때만 호출한다. 이름·verified·authenticated 세 조건을 확인한다.
- Provider `.send()`는 영속 Outbox/발송량 관리 구현 전 영구 차단; 429·5xx는 후속 P1-03 재시도 정책 대상이고, 타임아웃의 자동 재전송은 금지한다.
- Resend adapter는 교체 가능성을 위해 유지한다. 최종 사업자 결정을 승인 이전에 강제하지 않는다.

## Clerk과 동일 DNS 도메인
- `notebook.recruit.kro.kr` 발신 주소 공유는 **기술적으로 가능하나 DNS 소유권·개별 DKIM 셀렉터 충돌이 없는 것이 조건**이다.
- Brevo는 소유권 TXT, DKIM TXT 1개 또는 CNAME 2개, DMARC TXT를 요구할 수 있다. NS 변경은 불필요.
- 기존 Clerk SPF·DKIM·DMARC·MX·CNAME 보존. DMARC는 해당 호스트에 하나만 유지; Brevo의 자동 DMARC 교체 선택 사용 금지. DKIM 이름이 충돌하면 관리자 승인 전 변경 금지.
- TXT만 편집 가능하고 Brevo 계정이 DKIM CNAME 두 개를 요구한다면, CNAME 권한 확인 또는 TXT 타입 전환 지원 절차를 별도 협의한다.
- DNS 레코드 값/API 키를 ZIP/GitHub에 포함하지 않는다.

## 실환경 검증 범위
1. Full ZIP SHA 및 package-meta 검증, `npm run verify:phase34` PASS, Vite 빌드.
2. 신규 Backend가 포함되므로 동일 `gh-pages-3` 커밋을 Heroku **Staging에만** 배포, Health·DB 확인.
3. 최고관리자 `/admin` → 시스템 → 이메일 알림 관리: 총 19종, 개별 ON/OFF와 제목/본문 저장·새로고침 후 유지 확인.
4. 일반관리자 GET·PATCH 403 (실제 수정을 시도하지 않고 실패하도록 구성된 시험 사용).
5. 이메일 전송 0건, 기존 8영역 수동 회귀.
6. Production·유료 전환·DB 복원·Firebase 배포 금지.

## 남은 P1 범위
- P1-02: Outbox, 원자적 이벤트 기록, 예약시간, 영속 쿼터, 데이터 보존.
- P1-03: 기존 web dyno 발송 스케줄러·429·재시작·중복 방지·Brevo 응답 모호성 보수적 처리.
- P1-04/P1-05: 업무 이벤트 19종과 수신자 연결, 연체·사전 알림 중복 정책.
- P1-06: 발송 이력·재처리·실패 관리.
- P1-07: 템플릿 미리보기·관리자 편집 고도화, 시각적 에디터가 필요하면 여기에 반영. P1-01의 기본 제목/텍스트 편집은 이미 지원.
- P1-08: 실제 테스트 주소 수신, DKIM/DMARC/권한·보안 및 전체 운영 회귀. Production 별도 승인.
