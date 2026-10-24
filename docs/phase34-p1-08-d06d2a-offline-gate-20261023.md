# Phase 34 P1-08 D06-D2A | Offline Brevo Sandbox Gate

Date: 2026-10-23 (Asia/Seoul)
Source input: D06-D1 full deployment source ZIP, SHA-256 `f4da45c3c3af65a80aa07bfab010af8e63aaa97c81c8540a8c570fe64d48378b`.
Accepted Staging baseline reported by user: Git `a73195e`, Heroku v299, migration 049, backup b015. No live cloud state was checked during D06-D2A.

## Purpose and boundary

D06-D2A prepares and validates the sandbox request/response contract WITHOUT any HTTP transport, credential access, Outbox claim, database queries, dyno registration, or real message delivery. This is a source-only offline step; it does not approve a vendor-side sandbox call or actual email delivery.

## Added code

- `server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs`: source-locked pure policy checker, fixed sender/domain, staging-only allowlist, cautious trial-only limits (maximum 30 daily/900 monthly as local policy, not a vendor entitlement), synthetically fixed payload with body `headers: {"X-Sib-Sandbox":"drop"}`, exact body schema validation, sanitized mock response classification, and non-authorizing audit record builder.
- `tools/backend/smoke-phase34-p1-08-d06d2a-offline-gate.mjs`: contract, negative injection, error taxonomy, locked runtime isolation, and credential/Outbox exclusion assertions.
- `package.json`: `server:phase34:p1-08-d06d2a:smoke` and append to `verify:phase34` without removing any older command.
- This documentation file. No other sources or runtime entrypoints changed.

## Sandbox standard

Official documentation: https://developers.brevo.com/docs/using-sandbox-mode . The sandbox flag is within the JSON payload's `headers` object, not the outer HTTP headers. HTTP 201 with `messageId` signals sandbox request acceptance; no recipient delivery and no Brevo delivery log. Offline simulated HTTP 201 is **not** evidence of vendor API acceptance.

## Safety properties

1. All five source hard locks remain true; `liveSendingReady` remains false.
2. Strict staging-only `brevo` config; one exact recipient in a normalized allowlist of 1-5 entries; no data from existing queue or user accounts.
3. Credentials are forbidden in offline configuration and never appear in requests or audit data.
4. Subject, text, recipient count and sender are fixed by code. No caller-provided email content, CC/BCC, attachments, schedule, templates, HTML, tags, or optional overrides.
5. There is no `fetch`, HTTP executor, database integration, external CLI, environment secret reference or runtime registration in the new module.
6. Simulated statuses: valid 201 => sandbox_simulated_acceptance; 429 => rate_limited_manual_review; known 4xx => rejected_manual_review; any other/malformed response => uncertain_quarantine. No automatic retry, no delivery success claim.
7. Synthetic audit records store only SHA-256 request/provider-ID digests, mock verdict and explicit zero counters. They are NOT security audit rows in PostgreSQL and not proof of operator approval.

## Local verification

```
npm run server:phase34:p1-08-d06d1:smoke
npm run server:phase34:p1-08-d06d2a:smoke
npm run package:guard
npm run verify:phase34
```

Use an isolated unpacked copy for the full verification run: a previous suite generated `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json` and could alter the local manifest hash. A full new end-to-end `verify:phase34` exit code must be recorded separately; historical individual PASS does not prove it in this new package.

## Remaining gates and prohibited actions

- v299 browser-based 8-domain manual regression evidence remains unsubmitted. Existing Outbox ID 5 (`admin_signup_pending`, previous state `queued`) awaits read-only owner review; do not issue SQL UPDATE/DELETE or enqueue it.
- A real Brevo vendor Sandbox call, Brevo API v3 key creation/configuration, and any outbound networking require a separate explicit user approval. Do not configure mail keys or put them into Git, ZIP, browser, or chat.
- Real email needs further separate approval and strict server-side allowlisting, recent owner reauthentication, quota ledger, audit, ambiguous-result quarantine, and manual queue decisions.
- Production requires its own promotion approval. Keep the existing single PostgreSQL essential-0, one web dyno, and no new DB, Worker, storage, addon, or paid tier.
- This code changes no user interface and must not add developer implementation explanations to the UI.
