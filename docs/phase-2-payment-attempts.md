# Phase 2: persisted recovery payment attempts

Implementation is prepared locally. No database migration, database query, payment
initialization, or webhook delivery was performed during implementation. Provider
calls in the tests are mocked.

## Data model

The active schema is `src/prisma/contract.prisma`, not
`prisma/schema.prisma`. Its generated runtime contract and types are committed
alongside it. The installed ORM is `@prisma/orm-postgres@8.0.0-rc.11`;
the CLI is `prisma@8.0.0-rc.15`. Queries use the installed
`db.orm.public.Model.where(...).first()/update()`, `create()`, and
`db.transaction(async tx => ...)` APIs. Row-lock plans are built with
`db.raw.sql...returnsRow(...).build()` and executed on `tx.query()`.

`RecoveryPaymentAttempt` stores:

| Fields | Meaning |
| --- | --- |
| id, reference | Integer identity and globally unique UUID-based Paystack reference |
| recoveryCaseId, businessId | Composite FK to the case's (id, businessId), plus FK to Business |
| customerId | Immutable customer ID snapshot; checked against the case when used |
| expectedAmount, expectedCurrency | Immutable positive integer minor units; NGN only |
| environment | Immutable test/live mode derived from the configured secret's prefix |
| status | INITIALIZING, READY, UNKNOWN, RECONCILIATION_REQUIRED, SUCCEEDED |
| authorizationUrl, accessCode | Saved checkout response, reused by duplicate requests |
| providerTransactionId | Optional provider ID stored as a string to avoid integer overflow |
| createdAt, updatedAt | Creation and last ORM update timestamps |
| initializedAt, lastCheckedAt, succeededAt | Nullable lifecycle timestamps |

The contract enforces a unique reference, one attempt per (case, environment),
one non-null provider transaction ID per environment, composite case/business
consistency, positive amount, and allowed currencies/enums. Restrictive foreign
keys preserve evidence. The case's additional (id, businessId) unique constraint
is safe because id is already unique.

Prisma's schema has no field immutability callback. The additive migration also
contains a supported `rawSql` operation installing a PostgreSQL trigger.
It forbids changing identity, reference, association, customer snapshot,
expectations, environment, or creation time; changing a non-null provider ID;
deleting attempt evidence; and reopening a SUCCEEDED attempt. Application updates
only lifecycle fields. The trigger and function are not represented in the
contract's schema hash: retain this migration and review them separately during
future database drift/permission reviews. Database owners can disable triggers;
the application role should not have that capability.

## Initialization and reconciliation

1. Lock the recovery case; reject RECOVERED before reservation or provider I/O.
2. Reuse an existing attempt in the current environment. For a new attempt,
   validate the customer and original transaction belong to the case's business,
   then save a UUID reference and immutable expectations.
3. Commit that reservation before the one bounded provider initialization request.
   The database lock is not held during the network call.
4. Reacquire the case lock to save READY and checkout data, or UNKNOWN for any
   ambiguous failure. Never downgrade an attempt settled by an in-flight webhook.
5. A duplicate READY request receives the saved checkout. A fresh INITIALIZING
   request receives HTTP 202 without another provider call.
6. UNKNOWN, or INITIALIZING older than 30 seconds, can query provider verification
   for exactly the saved reference. This path is read-only and returns HTTP 202
   pending webhook/manual reconciliation. It never initializes again, even for
   provider not-found, failure, timeout, or malformed responses.

There is intentionally no automatic expiry, retry initialization, or replacement
attempt. A crash before sending the HTTP request can leave a reserved but unused
attempt; a crash after provider acceptance can lose the checkout URL. Both require
verification/manual review, rather than risking a second charge. Replacement,
refund and retry workflows need a separately reviewed policy and schema change.
A schema-enforced single attempt per case/environment is deliberately stricter
than a unique active-attempt constraint.

## Webhook and verification

Signature validation still uses raw bytes and timing-safe HMAC SHA512 comparison.
After validation, the webhook resolves the exact saved reference; no case
association is inferred from its prefix. It locks that case, rereads the attempt,
and validates case/business/customer association, expected amount/currency,
configured key environment, provider domain, optional provider ID, and any
supplied association metadata. Optional metadata does not replace the stored FK.
The provider domain is required.

A successful webhook updates the case, marks the attempt SUCCEEDED, and creates
one PAYMENT_RECOVERED audit in a single transaction. Duplicate and concurrent
deliveries serialize on the case lock and cannot double-count revenue. Conflicts
are validated before duplicate acknowledgement. A different attempt arriving for
an already recovered case is quarantined as RECONCILIATION_REQUIRED; recovered
totals and existing recovery audit records remain untouched.

GET verification resolves the saved attempt and validates provider evidence
against its immutable snapshot, not the current case amount. It checks the
original transaction association and any existing exact-reference audit evidence.
It performs no writes or write transactions and cannot settle recovery.
Paystack's documented verification response includes domain, reference, amount,
currency and status:
https://paystack.com/docs/api/transaction/
Signature handling follows:
https://paystack.com/docs/payments/webhooks/

## Legacy-data policy

No attempts are inferred from timestamp references, seeded, or backfilled.
Existing recovered demo records, recovered totals, and timelines remain unchanged.
A validly signed webhook for an unregistered reference is acknowledged with
HTTP 200, ignored=true, and manualReviewRequired=true; diagnostics retain its
validated reference for investigation. It creates no recovery, audit or attempt.
Read-only verification of an unregistered reference returns HTTP 409 before
provider access and clearly reports that manual review is needed. This does not
reset the case's existing RECOVERED status.

There is no durable unmatched-webhook inbox in this phase. Operations must monitor
the manual-review diagnostics. Before rollout, reconcile or retire any outstanding
legacy checkout links separately: the database cannot prove which unpersisted
links remain payable. Do not treat a provider not-found response or absence of an
attempt as permission to backfill evidence or silently replace a legacy payment.

## Migration/update plan (separate approval required)

Prepared offline:

- `migrations/app/20261025T1008_baseline/`: the CLI materialized the previously
  snapshotted baseline into graph history. It creates the old schema only for an
  empty database. **Do not replay it against an existing database.**
- `migrations/app/20261025T1009_recovery_payment_attempts/`: nine generated additive
  schema operations plus one authored guard operation, including checks and FKs.
- New content-addressed destination snapshot
  `fa7b3504c1571d7ce3394dfe93dd014ecf935f36c57664697b359cdf6cbc9b65`.
- Existing `migrations/app/refs/db.json` remains on
  `21a98c981c504322f7d7b9ab90dab629021d47be518e32bb68a9283972160c3c`.

Commands already run are file-only: contract emit, migration plan --from db,
migration self-emission, and db migrate --show with explicit offline origins.
The offline show selects exactly the Phase 2 migration from the old baseline.

After separate approval, inspect the actual database's marker and schema drift,
take a backup, and validate this migration on an isolated PostgreSQL database.
Confirm no existing recovery rows change and the composite FK, uniqueness,
immutable trigger, concurrent reservation, rollback and duplicate webhook behavior
hold with real connections. Against the existing baseline the migration path must
contain only Phase 2. Never force the baseline or alter markers to hide drift.

Review and approve actual database application separately. Apply the reviewed
migration before deploying the new runtime contract/routes: the new code requires
the attempt table and the matching contract marker. Do not use the quick
`db update` path here: it will not install the authored immutability trigger.
If recovering from deployment failure, retain attempt evidence and prefer a
forward correction; do not drop payment attempts or silently roll back to the
old unbound webhook.

## Regression coverage and limitations

All original 108 cases remain, with fixtures and assertions updated for deliberate
Phase 2 behavior: persisted attempts replace no-write initialization, UUIDs replace
timestamps, provider domains are supplied, and initialization no longer holds a
database lock across provider I/O. Phase 1 recovery guards, validation, signature,
rollback, idempotency and read-only verification coverage remains.

Additional tests cover concurrent and sequential checkout reuse, committed
reservation before provider I/O, ambiguous timeout/not-found reconciliation,
provider and persistence failures, unknown references, environment and metadata
mismatches, provider-ID conflicts, ten concurrent webhooks, atomic attempt/case/audit
rollback, already-recovered quarantine, unchanged legacy data, immutable snapshots,
and emitted migration constraints/guards.

Tests mock all database and provider I/O and exercise the real installed lock-plan
builder. They do not prove actual PostgreSQL constraint/trigger behavior or live
Paystack delivery. No database or external payment end-to-end test was run.

Merchant authentication, business-scoped caller authorization, rate limiting,
checkout return/refresh UX, per-merchant credentials, durable unmatched-event
storage, automated reconciliation, and replacement/refund workflows remain outside
this phase. Test and live modes are bound explicitly, but businesses do not have
separate environment-specific revenue ledgers. Use isolated test data/databases.

## Local validation results

- Payment suite: 156 passing (108 retained cases plus 48 Phase 2 regressions).
- TypeScript: passes with no emission or incremental output.
- ESLint: zero errors; two existing unused-variable warnings in scripts/seed.ts.
- Git whitespace checks: pass for tracked changes and new files.
- Offline migration path: only the Phase 2 migration from the existing baseline.
