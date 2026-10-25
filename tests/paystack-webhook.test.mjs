import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import postgres from "@prisma/orm-postgres/runtime";

// Compile the actual route in memory. Its database, environment and logging are
// injected; these tests never load .env, contact Paystack, or connect to Postgres.
const source = fs.readFileSync(new URL("../app/api/paystack/webhook/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const contractJson = JSON.parse(fs.readFileSync(new URL("../src/prisma/contract.json", import.meta.url), "utf8"));
// Use the installed Prisma builder to exercise the real lock-plan construction.
// This lazy client only builds plans; it is never connected or queried.
const planClient = postgres({ contractJson, url: "postgresql://unused:unused@127.0.0.1:1/unused" });
const secret = "sk_test_synthetic-test-secret";
const reference = "REVIVE-1-1790444568278";
const payment = { reference, amount: 1500000, currency: "NGN", status: "success", domain: "test", id: 12345, paid_at: "2026-09-26T17:45:39.000Z" };

const helperModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/payments/attempt.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: helperModule.exports, URL });

function harness(options = {}) {
  let state = {
    row: options.missingCase ? null : { id: 1, businessId: 1, customerId: 1, status: options.recovered ? "RECOVERED" : "ACTION_REQUIRED", amountAtRisk: 1500000, recoveredAmount: options.recovered ? 1500000 : 0, recoveredAt: null },
    logs: [],
    attempt: { id: 1, reference, recoveryCaseId: 1, businessId: 1, customerId: 1, expectedAmount: payment.amount,
      expectedCurrency: "NGN", environment: "test", status: options.recovered ? "SUCCEEDED" : "READY",
      providerTransactionId: null },
  };
  let tail = Promise.resolve();
  let transactions = 0, updates = 0, rollbacks = 0, locks = 0;
  let failAudit = options.failAudit ?? false;
  const diagnostics = [];
  const db = {
    raw: planClient.raw,
    orm: { public: { RecoveryPaymentAttempt: { where(filter) {
      assert.deepEqual(JSON.parse(JSON.stringify(filter)), { reference });
      return { first: async () => structuredClone(state.attempt) };
    } } } },
    async transaction(callback) {
      transactions++;
      let release, pending, locked = false;
      function requireLock() { assert.ok(locked, "Read/write must follow lock acquisition"); }
      const tx = {
        async query(plan) {
          assert.equal(locked, false);
          const ast = JSON.stringify(plan.ast);
          assert.match(ast, /FOR UPDATE/);
          assert.match(ast, /recoveryCase/);
          assert.match(ast, /param/i);
          const previous = tail;
          tail = new Promise(resolve => { release = resolve; });
          await previous;
          locked = true;
          locks++;
          pending = structuredClone(state);
          return pending.row ? [{ id: pending.row.id }] : [];
        },
        orm: { public: {
          RecoveryPaymentAttempt: { where() { return {
            async first() { requireLock(); return structuredClone(pending.attempt); },
            async update(values) { requireLock(); Object.assign(pending.attempt, values); return structuredClone(pending.attempt); },
          }; } },
          RecoveryCase: {
            where(filter) {
              assert.deepEqual(JSON.parse(JSON.stringify(filter)), { id: 1 });
              return {
                async first() { requireLock(); return pending.row && { ...pending.row }; },
                async update(values) {
                  requireLock(); updates++;
                  if (options.failUpdate) throw new Error("PRIVATE_DATABASE_ERROR");
                  if (options.nullUpdate) return null;
                  pending.row = { ...pending.row, ...values };
                  return { ...pending.row };
                },
              };
            },
          },
          ActivityLog: {
            async create(values) {
              requireLock();
              if (failAudit) { failAudit = false; throw new Error("PRIVATE_DATABASE_ERROR"); }
              const log = { id: pending.logs.length + 1, ...values };
              pending.logs.push(log);
              return log;
            },
          },
        } },
      };
      try {
        const result = await callback(tx);
        if (options.failCommit) throw new Error("PRIVATE_COMMIT_ERROR");
        state = pending;
        return result;
      } catch (error) {
        rollbacks++;
        throw error;
      } finally { release?.(); }
    },
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule, exports: routeModule.exports, Buffer,
    process: { env: { PAYSTACK_SECRET_KEY: options.noSecret ? undefined : secret } },
    console: Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => diagnostics.push(args)])),
    require(name) {
      if (name === "crypto") return crypto;
      if (name === "@/src/payments/attempt") return helperModule.exports;
      if (name === "@/src/prisma/db") return { db };
      if (name === "next/server") return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status ?? 200 }) } };
      throw new Error("Unexpected route import");
    },
  });
  return {
    async call(data = {}, requestOptions = {}) {
      const body = requestOptions.body ?? JSON.stringify({ event: requestOptions.event ?? "charge.success", data: { ...payment, ...data } });
      const headers = {};
      if (!requestOptions.unsigned) headers["x-paystack-signature"] = requestOptions.signature ?? crypto.createHmac("sha512", secret).update(body).digest("hex");
      const response = await routeModule.exports.POST(new Request("http://mock/api/paystack/webhook", { method: "POST", headers, body }));
      assert.ok(response.headers.get("x-revive-request-id"));
      const logged = JSON.stringify(diagnostics);
      assert.ok(!logged.includes(secret) && !logged.includes("PRIVATE_DATABASE_ERROR") && !logged.includes("PRIVATE_COMMIT_ERROR"));
      return { status: response.status, body: await response.json() };
    },
    state: () => structuredClone(state),
    counts: () => ({ transactions, updates, rollbacks, locks }),
    diagnostics,
  };
}

test("successful charge commits recovery and its audit together", async () => {
  const h = harness();
  const result = await h.call();
  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Payment recovery recorded successfully");
  assert.equal(h.state().row.status, "RECOVERED");
  assert.equal(h.state().row.recoveredAmount, payment.amount);
  assert.equal(h.state().row.recoveredAt, payment.paid_at);
  assert.equal(h.state().logs.length, 1);
  assert.equal(h.state().logs[0].metadata.reference, reference);
  assert.equal(h.diagnostics.at(-1)[1].stage, "completed");
});

test("sequential duplicate does not update or audit twice", async () => {
  const h = harness();
  await h.call();
  const duplicate = await h.call();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.message, "Recovery has already been recorded");
  assert.equal(h.counts().updates, 1);
  assert.equal(h.state().logs.length, 1);
});

test("concurrent deliveries acquire the lock before reading, and record once", async () => {
  const h = harness();
  const results = await Promise.all(Array.from({ length: 8 }, () => h.call()));
  assert.ok(results.every(result => result.status === 200));
  assert.equal(results.filter(result => result.body.message === "Payment recovery recorded successfully").length, 1);
  assert.equal(h.counts().locks, 8);
  assert.equal(h.counts().updates, 1);
  assert.equal(h.state().logs.length, 1);
  assert.equal(h.state().row.recoveredAmount, payment.amount);
});

test("audit failure rolls back recovery and a retry completes both writes", async () => {
  const h = harness({ failAudit: true });
  assert.equal((await h.call()).status, 500);
  assert.equal(h.state().row.status, "ACTION_REQUIRED");
  assert.equal(h.state().row.recoveredAmount, 0);
  assert.equal(h.state().logs.length, 0);
  assert.equal(h.diagnostics.at(-1)[1].stage, "audit_log_create");
  assert.equal((await h.call()).status, 200);
  assert.equal(h.state().row.status, "RECOVERED");
  assert.equal(h.state().logs.length, 1);
  assert.equal(h.counts().rollbacks, 1);
});

for (const option of ["failUpdate", "nullUpdate", "failCommit"]) {
  test(option + " never reports success or persists a partial recovery", async () => {
    const h = harness({ [option]: true });
    assert.equal((await h.call()).status, 500);
    assert.equal(h.state().row.status, "ACTION_REQUIRED");
    assert.equal(h.state().logs.length, 0);
  });
}

for (const recovered of [false, true]) {
  for (const [name, fields] of [
    ["wrong amount", { amount: 1 }], ["string amount", { amount: "1500000" }],
    ["zero amount", { amount: 0 }], ["negative amount", { amount: -1 }],
    ["fractional amount", { amount: 1500000.5 }], ["unsafe amount", { amount: Number.MAX_SAFE_INTEGER + 1 }],
    ["wrong currency", { currency: "USD" }], ["failed status", { status: "failed" }],
    ["missing status", { status: null }], ["bad timestamp", { paid_at: "invalid" }],
  ]) {
    test(name + " rejected before duplicate acknowledgement; recovered=" + recovered, async () => {
      const h = harness({ recovered });
      assert.equal((await h.call(fields)).status, 400);
      assert.equal(h.counts().updates, 0);
      assert.equal(h.state().logs.length, 0);
    });
  }
}

test("missing recovery case returns 404 without writes", async () => {
  const h = harness({ missingCase: true });
  assert.equal((await h.call()).status, 404);
  assert.equal(h.counts().updates, 0);
});

for (const requestOptions of [{ unsigned: true }, { signature: "x".repeat(128) }, { signature: "0".repeat(128) }]) {
  test("unsigned or invalid signature cannot enter a database transaction", async () => {
    const h = harness();
    assert.equal((await h.call({}, requestOptions)).status, 401);
    assert.equal(h.counts().transactions, 0);
  });
}

for (const body of ["{", "null", "[]", "42"]) {
  test("malformed event rejected without a transaction: " + body, async () => {
    const h = harness();
    assert.equal((await h.call({}, { body })).status, 400);
    assert.equal(h.counts().transactions, 0);
  });
}

test("unrelated events acknowledged without database access", async () => {
  const h = harness();
  assert.equal((await h.call({}, { event: "subscription.create" })).status, 200);
  assert.equal(h.counts().transactions, 0);
});

test("missing secret cannot enter a database transaction", async () => {
  const h = harness({ noSecret: true });
  assert.equal((await h.call()).status, 500);
  assert.equal(h.counts().transactions, 0);
});

for (const badReference of [null, "REVIVE-0-123", "REVIVE-2147483648-123"]) {
  test("invalid recovery reference cannot enter a transaction: " + badReference, async () => {
    const h = harness();
    assert.equal((await h.call({ reference: badReference })).status, 400);
    assert.equal(h.counts().transactions, 0);
  });
}
