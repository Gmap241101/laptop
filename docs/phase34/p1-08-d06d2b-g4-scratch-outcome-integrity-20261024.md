# Phase 34 P1-08 D06-D2B G4-SCRATCH-INTEGRITY

Date: 2026-10-24 / status: OFFLINE CODE ONLY

## Baseline and scope

Based on G5-ORIGIN full-source ZIP, not the still-accepted Staging v299 release. Changes are confined to the disposable LOCAL G4 scratch-schema fixture and new offline tests. No server route, dispatch scheduler, Outbox or Clerk adapter was wired. No deployed migration, credentials or extra database were created.

## Defect and mitigation

The previous scratch fixture accepted almost any non-NULL verdict at initial settlement (including combinations such as simulated acceptance without a provider-id digest). Its state-transition trigger only checked state membership. This is a local-fixture integrity gap, not evidence of an actual Staging exploit.

A CHECK constraint now restricts the exact state/verdict/provider-digest/settlement-time combinations and uses `IS TRUE` so a SQL NULL does not pass the CHECK. The BEFORE UPDATE trigger uses `IS NOT TRUE` to fail closed when provider-id digest is NULL or malformed. The existing immutable-audit and terminal-reservation restrictions remain. No genuine Brevo response, delivered email or billing authorization can be inferred from this fixture.

## Test changes

Four invalid UPDATE probes are added to `runLocalG4()`: acceptance with missing provider hash, acceptance with wrong verdict, manual-review with provider hash, and quarantined state claiming acceptance. On the local restore DB these must raise `P0001`, then a subsequent SELECT must confirm the row remains `held_locked`. Failed mutations are inside ROLLBACK-only transactions; fixture schema must be dropped in `finally` as before.

`tools/backend/smoke-phase34-p1-08-d06d2b-g4-outcome-integrity.mjs` adds static schema/trigger checks, synthetic mocked classifier result consistency checks and checks that the vendor and production runtime remain disconnected.

## Acceptance boundary

- Automated tests here do not execute PostgreSQL syntax or enforce the constraint in a real server.
- The standalone actual G4 acceptance test must be run **only by the operator on their existing Windows localhost restore database**, with explicit approval to create/drop a temporary schema.
- If any temporary scratch schema remains after a failed test, stop and inspect locally; do not automatically rerun or execute arbitrary schema deletion commands.
- Current acceptance of G4 and G5 is unchanged: no DB live test, no real Clerk acceptance.
- Provider selection Brevo; Resend code/config/tests retained, no auto-fallback or dual sending.
- No API keys and no live email.

## Safe offline commands

```powershell
npm run package:guard
npm run server:phase34:p1-08-d06d2b-g4-outcome-integrity:smoke
npm run server:phase34:p1-08-d06d2b-g4-local:smoke
npm run mail:p108:g4:local:plan
```

No DB access is performed by these commands. For the actual local scratch-schema test, follow the previously supplied Windows operator G4 acceptance script and confirm that the local restore DB name and host are correct; never paste a database URL into reports or chat.
