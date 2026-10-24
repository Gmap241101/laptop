# Phase 34 P1-08 D06-D2B-G3: Offline settlement authorization hardening

Status: LOCAL OFFLINE DEV ONLY / NOT DEPLOYED / NOT A DB ACCEPTANCE RESULT.

## Baseline and scope

- Source baseline: D06-D2B-G2 full ZIP (2026-10-24). Its supplied SHA-256 was validated before editing.
- During G2 source review, `settleMockOnly` was found to accept any caller-supplied fixture matching a simple `mode` tag and reservation number, without rechecking privileged authority, owner or session.
- G3 changes this existing isolated G2 contract and its smoke test to require `verifySyntheticFixture` as a trusted constructor callback and new recent-owner reauthentication for every settlement.
- The trusted callback must independently consult a private offline fixture registry: `verifiedByServer:true`, `source:'trusted_offline_registry'`, provider `brevo`, same reservation number and exact fixture payload. **Merely returning these values without independent evidence is insufficient in any real integration.**
- Reservation UPDATE WHERE now requires actor, reauthentication digest and session digest to match the locked record. DB controls should deny lost ownership/session matches. One-time state transition still enforced by SQL draft.
- Separate smoke suite tests missing authority, forged synthetic outcomes, account/session mismatch, duplicate concurrent settlement, rollback and forbidden network code.
- Brevo remains selected for synthetic sandbox; Resend provider code, config, test and ability to select later remain untouched. No fallback/dual-send.

## Not tested / strictly prohibited

- No real PostgreSQL backend was available in this environment. Both G2 and G3 unit tests use a serialized transactional in-memory fake; they are **not** PostgreSQL transaction, GRANT/REVOKE, trigger or advisory lock acceptance proof.
- No Clerk or real administrator session consulted. Trusted callbacks are synthetic test fixtures.
- No Brevo/Resend API calls or keys, emails, Outbox updates, DB migrations, Heroku/Vercel/GitHub production deployment.
- Review-only schema remains `docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql`. Do not execute it without separate approval.
- OPTIONAL read-only catalog inspection script exists at `docs/phase34/p1-08-d06d2b-gate3-readonly-postgres-audit_NOT_FOR_DEPLOY.sql`. It is NOT run automatically.

## Acceptance gates remaining

1. Independently verify Staging v299 business regression 8/8; independently review existing Outbox ID 5 read-only and backup safety; refresh live baseline status.
2. Server-authenticated Clerk owner and fresh reauthentication must be wired/tested before production runtime import.
3. Review DB role permissions, RLS/exposure, SQL draft and migration rollback. Explicitly authorize deployment on the **existing** PostgreSQL only if necessary.
4. Verify real PostgreSQL concurrent reservations, wrong-session settlement, duplicate/retry barriers, trigger and audit immutability **on an approved safe local test** first.
5. Separate explicit approval for one Brevo Sandbox network request. Still no real email or Resend auto-fallback.
6. Another approval for allowlisted real-delivery test and Production release.

## Local smoke

```powershell
npm run server:phase34:p1-08-d06d2b-gate2:smoke
npm run server:phase34:p1-08-d06d2b-gate3:smoke
npm run server:phase34:p1-08-d06d2b-preserve:smoke
npm run verify:phase34
```

Only the offline test/test module contracts were changed. There is no runtime route/worker/dispatch import.
