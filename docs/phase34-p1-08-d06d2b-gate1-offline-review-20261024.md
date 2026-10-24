# Phase 34 P1-08 D06-D2B-G1: Staging evidence gate (offline)

Date: 2026-10-24 (Asia/Seoul)
Baseline: full D06-D2B-PREP ZIP; previously reported staging Git a73195e / Heroku v299 / migration 049 / backup b015 (not re-verified).

## Scope

This isolated ES module reviews **operator-supplied evidence** for eight Staging regression areas, privileged recent reauthentication, read-only Outbox ID 5 review, and a recently reviewed completed backup. It creates a **redacted local digest record** and reuses D06-D2A's synthetic, non-HTTP Brevo sandbox specification.

The module is NOT imported by server/app/dispatcher. It cannot obtain API keys, query DB, mutate Outbox, perform network requests, send mail, or authorize a real Brevo Sandbox operation. It must never be called an authentication or release gate. All operator assertions remain unverified. Source code and smoke tests use entirely synthetic examples.

## Provider preservation

- Brevo is selected for the synthetic sandbox flow.
- Resend remains available, with existing provider implementation, API key config name, domain-status lookup, idempotency semantics, Outbox mock and tests unchanged.
- No implicit fallback or dual delivery. Live provider switching needs separate human approval.

## Evidence shape (not a proof of actual verification)

`inspectD06D2BGate1({config, recipient, evidence, now})` expects:

- `config`: D06-D2A's already defined offline config with no credentials; staging only, brevo only, exact sender and allowlist, trial quota, liveSendingReady=false.
- `recipient`: synthetic allowlisted address; tests use reserved `example.test`.
- `now`: explicit ISO timestamp with three milliseconds digits and Z suffix, supplied by test/caller.
- `evidence.source`: exactly `operator_attestation`; `stagingBuild`: `v299`; `reviewerRole`: `super_admin`; `observedAt` within 24h and `reauthenticatedAt` within 5m of supplied `now`.
- `evidence.regression`: exactly 8 booleans, all `true`: `admin_auth`, `user_auth_device_trust`, `rental_lifecycle`, `asset_categories`, `community_inquiry`, `site_settings`, `json_backup_restore`, `otp_mail_controls`.
- `evidence.outbox`: `id:5`, `eventType:admin_signup_pending`, `status:queued|reviewed_locked`, `reviewedReadOnly:true`, `mutationPerformed:false`.
- `evidence.backup`: `status:Completed`, `reviewedReadOnly:true`, `verifiedAt` within 24h.

Real evidence is not gathered or validated from any remote system by this module. A malicious caller can fabricate values, so an `operatorAttestationComplete=true` only reports internal schema completeness; it never grants privileges, permits an API request or constitutes audit proof.

## Local smoke command

```powershell
npm run server:phase34:p1-08-d06d2b-gate1:smoke
npm run server:phase34:p1-08-d06d2b-preserve:smoke
npm run server:phase34:p1-08-d06d2a:smoke
npm run server:phase34:p1-08-d06d1:smoke
npm run verify:phase34
```

## Explicitly OUT OF SCOPE

Brevo API v3 key registration; real `POST /v3/smtp/email` even with `X-Sib-Sandbox: drop`; deliverability tests; Outbox row changes; any SQL migration; production or Staging deployment; new Heroku DB, web/worker dyno, add-on, persistent storage or paid service. These require separate staged, operator-approved controls and verification.
