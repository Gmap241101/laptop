# Phase 34 P1-08 D06-D1 | Brevo sandbox contract, OFFLINE only

## Scope / baseline
- Source baseline: Git `a73195e3f72d2b3c209a65445a7f74869f77f5db`; Heroku Staging `v299`; PostgreSQL Migration `049`; backup `b015`.
- D06-A/B: admin functional 6/6 PASS, preflight audit row 1 `reviewed_locked`, health/DB OK; eight-domain v299 regression has **not** been separately reported.
- D06-C: user selected **Brevo Free**, authenticated `mail.notebook.recruit.kro.kr`, verified sender `noreply@mail.notebook.recruit.kro.kr`, DKIM and DMARC GREEN. The user confirmed the transactional service is active. The dashboard's SMTP settings do not imply API credentials are configured.
- This D06-D1 step is **source-only offline sandbox contract** development. No account activity, API key generation or configuration, DNS edits, Heroku deploy, SMTP transactions, vendor HTTP requests, real email, database migration or Production promotion.

## Implementation
- `server/src/mail/mail-p108-d06d1-brevo-sandbox.mjs`: Brevo-only sender/domain policy; rejects Production, sender mismatch, unlisted recipient, malformed/free-plan-limits; builds a synthetic request for `POST https://api.brevo.com/v3/smtp/email` with `X-Sib-Sandbox: drop` in **request body `headers`**. No vendor token is passed to the mock. All real delivery flags remain false. There is no HTTP transport, queue claim, browser UI, service route or dyno registration.
- `tools/backend/smoke-phase34-p1-08-d06d1-sandbox.mjs`: deterministic mock success/failure tests, sender/recipient policies, 429/permanent rejection/uncertain outcomes, malformed responses, credential absence and lock preservation.
- `package.json`: standalone `npm run server:phase34:p1-08-d06d1:smoke` and include it in `verify:phase34`.
- All 19 application mail event schemas, existing Outbox contents (including ID 5 `queued`), Clerk mail delivery and mailbox behavior remain untouched.
- No migration 050; no paid resources; existing single Heroku PostgreSQL + one web dyno.

## Official Brevo contract
- Endpoint: `POST /v3/smtp/email`.
- Brevo sandbox: the JSON message contains `headers: {"X-Sib-Sandbox":"drop"}`. A 201 response with a messageId is not a delivered email: sandbox discards messages and does not create delivery logs.
- Authentication for a **separately approved vendor-side sandbox exercise** will eventually require an API v3 key in `api-key` HTTP header. No credentials are present or used in this deliverable.
- References: https://developers.brevo.com/docs/using-sandbox-mode and https://developers.brevo.com/reference/send-transac-email

## Known risk / why live delivery remains blocked
- An actual provider `201` means accepted for processing, not user-inbox delivery. Sandbox `201` means simulated acceptance only.
- Timeout/5xx/unknown provider response is uncertain; never auto-resend a real message.
- Staging must use owner-defined recipients only. Legacy Outbox ID 5 must never be included in test sends.
- Existing `P103_REAL_DELIVERY_LOCKED`, `P108_REAL_DELIVERY_LOCKED`, `P108_D06_LIVE_DELIVERY_LOCKED`, `P108_D06D_REAL_DELIVERY_LOCKED` remain true; `loadP101MailConfig().liveSendingReady` remains false.

## Test and acceptance boundaries
1. `npm run server:phase34:p1-08-d06d1:smoke`: PASS.
2. `npm run verify:phase34`: PASS (full suite including D06-D1 after manifest update).
3. `npm run package:guard`: PASS after manifest regeneration.
4. The new module is NOT imported by Heroku index or app; neither the queue dispatcher nor the web app can invoke its sandbox functionality.
5. **Status:** D06-D1 offline contract accepted for local tests only, not a real Brevo integration test, not D06-D closure. No Staging deployment required because runtime was not modified.

## Next D06-D2 gate (approval required)
- Obtain owner authorization for a vendor-side **sandbox** API call that creates **no emails**.
- Owner creates Brevo API v3 key; store in Heroku config only when explicitly approved; never paste in ChatGPT or place in ZIP/Git/browser.
- Keep credentials absent from client/UI/logs and keep email delivery locked.
- Independently verify Brevo account status, sender/domain, API permissions and rate limits using provider response; a mutable `MAIL_DOMAIN_VERIFIED` flag is not evidence alone.
- Only after D06-D2 sandbox is verified: separately approve a limited 1-recipient real delivery, outbox cleanup, audit, quotas, owner reauth and Production staging acceptance.
- Clerk email webhook/Brevo unification is a separate feature with its own security and outage analysis; unchanged in this phase.
