# Phase 34 P1-02 — PostgreSQL Mail Outbox 및 이메일 설정 UX (2026-10-22)

## Baseline
- User-accepted GitHub staging: `64e4db3a934c031423d0a2bc59ce0b5aa36a3ada`.
- ZIP: `rental-system-phase34-p1-01-brevo-mail-admin-20261022_deployment_package.zip` SHA-256 `8D48AFD065ADD68EE227DA96F6C99A96E92BDB84D4CDAA65324FB704FA02A560`.
- W01/02/03/05 and P1-01 accepted, Production untouched.

## Work delivered
1. P1-02 migration 044: `app_mail_outbox` (unique hashed idempotency, queued/processing/sent/retry/failed/cancelled status, lease metadata, timestamps, indexes) + `app_mail_delivery_quota` (P1-03 reservation schema). Same existing PostgreSQL database only.
2. `createMailOutboxRepository().enqueueInTransaction({client,...})` must be called within the caller-owned business DB transaction: read currently enabled setting, snapshot rendered template, insert with `ON CONFLICT(dedupe_key) DO NOTHING`; if disabled do not enqueue. No dispatcher/API/web worker/cron/live mail enabled.
3. Existing admin ON/OFF checkbox replaced with standardized MK Orange ARIA switch.
4. Same `RichTextEditor` as notices/FAQ/inquiry answers, but email profile disables image and video insertion. Server validates a restrictive subset of safe email HTML; active content, event handlers, unsafe URLs and unexpected attributes are rejected. No untrusted editor HTML is emailed. Previous text templates are upgraded upon editing and retained intact until saved.
5. Nineteen immutable events have event-specific variables. Common variables: name/siteUrl/teamName. Other keys include signupRequestedAt/signupReviewedAt/signupDecisionAt, rentalRequestedAt/rentalApprovedAt/rentalRejectedAt, rentalStartAt/rentalDueAt/rentalReturnedAt, assetName/assetCode/requestNumber, extensionRequestedAt/extensionDecisionAt, previousRentalDueAt/newRentalDueAt, inquirySubmittedAt/answerCreatedAt/inquiryTitle/inquiryNumber, rentalCancelledAt, withdrawnAt/restrictedAt/unrestrictedAt.
6. UI shows Korean labels and copyable `{{variableName}}` chips, accessible subject and editor fields, revision conflict handling. Template values are not yet populated by real business flows; P1-04/05 must supply them exactly and test real events.

## Boundaries / safety
- Existing `MAIL_ENABLED`/provider flags remain fail-closed (`liveSendingReady=false`), even after Migration 044. No Brevo/Resend API sends.
- Outbox is a repository foundation: not connected to signup, rental or inquiry status changes yet. End-to-end atomicity is **not** claimed; P1-04/05 event integration must create rows in the same business transaction, or fail release gate.
- SQL migration not tested against user Staging DB until Heroku release applies 044. Local static checks and mocks are not a successful real PostgreSQL migration or send test.
- No new DB, worker dyno, storage, scheduler, paid add-on, DNS changes, or Production release.
- Mail HTML deliberately does not support remote image/video embeds; hyperlink must be HTTPS. Administrative save errors must not expose sensitive content.
- Full email rendering, actual provider quotas and retry claim implementation belong to P1-03/P1-07; privacy retention belongs to P1-06.
