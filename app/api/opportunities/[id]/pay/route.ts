import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { bindingError, isRecord, paymentEnvironment, paymentError, validCheckoutUrl } from "@/src/payments/attempt";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const opportunityId = Number(id);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(opportunityId) || opportunityId <= 0 || opportunityId > 2147483647) {
      return NextResponse.json({ success: false, error: "Invalid opportunity ID" }, { status: 400 });
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const environment = secret ? paymentEnvironment(secret) : null;

    const reservation = await db.transaction(async (tx) => {
      await tx.query(db.raw.sql`
        SELECT "id" FROM "public"."recoveryCase"
        WHERE "id" = ${opportunityId} FOR UPDATE
      `.returnsRow({ id: "pg/int4@1" }).build());
      const recoveryCase = await tx.orm.public.RecoveryCase.where({ id: opportunityId }).first();
      if (!recoveryCase) return { error: "Recovery opportunity not found", status: 404 } as const;
      if (recoveryCase.status === "RECOVERED") return { error: "Recovery case has already been recovered", status: 409 } as const;
      if (!secret || !environment) return { error: "Paystack environment is not configured", status: 500 } as const;

      const existing = await tx.orm.public.RecoveryPaymentAttempt.where({ recoveryCaseId: opportunityId, environment }).first();
      if (existing) {
        const error = bindingError(existing, recoveryCase, environment);
        if (error) return { error, status: 409 } as const;
        return { attempt: existing, initialize: false, email: null } as const;
      }
      const customer = recoveryCase.customerId === null ? null :
        await tx.orm.public.Customer.where({ id: recoveryCase.customerId }).first();
      if (!customer || customer.businessId !== recoveryCase.businessId) return { error: "Customer not found", status: 404 } as const;
      if (!customer.email) return { error: "Customer email is required for Paystack checkout", status: 400 } as const;
      const original = await tx.orm.public.Transaction.where({ id: recoveryCase.transactionId }).first();
      if (!original || original.businessId !== recoveryCase.businessId || original.currency !== "NGN" ||
        (original.customerId !== null && original.customerId !== customer.id)) {
        return { error: "Recovery transaction binding is inconsistent", status: 409 } as const;
      }
      if (!Number.isSafeInteger(recoveryCase.amountAtRisk) || recoveryCase.amountAtRisk <= 0) {
        return { error: "Recovery amount must be a positive integer", status: 400 } as const;
      }
      const attempt = await tx.orm.public.RecoveryPaymentAttempt.create({
        reference: `REVIVE-${opportunityId}-${crypto.randomUUID()}`,
        recoveryCaseId: opportunityId, businessId: recoveryCase.businessId, customerId: recoveryCase.customerId,
        expectedAmount: recoveryCase.amountAtRisk, expectedCurrency: original.currency, environment,
        status: "INITIALIZING", authorizationUrl: null, accessCode: null, providerTransactionId: null,
        initializedAt: null, lastCheckedAt: null, succeededAt: null,
      });
      return { attempt, initialize: true, email: customer.email } as const;
    });
    if ("error" in reservation) return NextResponse.json({ success: false, error: reservation.error }, { status: reservation.status });
    if (!secret || !environment) throw new Error("Missing provider configuration");
    const { attempt } = reservation;
    const pending = () => NextResponse.json({
      success: false, pending: true, reference: attempt.reference,
      error: "Payment attempt is awaiting confirmation. No new checkout was created.",
    }, { status: 202 });
    if (!reservation.initialize) {
      if (attempt.status === "READY" && validCheckoutUrl(attempt.authorizationUrl) && attempt.accessCode) {
        return NextResponse.json({ success: true, reference: attempt.reference, authorizationUrl: attempt.authorizationUrl, accessCode: attempt.accessCode });
      }
      // A concurrent initializer owns this reservation. A crashed initializer is
      // reconciled after its bounded HTTP call would have finished, never retried.
      if (attempt.status === "INITIALIZING" && Date.now() - Date.parse(attempt.createdAt) < 30000) return pending();
      // Reconciliation is deliberately read-only. Only a signed webhook settles
      // recovery, and a provider "not found" never authorizes replacement.
      try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(attempt.reference)}`, {
          headers: { Authorization: `Bearer ${secret}` }, method: "GET", cache: "no-store", signal: AbortSignal.timeout(10000),
        });
        const provider: unknown = await response.json();
        if (response.ok && isRecord(provider) && provider.status === true && isRecord(provider.data)) {
          const error = paymentError(attempt, provider.data);
          if (error) return NextResponse.json({ success: false, error, reference: attempt.reference }, { status: 409 });
          return NextResponse.json({ success: false, pending: true, reference: attempt.reference,
            paymentSuccessful: provider.data.status === "success", error: "Existing attempt verified; awaiting webhook or manual reconciliation." }, { status: 202 });
        }
      } catch { /* Ambiguous outcomes retain the same reservation. */ }
      return pending();
    }

    // Reservation is durable before provider I/O. Never roll it back on timeout.
    let checkout: { authorizationUrl: string; accessCode: string } | null = null;
    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ email: reservation.email, amount: String(attempt.expectedAmount), currency: attempt.expectedCurrency,
          reference: attempt.reference, metadata: JSON.stringify({ recoveryCaseId: attempt.recoveryCaseId,
            businessId: attempt.businessId, customerId: attempt.customerId, paymentAttemptId: attempt.id, environment, source: "REVIVE" }) }),
      });
      const provider: unknown = await response.json();
      if (response.ok && isRecord(provider) && provider.status === true && isRecord(provider.data) &&
        provider.data.reference === attempt.reference && validCheckoutUrl(provider.data.authorization_url) &&
        typeof provider.data.access_code === "string" && provider.data.access_code) {
        checkout = { authorizationUrl: provider.data.authorization_url, accessCode: provider.data.access_code };
      }
    } catch { /* Timeout, bad JSON, and network failure are all ambiguous. */ }

    const result = await db.transaction(async (tx) => {
      await tx.query(db.raw.sql`
        SELECT "id" FROM "public"."recoveryCase"
        WHERE "id" = ${opportunityId} FOR UPDATE
      `.returnsRow({ id: "pg/int4@1" }).build());
      const recoveryCase = await tx.orm.public.RecoveryCase.where({ id: opportunityId }).first();
      const current = await tx.orm.public.RecoveryPaymentAttempt.where({ reference: attempt.reference }).first();
      if (!recoveryCase || !current || bindingError(current, recoveryCase, environment)) throw new Error("Attempt binding changed");
      // Webhook may have won while initialization was in flight.
      if (recoveryCase.status === "RECOVERED" || current.status === "SUCCEEDED") return "recovered";
      if (current.status !== "INITIALIZING") return "pending";
      const updated = await tx.orm.public.RecoveryPaymentAttempt.where({ id: attempt.id }).update(checkout ? {
        status: "READY", ...checkout, initializedAt: new Date().toISOString(),
      } : { status: "UNKNOWN" });
      if (!updated) throw new Error("Attempt update returned no row");
      return checkout ? "ready" : "pending";
    });
    if (result === "recovered") return NextResponse.json({ success: false, error: "Recovery case has already been recovered" }, { status: 409 });
    if (result !== "ready" || !checkout) return pending();
    return NextResponse.json({ success: true, reference: attempt.reference, ...checkout });
  } catch {
    console.error("Recovery payment initialization failed");
    return NextResponse.json({ success: false, error: "Failed to initialize recovery payment; retry will reuse any reserved attempt" }, { status: 500 });
  }
}
