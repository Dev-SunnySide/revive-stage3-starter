#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/21a98c981c504322f7d7b9ab90dab629021d47be518e32bb68a9283972160c3c/contract';
import endContract from '../../snapshots/21a98c981c504322f7d7b9ab90dab629021d47be518e32bb68a9283972160c3c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'aIRecommendation',
        columns: [
          col('confidence', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reasoning', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('recommendation', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recoveryCaseId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'activityLog',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('businessId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('metadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'business',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('NGN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'businessMember',
        columns: [
          col('businessId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'customer',
        columns: [
          col('businessId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'recoveryAction',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('executedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('recoveryCaseId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'recoveryAction_type_check_4243b536',
            "\"type\" IN ('EMAIL', 'SMS', 'WHATSAPP', 'PAYMENT_LINK', 'MANUAL')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'recoveryCase',
        columns: [
          col('amountAtRisk', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('businessId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('customerId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('identifiedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recoveredAmount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recoveredAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('IDENTIFIED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('transactionId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'recoveryCase_status_check_0994c2cc',
            "\"status\" IN ('IDENTIFIED', 'ANALYZING', 'ACTION_REQUIRED', 'IN_PROGRESS', 'RECOVERED', 'FAILED', 'DISMISSED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'transaction',
        columns: [
          col('amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('businessId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('NGN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('customerId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('paidAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'transaction_status_check_d65fcf38',
            "\"status\" IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('MEMBER'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('user_role_check_50a44636', "\"role\" IN ('OWNER', 'ADMIN', 'MEMBER')"),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'businessMember',
        constraint: 'businessMember_userId_businessId_key',
        columns: ['userId', 'businessId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'transaction',
        constraint: 'transaction_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aIRecommendation',
        index: 'aIRecommendation_recoveryCaseId_idx_aa8ef860',
        columns: ['recoveryCaseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activityLog',
        index: 'activityLog_businessId_idx_ae0ed511',
        columns: ['businessId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activityLog',
        index: 'activityLog_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'businessMember',
        index: 'businessMember_businessId_idx_ae0ed511',
        columns: ['businessId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'businessMember',
        index: 'businessMember_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'customer',
        index: 'customer_businessId_idx_ae0ed511',
        columns: ['businessId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryAction',
        index: 'recoveryAction_recoveryCaseId_idx_aa8ef860',
        columns: ['recoveryCaseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryCase',
        index: 'recoveryCase_businessId_idx_ae0ed511',
        columns: ['businessId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryCase',
        index: 'recoveryCase_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recoveryCase',
        index: 'recoveryCase_transactionId_idx_d3180832',
        columns: ['transactionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transaction',
        index: 'transaction_businessId_idx_ae0ed511',
        columns: ['businessId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transaction',
        index: 'transaction_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'aIRecommendation',
        foreignKey: {
          name: 'aIRecommendation_recoveryCaseId_fkey',
          columns: ['recoveryCaseId'],
          references: { schema: 'public', table: 'recoveryCase', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activityLog',
        foreignKey: {
          name: 'activityLog_businessId_fkey',
          columns: ['businessId'],
          references: { schema: 'public', table: 'business', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activityLog',
        foreignKey: {
          name: 'activityLog_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'businessMember',
        foreignKey: {
          name: 'businessMember_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'businessMember',
        foreignKey: {
          name: 'businessMember_businessId_fkey',
          columns: ['businessId'],
          references: { schema: 'public', table: 'business', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'customer',
        foreignKey: {
          name: 'customer_businessId_fkey',
          columns: ['businessId'],
          references: { schema: 'public', table: 'business', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryAction',
        foreignKey: {
          name: 'recoveryAction_recoveryCaseId_fkey',
          columns: ['recoveryCaseId'],
          references: { schema: 'public', table: 'recoveryCase', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryCase',
        foreignKey: {
          name: 'recoveryCase_businessId_fkey',
          columns: ['businessId'],
          references: { schema: 'public', table: 'business', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryCase',
        foreignKey: {
          name: 'recoveryCase_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customer', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recoveryCase',
        foreignKey: {
          name: 'recoveryCase_transactionId_fkey',
          columns: ['transactionId'],
          references: { schema: 'public', table: 'transaction', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'transaction',
        foreignKey: {
          name: 'transaction_businessId_fkey',
          columns: ['businessId'],
          references: { schema: 'public', table: 'business', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'transaction',
        foreignKey: {
          name: 'transaction_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customer', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
