import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import postgres from "@prisma/orm-postgres/runtime";

// Real route code and Prisma plan builder; all database and provider I/O is mocked.
// No .env loading, network requests, or real database connections are permitted.
const paths = {
  pay: "../app/api/opportunities/[id]/pay/route.ts",
  recover: "../app/api/opportunities/[id]/recover/route.ts",
  verify: "../app/api/payments/verify/[reference]/route.ts",
  webhook: "../app/api/paystack/webhook/route.ts",
};
const compiled = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name,
  ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
]));
const contractJson = JSON.parse(fs.readFileSync(new URL("../src/prisma/contract.json", import.meta.url), "utf8"));
const planClient = postgres({ contractJson, url: "postgresql://unused:unused@127.0.0.1:1/unused" });
const secret = "synthetic-lifecycle-test-key";
const reference = "REVIVE-1-1790444568278";
const payment = { reference, status: "success", amount: 1500000, currency: "NGN", paid_at: "2026-09-26T17:45:39Z" };
const recoveryLog = { id: 3, businessId: 1, action: "PAYMENT_RECOVERED", metadata: {
  recoveryCaseId: 1, reference, amount: 1500000, currency: "NGN", paymentStatus: "success",
} };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(options = {}) {
  let state = {
    RecoveryCase: [{ id: 1, businessId: 1, customerId: 1, transactionId: 1,
      status: options.recovered ? "RECOVERED" : "ACTION_REQUIRED", amountAtRisk: 1500000,
      recoveredAmount: options.recovered ? 1500000 : 0, recoveredAt: options.recovered ? payment.paid_at : null,
      ...options.caseFields }],
    Customer: [{ id: 1, businessId: 1, email: "fixture@example.invalid", ...options.customerFields }],
    Transaction: [{ id: 1, businessId: 1, customerId: 1, reference: "ORIGINAL-FAILED-REFERENCE", amount: 1500000,
      currency: "NGN", status: "FAILED", ...options.originalFields }, ...(options.extraTransactions ?? [])],
    RecoveryAction: [{ id: 1, recoveryCaseId: 1, type: "PAYMENT_LINK", status: "PENDING", ...options.actionFields }],
    ActivityLog: structuredClone(options.logs ?? []),
  };
  if (options.missingCase) state.RecoveryCase = [];
  if (options.missingAction) state.RecoveryAction = [];
  if (options.missingTransaction) state.Transaction = [];
  let tail = Promise.resolve();
  let transactions = 0, updates = 0, inserts = 0, locks = 0, initializations = 0, verifications = 0;
  const diagnostics = [];
  function orm(getState, guard) {
    return { public: Object.fromEntries(Object.keys(state).map(model => [model, {
      where(filter) {
        function rows() { guard(false); return getState()[model].filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)); }
        return {
          first: async () => structuredClone(rows()[0] ?? null),
          all: async () => structuredClone(rows()),
          update: async values => {
            guard(true); updates++;
            const row = rows()[0];
            if (!row) return null;
            Object.assign(row, values);
            return structuredClone(row);
          },
        };
      },
      create: async values => {
        guard(true); inserts++;
        if (options.failAudit && model === "ActivityLog") throw new Error("PRIVATE_DATABASE_ERROR");
        const row = { id: getState()[model].length + 1, ...structuredClone(values) };
        getState()[model].push(row);
        return structuredClone(row);
      },
    }])) };
  }
  const db = {
    raw: planClient.raw,
    orm: orm(() => state, write => { assert.equal(write, false, "Root writes are prohibited"); }),
    async transaction(callback) {
      assert.ok(!options.readOnly, "Verification must not start a write transaction");
      transactions++;
      let pending, release, locked = false;
      const tx = {
        async query(plan) {
          assert.match(JSON.stringify(plan.ast), /FOR UPDATE/);
          const previous = tail;
          tail = new Promise(done => { release = done; });
          await previous;
          locked = true; locks++;
          pending = structuredClone(state);
          if (locks === 1) {
            options.firstLockStarted?.resolve();
            if (options.firstLockRelease) await options.firstLockRelease.promise;
          }
          return pending.RecoveryCase.map(row => ({ id: row.id }));
        },
        orm: orm(() => pending, () => { assert.ok(locked, "Transaction must lock before reading or writing"); }),
      };
      try {
        const result = await callback(tx);
        state = pending;
        return result;
      } finally { release?.(); }
    },
  };
  async function fetchMock(url, init) {
    assert.ok(!options.noFetch, "This request must not contact Paystack");
    assert.ok(init.signal instanceof AbortSignal, "Provider request must be bounded");
    if (url === "https://api.paystack.co/transaction/initialize") {
      initializations++;
      assert.equal(init.method, "POST");
      const body = JSON.parse(init.body);
      assert.equal(body.amount, "1500000");
      assert.equal(body.currency, "NGN");
      assert.equal(JSON.parse(body.metadata).businessId, 1);
      options.initializationStarted?.resolve();
      if (options.initializationRelease) await options.initializationRelease.promise;
      if (options.initializationFailure) throw new Error("PRIVATE_PROVIDER_ERROR");
      return new Response(JSON.stringify({ status: true, data: {
        reference: body.reference, authorization_url: "https://checkout.paystack.com/mock", access_code: "mock-access-code",
      } }));
    }
    assert.equal(url, "https://api.paystack.co/transaction/verify/" + reference);
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    verifications++;
    if (options.verificationFailure) throw new Error("PRIVATE_PROVIDER_ERROR");
    return new Response(options.invalidProviderJson ? "{" : JSON.stringify(
      options.providerEnvelope ?? { status: true, data: { ...payment, ...options.providerFields } }
    ), { status: options.providerHttpStatus ?? 200 });
  }
  const routes = Object.fromEntries(Object.entries(compiled).map(([name, code]) => {
    const routeModule = { exports: {} };
    vm.runInNewContext(code, {
      module: routeModule, exports: routeModule.exports, Buffer, AbortSignal,
      fetch: fetchMock,
      process: { env: { PAYSTACK_SECRET_KEY: options.noSecret ? undefined : secret } },
      console: Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => diagnostics.push(args)])),
      require(id) {
        if (id === "crypto") return crypto;
        if (id === "@/src/prisma/db") return { db };
        if (id === "next/server") return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status ?? 200 }) } };
        throw new Error("Unexpected import");
      },
    });
    return [name, routeModule.exports];
  }));
  return {
    async call(route, value = route === "verify" ? reference : "1") {
      let request, response;
      if (route === "webhook") {
        const body = JSON.stringify({ event: "charge.success", data: payment });
        request = new Request("http://mock/api/paystack/webhook", { method: "POST", body,
          headers: { "x-paystack-signature": crypto.createHmac("sha512", secret).update(body).digest("hex") } });
        response = await routes.webhook.POST(request);
      } else {
        request = new Request("http://mock/", { method: route === "verify" ? "GET" : "POST" });
        response = await routes[route][route === "verify" ? "GET" : "POST"](request, {
          params: Promise.resolve(route === "verify" ? { reference: value } : { id: value }),
        });
      }
      const logged = JSON.stringify(diagnostics);
      assert.ok(!logged.includes(secret) && !logged.includes("PRIVATE_DATABASE_ERROR") && !logged.includes("PRIVATE_PROVIDER_ERROR"));
      return { status: response.status, body: await response.json() };
    },
    state: () => structuredClone(state),
    counts: () => ({ transactions, updates, inserts, locks, initializations, verifications }),
  };
}

for (const route of ["recover", "pay"]) {
  for (const actionStatus of ["PENDING", "COMPLETED"]) {
    test(route + " rejects recovered cases before any mutation or provider request; action=" + actionStatus, async () => {
      const h = harness({ recovered: true, noFetch: true, actionFields: { status: actionStatus } });
      const before = h.state();
      assert.equal((await h.call(route)).status, 409);
      assert.deepEqual(h.state(), before);
      assert.equal(h.counts().updates + h.counts().inserts + h.counts().initializations, 0);
    });
  }
  for (const id of ["0", "-1", "1.5", "Infinity", "2147483648", "abc"]) {
    test(route + " rejects invalid ID before transactions: " + id, async () => {
      const h = harness({ noFetch: true });
      assert.equal((await h.call(route, id)).status, 400);
      assert.equal(h.counts().transactions, 0);
    });
  }
  test(route + " returns 404 for missing case without writes or initialization", async () => {
    const h = harness({ missingCase: true, noFetch: true });
    assert.equal((await h.call(route)).status, 404);
    assert.equal(h.counts().updates + h.counts().inserts, 0);
  });
  test("webhook winning the lock prevents " + route + " from restarting recovery", async () => {
    const started = deferred(), release = deferred();
    const h = harness({ noFetch: true, firstLockStarted: started, firstLockRelease: release });
    const deliveryPromise = h.call("webhook");
    await started.promise;
    const actionPromise = h.call(route);
    release.resolve();
    const [delivery, action] = await Promise.all([deliveryPromise, actionPromise]);
    assert.equal(delivery.status, 200);
    assert.equal(action.status, 409);
    assert.equal(h.state().RecoveryCase[0].status, "RECOVERED");
    assert.equal(h.state().ActivityLog.length, 1);
  });
}

test("recover preserves legitimate action execution and sequential idempotency", async () => {
  const h = harness({ noFetch: true });
  assert.equal((await h.call("recover")).status, 200);
  assert.equal(h.state().RecoveryCase[0].status, "IN_PROGRESS");
  assert.equal(h.state().RecoveryCase[0].recoveredAmount, 0);
  assert.equal(h.state().RecoveryAction[0].status, "COMPLETED");
  const counts = h.counts();
  assert.equal((await h.call("recover")).status, 200);
  assert.equal(h.counts().updates, counts.updates);
  assert.equal(h.state().ActivityLog.length, 1);
});

test("concurrent recover requests execute and audit the action once", async () => {
  const h = harness({ noFetch: true });
  const results = await Promise.all([h.call("recover"), h.call("recover")]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(h.state().ActivityLog.length, 1);
  assert.equal(h.counts().updates, 2);
});

test("recover first then webhook leaves the case recovered", async () => {
  const h = harness({ noFetch: true });
  const results = await Promise.all([h.call("recover"), h.call("webhook")]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(h.state().RecoveryCase[0].status, "RECOVERED");
  assert.equal(h.state().RecoveryCase[0].recoveredAmount, 1500000);
});

test("recover audit failure rolls back action and case updates", async () => {
  const h = harness({ failAudit: true, noFetch: true });
  const before = h.state();
  assert.equal((await h.call("recover")).status, 500);
  assert.deepEqual(h.state(), before);
});

test("completed unrecovered action preserves missing-audit repair without reopening case", async () => {
  const h = harness({ actionFields: { status: "COMPLETED" }, noFetch: true });
  assert.equal((await h.call("recover")).status, 200);
  assert.equal(h.counts().updates, 0);
  assert.equal(h.state().ActivityLog.length, 1);
});

test("pay preserves legitimate checkout initialization without recovery writes", async () => {
  const h = harness();
  const before = h.state();
  const result = await h.call("pay");
  assert.equal(result.status, 200);
  assert.match(result.body.reference, /^REVIVE-1-\d+$/);
  assert.equal(result.body.authorizationUrl, "https://checkout.paystack.com/mock");
  assert.equal(h.counts().initializations, 1);
  assert.deepEqual(h.state(), before);
});

test("pay holds the case lock through initialization; webhook subsequently recovers", async () => {
  const started = deferred(), release = deferred();
  const h = harness({ initializationStarted: started, initializationRelease: release });
  const checkout = h.call("pay");
  await started.promise;
  const webhook = h.call("webhook");
  assert.equal(h.counts().locks, 1);
  release.resolve();
  assert.equal((await checkout).status, 200);
  assert.equal((await webhook).status, 200);
  assert.equal(h.state().RecoveryCase[0].status, "RECOVERED");
  assert.equal(h.counts().initializations, 1);
});

test("pay initialization failure preserves recovery state", async () => {
  const h = harness({ initializationFailure: true });
  const before = h.state();
  assert.equal((await h.call("pay")).status, 500);
  assert.deepEqual(h.state(), before);
});

test("pay rejects customer from another business before initialization", async () => {
  const h = harness({ customerFields: { businessId: 2 }, noFetch: true });
  assert.equal((await h.call("pay")).status, 404);
  assert.equal(h.counts().initializations, 0);
});

for (const recovered of [false, true]) {
  test("verification validates payment but never writes recovery; recovered=" + recovered, async () => {
    const h = harness({ recovered, readOnly: true });
    const before = h.state();
    const result = await h.call("verify");
    assert.equal(result.status, 200);
    assert.equal(result.body.paymentSuccessful, true);
    assert.equal(result.body.recoveryCase.status, recovered ? "RECOVERED" : "ACTION_REQUIRED");
    assert.equal(result.body.validation.storedPaymentBinding, null);
    assert.equal(result.body.validation.initializedPaymentBindingStored, false);
    assert.deepEqual(h.state(), before);
    assert.equal(h.counts().transactions + h.counts().updates + h.counts().inserts, 0);
  });
}

for (const status of ["failed", "pending", "abandoned"]) {
  test("verification of " + status + " does not claim successful payment", async () => {
    const h = harness({ readOnly: true, providerFields: { status } });
    const result = await h.call("verify");
    assert.equal(result.status, 200);
    assert.equal(result.body.paymentSuccessful, false);
    assert.equal(result.body.validation.statusSuccessful, false);
    assert.equal(h.state().RecoveryCase[0].status, "ACTION_REQUIRED");
  });
}

for (const [name, fields] of [
  ["reference", { reference: "REVIVE-2-1790444568278" }],
  ["amount", { amount: 1 }], ["string amount", { amount: "1500000" }],
  ["zero amount", { amount: 0 }], ["negative amount", { amount: -1 }],
  ["fractional amount", { amount: 1500000.5 }], ["currency", { currency: "USD" }],
  ["metadata case", { metadata: { recoveryCaseId: 2 } }],
  ["metadata business", { metadata: { businessId: 2 } }],
  ["metadata customer", { metadata: { customerId: 2 } }],
  ["metadata source", { metadata: { source: "OTHER" } }],
  ["malformed metadata", { metadata: "{" }], ["array metadata", { metadata: [] }],
]) {
  test("verification rejects mismatched " + name + " without writes", async () => {
    const h = harness({ readOnly: true, providerFields: fields });
    const before = h.state();
    const result = await h.call("verify");
    assert.equal(result.status, 409);
    assert.equal(result.body.paymentSuccessful, false);
    assert.deepEqual(h.state(), before);
  });
}

test("verification accepts matching JSON-string provider metadata without claiming stored binding", async () => {
  const h = harness({ readOnly: true, providerFields: { metadata: JSON.stringify({ recoveryCaseId: 1, businessId: 1, customerId: 1, source: "REVIVE" }) } });
  const result = await h.call("verify");
  assert.equal(result.status, 200);
  assert.equal(result.body.validation.providerMetadataChecked, true);
  assert.equal(result.body.validation.storedPaymentBinding, null);
});

test("verification recognizes existing matching recovery audit evidence", async () => {
  const h = harness({ readOnly: true, recovered: true, logs: [recoveryLog] });
  const result = await h.call("verify");
  assert.equal(result.status, 200);
  assert.equal(result.body.validation.storedPaymentBinding, "recovery_audit_log");
  assert.equal(result.body.validation.initializedPaymentBindingStored, false);
});

for (const [name, log] of [
  ["business", { ...recoveryLog, businessId: 2 }],
  ["case", { ...recoveryLog, metadata: { ...recoveryLog.metadata, recoveryCaseId: 2 } }],
  ["amount", { ...recoveryLog, metadata: { ...recoveryLog.metadata, amount: 1 } }],
  ["currency", { ...recoveryLog, metadata: { ...recoveryLog.metadata, currency: "USD" } }],
  ["status", { ...recoveryLog, metadata: { ...recoveryLog.metadata, paymentStatus: "failed" } }],
]) {
  test("verification rejects existing audit with conflicting " + name, async () => {
    const h = harness({ readOnly: true, logs: [log] });
    assert.equal((await h.call("verify")).status, 409);
  });
}

test("verification ignores audit records for other payment references", async () => {
  const h = harness({ readOnly: true, logs: [{ ...recoveryLog, metadata: { ...recoveryLog.metadata, reference: "other" } }] });
  const result = await h.call("verify");
  assert.equal(result.status, 200);
  assert.equal(result.body.validation.storedPaymentBinding, null);
});

test("verification rejects exact payment reference stored against a different transaction", async () => {
  const h = harness({ readOnly: true, extraTransactions: [{ id: 2, reference, businessId: 1, customerId: 1, amount: 1500000, currency: "NGN" }] });
  assert.equal((await h.call("verify")).status, 409);
});

test("verification accepts an existing direct transaction binding", async () => {
  const h = harness({ readOnly: true, originalFields: { reference } });
  const result = await h.call("verify");
  assert.equal(result.status, 200);
  assert.equal(result.body.validation.storedPaymentBinding, "transaction");
});

for (const originalFields of [{ businessId: 2 }, { customerId: 2 }, { currency: "USD" }]) {
  test("verification rejects inconsistent original transaction binding: " + JSON.stringify(originalFields), async () => {
    const h = harness({ readOnly: true, originalFields });
    assert.equal((await h.call("verify")).status, 409);
  });
}

for (const badReference of ["bad", "REVIVE-1-123-extra", "REVIVE-0-123", "REVIVE-2147483648-123"]) {
  test("verification rejects malformed request reference before provider access: " + badReference, async () => {
    const h = harness({ readOnly: true, noFetch: true });
    assert.equal((await h.call("verify", badReference)).status, 400);
  });
}

for (const options of [{ providerEnvelope: { status: true, data: null } }, { providerFields: { status: null } }, { providerHttpStatus: 502 }]) {
  test("verification rejects malformed or unsuccessful provider response", async () => {
    const h = harness({ readOnly: true, ...options });
    const before = h.state();
    assert.equal((await h.call("verify")).status, 502);
    assert.deepEqual(h.state(), before);
  });
}

test("verification provider exception never leaks details or writes state", async () => {
  const h = harness({ readOnly: true, verificationFailure: true });
  const before = h.state();
  assert.equal((await h.call("verify")).status, 500);
  assert.deepEqual(h.state(), before);
});
