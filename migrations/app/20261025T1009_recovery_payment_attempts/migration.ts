#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/21a98c981c504322f7d7b9ab90dab629021d47be518e32bb68a9283972160c3c/contract';
import startContract from '../../snapshots/21a98c981c504322f7d7b9ab90dab629021d47be518e32bb68a9283972160c3c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fa7b3504c1571d7ce3394dfe93dd014ecf935f36c57664697b359cdf6cbc9b65/contract';
import endContract from '../../snapshots/fa7b3504c1571d7ce3394dfe93dd014ecf935f36c57664697b359cdf6cbc9b65/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        columns: [
          col('accessCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('authorizationUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('businessId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('customerId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('environment', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expectedAmount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('expectedCurrency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('initializedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('lastCheckedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('providerTransactionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('recoveryCaseId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('INITIALIZING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('succeededAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('attempt_positive_amount_62ceb3db', '"expectedAmount" > 0'),
          checkExpression('attempt_supported_currency_052e0d54', '"expectedCurrency" = \'NGN\''),
          checkExpression(
            'recoveryPaymentAttempt_environment_check_fa07de53',
            "\"environment\" IN ('test', 'live')",
          ),
          checkExpression(
            'recoveryPaymentAttempt_status_check_064f6f30',
            "\"status\" IN ('INITIALIZING', 'READY', 'UNKNOWN', 'RECONCILIATION_REQUIRED', 'SUCCEEDED')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'recoveryCase',
        constraint: 'recoveryCase_id_businessId_key',
        columns: ['id', 'businessId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        constraint: 'recoveryPaymentAttempt_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        constraint: 'recoveryPaymentAttempt_recoveryCaseId_environment_key',
        columns: ['recoveryCaseId', 'environment'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        constraint: 'recoveryPaymentAttempt_environment_providerTransactionId_key',
        columns: ['environment', 'providerTransactionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        index: 'recoveryPaymentAttempt_businessId_idx_ae0ed511',
        columns: ['businessId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        index: 'recoveryPaymentAttempt_recoveryCaseId_businessId_idx_56c18fe8',
        columns: ['recoveryCaseId', 'businessId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        foreignKey: {
          name: 'recoveryPaymentAttempt_recoveryCaseId_businessId_fkey',
          columns: ['recoveryCaseId', 'businessId'],
          references: { schema: 'public', table: 'recoveryCase', columns: ['id', 'businessId'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryPaymentAttempt',
        foreignKey: {
          name: 'recoveryPaymentAttempt_businessId_fkey',
          columns: ['businessId'],
          references: { schema: 'public', table: 'business', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'restrict',
        },
      }),
      // Contract checks cannot compare OLD and NEW. Keep this append-only
      // binding guard in the migration rather than inventing a PSL attribute.
      rawSql({
        id: 'guard.recoveryPaymentAttempt.immutable_binding',
        label: 'Protect immutable payment bindings and retained payment evidence',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [{ description: 'guard does not already exist',
          sql: "SELECT to_regprocedure('public.revive_attempt_binding_guard()') IS NULL AS result" }],
        execute: [
          { description: 'create immutable binding guard', sql: `
CREATE FUNCTION public.revive_attempt_binding_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment attempt evidence cannot be deleted';
  END IF;
  IF ROW(NEW."id", NEW."reference", NEW."recoveryCaseId", NEW."businessId", NEW."customerId",
         NEW."expectedAmount", NEW."expectedCurrency", NEW."environment", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."reference", OLD."recoveryCaseId", OLD."businessId", OLD."customerId",
         OLD."expectedAmount", OLD."expectedCurrency", OLD."environment", OLD."createdAt") THEN
    RAISE EXCEPTION 'Payment attempt binding and expectations are immutable';
  END IF;
  IF OLD."providerTransactionId" IS NOT NULL AND NEW."providerTransactionId" IS DISTINCT FROM OLD."providerTransactionId" THEN
    RAISE EXCEPTION 'Provider transaction identity is immutable once recorded';
  END IF;
  IF OLD."status" = 'SUCCEEDED' AND NEW."status" <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'A successful payment attempt cannot be reopened';
  END IF;
  RETURN NEW;
END;
$guard$` },
          { description: 'attach immutable binding guard', sql: `
CREATE TRIGGER revive_attempt_binding_guard
BEFORE UPDATE OR DELETE ON public."recoveryPaymentAttempt"
FOR EACH ROW EXECUTE FUNCTION public.revive_attempt_binding_guard()` },
        ],
        postcheck: [{ description: 'guard is attached and enabled', sql: `
SELECT EXISTS (SELECT 1 FROM pg_trigger
WHERE tgrelid = 'public."recoveryPaymentAttempt"'::regclass
AND tgname = 'revive_attempt_binding_guard' AND tgenabled = 'O'
AND tgfoid = 'public.revive_attempt_binding_guard()'::regprocedure) AS result` }],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
