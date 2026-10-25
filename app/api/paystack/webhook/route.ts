import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { bindingError, paymentEnvironment, paymentError, providerId, validReference } from "@/src/payments/attempt";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = "configuration";
  let recoveryCaseId: number | undefined;
  let reference: string | undefined;

  // Log only allowlisted diagnostic fields. Never log the payload, signature,
  // secret key, customer details, or raw database errors.
  function respond(
    body: { success: boolean; error?: string; message?: string; [key: string]: unknown },
    init?: { status: number }
  ) {
    const status = init?.status ?? 200;
    const diagnostic = {
      requestId,
      stage,
      status,
      outcome: body.error ?? body.message,
      recoveryCaseId,
      reference,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      console.error("Paystack webhook result", diagnostic);
    } else if (status >= 400) {
      console.warn("Paystack webhook result", diagnostic);
    } else {
      console.info("Paystack webhook result", diagnostic);
    }

    const response = NextResponse.json(body, init);
    response.headers.set("x-revive-request-id", requestId);
    return response;
  }

  console.info("Paystack webhook received", {
    requestId,
    signaturePresent: request.headers.has("x-paystack-signature"),
    timestamp: new Date().toISOString(),
  });
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return respond(
        {
          success: false,
          error: "Paystack secret key is not configured",
        },
        { status: 500 }
      );
    }

    // Read the raw request body.
    // Paystack's signature is calculated from the raw payload.
    stage = "signature_validation";
    const rawBody = await request.text();

    const signature = request.headers.get(
      "x-paystack-signature"
    );

    if (!signature) {
      return respond(
        {
          success: false,
          error: "Missing Paystack signature",
        },
        { status: 401 }
      );
    }

    // Generate our own HMAC SHA512 signature.
    const expectedSignature = crypto
      .createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");

    // Compare signatures safely.
    const signaturesMatch =
      /^[a-fA-F0-9]{128}$/.test(signature) &&
      crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );

    if (!signaturesMatch) {
      return respond(
        {
          success: false,
          error: "Invalid Paystack signature",
        },
        { status: 401 }
      );
    }

    stage = "event_validation";
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return respond({ success: false, error: "Invalid webhook JSON" }, { status: 400 });
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return respond({ success: false, error: "Invalid webhook event" }, { status: 400 });
    }

    // We only process successful charges.
    if (event.event !== "charge.success") {
      return respond({
        success: true,
        message: "Event received but no action required",
      });
    }

    const transaction = event.data;

    if (typeof transaction?.reference !== "string" || !transaction.reference) {
      return respond(
        {
          success: false,
          error: "Transaction reference is missing",
        },
        { status: 400 }
      );
    }

    if (!transaction.reference.startsWith("REVIVE-")) {
      return respond({
        success: true,
        message: "Payment is not a REVIVE recovery transaction",
      });
    }

    if (!validReference(transaction.reference)) {
      return respond(
        {
          success: false,
          error: "Invalid recovery case ID",
        },
        { status: 400 }
      );
    }
    reference = transaction.reference;

    stage = "payment_validation";
    if (transaction.status !== "success") {
      return respond({ success: false, error: "Payment is not successful" }, { status: 400 });
    }
    if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) {
      return respond({ success: false, error: "Invalid payment amount" }, { status: 400 });
    }
    if (transaction.currency !== "NGN") {
      return respond({ success: false, error: "Unexpected payment currency" }, { status: 400 });
    }
    if (transaction.paid_at != null && (
      typeof transaction.paid_at !== "string" ||
      !Number.isFinite(Date.parse(transaction.paid_at))
    )) {
      return respond({ success: false, error: "Invalid payment timestamp" }, { status: 400 });
    }
    const recoveredAt = transaction.paid_at ?? new Date().toISOString();
    const environment = paymentEnvironment(secretKey);
    if (!environment) return respond({ success: false, error: "Paystack environment is not configured" }, { status: 500 });
    stage = "attempt_lookup";
    const resolved = await db.orm.public.RecoveryPaymentAttempt.where({ reference: transaction.reference }).first();
    if (!resolved) {
      // Acknowledge signed legacy/unrecognized payments, but never infer a case,
      // backfill an attempt, or touch previously recovered demo records.
      return respond({ success: true, ignored: true, manualReviewRequired: true,
        message: "No persisted payment attempt; manual review required" });
    }
    const caseId = resolved.recoveryCaseId;
    recoveryCaseId = caseId;

    stage = "transaction_start";
    const result = await db.transaction(async (tx) => {
      stage = "case_lock";
      // Build the parameterized plan without executing it on the root client.
      // Consume it on this transaction's connection; the lock lasts until commit.
      await tx.query(db.raw.sql`
        SELECT "id" FROM "public"."recoveryCase"
        WHERE "id" = ${caseId} FOR UPDATE
      `.returnsRow({ id: "pg/int4@1" }).build());

      stage = "case_lookup";
      const recoveryCase = await tx.orm.public.RecoveryCase.where({ id: caseId }).first();
      if (!recoveryCase) {
        return { status: 404, body: { success: false, error: "Recovery case not found" } };
      }

      stage = "payment_validation";
      const attempt = await tx.orm.public.RecoveryPaymentAttempt.where({ reference: transaction.reference }).first();
      const error = !attempt ? "Payment attempt not found" :
        bindingError(attempt, recoveryCase, environment) ?? paymentError(attempt, transaction);
      if (error || !attempt) {
        return { status: 400, body: {
          success: false, error: error ?? "Payment attempt not found",
        } };
      }

      // Recheck after taking the row lock, and only after validating payment fields.
      if (recoveryCase.status === "RECOVERED") {
        if (attempt.status !== "SUCCEEDED" && attempt.status !== "RECONCILIATION_REQUIRED") {
          const quarantined = await tx.orm.public.RecoveryPaymentAttempt.where({ id: attempt.id }).update({
            status: "RECONCILIATION_REQUIRED", lastCheckedAt: new Date().toISOString(),
            providerTransactionId: providerId(transaction.id),
          });
          if (!quarantined) throw new Error("Attempt update returned no row");
        }
        return { status: 200, body: {
          success: true, message: "Recovery has already been recorded", recoveryCaseId: caseId,
          manualReviewRequired: attempt.status !== "SUCCEEDED",
        } };
      }
      if (attempt.status === "SUCCEEDED" || attempt.status === "RECONCILIATION_REQUIRED") {
        return { status: 409, body: { success: false, error: "Payment attempt requires manual reconciliation" } };
      }

      stage = "case_update";
      const updatedRecoveryCase = await tx.orm.public.RecoveryCase
        .where({ id: caseId })
        .update({ status: "RECOVERED", recoveredAmount: transaction.amount, recoveredAt });
      if (!updatedRecoveryCase) throw new Error("Recovery update returned no case");

      stage = "attempt_update";
      const updatedAttempt = await tx.orm.public.RecoveryPaymentAttempt.where({ id: attempt.id }).update({
        status: "SUCCEEDED", succeededAt: recoveredAt, lastCheckedAt: new Date().toISOString(),
        providerTransactionId: providerId(transaction.id),
      });
      if (!updatedAttempt) throw new Error("Attempt update returned no row");

      stage = "audit_log_create";
      const activityLog = await tx.orm.public.ActivityLog.create({
        businessId: recoveryCase.businessId,
        userId: null,
        action: "PAYMENT_RECOVERED",
        metadata: {
          recoveryCaseId: caseId,
          paymentAttemptId: attempt.id,
          environment: attempt.environment,
          reference: transaction.reference,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentStatus: transaction.status,
          gatewayResponse: transaction.gateway_response,
          note: "Paystack confirmed successful payment recovery.",
        },
      });

      stage = "transaction_commit";
      return { status: 200, body: {
        success: true,
        message: "Payment recovery recorded successfully",
        recoveryCase: updatedRecoveryCase,
        activityLog,
      } };
    });

    // Report success only after the transaction has committed.
    if (result.body.success) stage = "completed";
    return respond(result.body, { status: result.status });
  } catch {
    return respond(
      {
        success: false,
        error: "Failed to process Paystack webhook",
      },
      { status: 500 }
    );
  }
}
