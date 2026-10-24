# Phase 34 P1-08 D06-D2B-PREP | Brevo selected, Resend preserved

Date: 2026-10-24 (Asia/Seoul)
Baseline: D06-D2A full deployment package, SHA-256 `3a3974a576fc04063ba97dca7ea6480c2af43fd3e874c7c0850303f5dcd56d7d`.
Cloud baseline last recorded: Git `a73195e`, Heroku Staging `v299`, Migration `049`, backup `b015`. Not queried in this phase.

## User decision

**Brevo Free remains the selected email provider. Resend MUST NOT be removed, globally disabled, or stripped from future compatibility.** This is not a request to activate Resend, duplicate sends to two providers, or automatically fail over. Any provider switch is a new, explicit operator decision with separate sender/domain/API-key/limit verification.

## Implementation

- New isolated module `server/src/mail/mail-p108-d06d2b-provider-preservation.mjs` publishes immutable, purely offline vendor inventory: selected Brevo and retained Resend. It composes the existing Brevo D06-D2A *synthetic* sandbox plan without network access. Requesting Resend only returns a standby/approval-required result, never switches the active provider.
- New regression `tools/backend/smoke-phase34-p1-08-d06d2b-provider-preservation.mjs` explicitly imports both existing providers, tests Resend configuration, read-only domain lookup using a fake in-memory transport, retained P108 offline mocked Outbox pathway, idempotency-key behavior, both vendors' hard locks, and no actual sends. Tampered environment, unlisted recipient and unknown provider are denied.
- `package.json` adds smoke command `server:phase34:p1-08-d06d2b-preserve:smoke` at the end of `verify:phase34` without deleting older commands. No production runtime source, Brevo/Resend provider module, schema, UI, or previous lock is changed.
- Package manifest lists and hashes are regenerated for the full source ZIP.

## Vendor-specific cautions

Brevo uses `POST /v3/smtp/email` with body `headers: {"X-Sib-Sandbox":"drop"}` for sandbox requests. `201` is a sandbox API acceptance only and delivers no email. Resend's `Idempotency-Key` remains within the existing Resend-specific adapter; vendor-specific retry semantics cannot safely be swapped into the Brevo adapter. The application's existing quarantine/no-automatic-retry policy remains locked.

## Verification

Run from an isolated extracted full ZIP:

```powershell
npm run server:phase34:p1-08-d06d2b-preserve:smoke
npm run server:phase34:p1-08-d06d2a:smoke
npm run server:phase34:p1-08-d01-d05:smoke
npm run server:phase34:p1-08-gate-c-provider:smoke
npm run package:guard
npm run verify:phase34
```

The last command is a long chain, can generate auxiliary measurement files, and its complete exit code must be reported honestly. Do not substitute offline test PASS for deployment validation.

## Hard stop

No API/SMTP keys, no Heroku config change, no actual vendor call, no real email, no Outbox modification, no new DB/Worker/dyno/storage/addon, no paid plan, no Production deployment. D06-D2B actual vendor sandbox call still requires separate explicit authorization and operator-side credential handling.
