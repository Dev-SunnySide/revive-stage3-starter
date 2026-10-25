import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesId(value: unknown, expected: number | null) {
  return value === expected || (expected !== null && value === String(expected));
}

function reject(error: string, status: number) {
  return NextResponse.json({ success: false, paymentSuccessful: false, error }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference } = await params;
    const match = /^REVIVE-([1-9]\d*)-(\d+)$/.exec(reference);
    const recoveryCaseId = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(recoveryCaseId) || recoveryCaseId <= 0 || recoveryCaseId > 2147483647) {
      return reject("Invalid REVIVE recovery reference", 400);
    }
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return reject("Paystack secret key is not configured", 500);

    const recoveryCase = await db.orm.public.RecoveryCase.where({ id: recoveryCaseId }).first();
    if (!recoveryCase) return reject("Recovery case not found", 404);
    const originalTransaction = await db.orm.public.Transaction.where({ id: recoveryCase.transactionId }).first();
    if (!originalTransaction || originalTransaction.businessId !== recoveryCase.businessId ||
      (recoveryCase.customerId !== null && originalTransaction.customerId !== null &&
        originalTransaction.customerId !== recoveryCase.customerId)) {
      return reject("Recovery case transaction binding is inconsistent", 409);
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );
    const provider: unknown = await paystackResponse.json();
    if (!paystackResponse.ok || !isRecord(provider) || provider.status !== true || !isRecord(provider.data)) {
      console.error("Paystack verification failed", { status: paystackResponse.status });
      return reject("Failed to verify Paystack transaction", 502);
    }
    const transaction = provider.data;
    if (transaction.reference !== reference) return reject("Paystack transaction reference does not match request", 409);
    if (typeof transaction.status !== "string" || !transaction.status) {
      return reject("Invalid Paystack transaction status", 502);
    }
    if (typeof transaction.amount !== "number" || !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0 ||
      transaction.amount !== recoveryCase.amountAtRisk) {
      return reject("Payment amount does not match recovery amount", 409);
    }
    // Recovery initialization currently supports NGN. Read its expected currency
    // from the original transaction instead of trusting the provider response.
    if (originalTransaction.currency !== "NGN" || transaction.currency !== originalTransaction.currency) {
      return reject("Payment currency does not match recovery currency", 409);
    }

    let metadata: unknown = transaction.metadata;
    if (typeof metadata === "string" && metadata !== "") {
      try { metadata = JSON.parse(metadata); }
      catch { return reject("Invalid Paystack recovery metadata", 409); }
    }
    if (metadata != null && metadata !== "" && !isRecord(metadata)) {
      return reject("Invalid Paystack recovery metadata", 409);
    }
    let providerMetadataChecked = false;
    if (isRecord(metadata)) {
      for (const [key, expected] of [
        ["recoveryCaseId", recoveryCase.id],
        ["businessId", recoveryCase.businessId],
        ["customerId", recoveryCase.customerId],
      ] as const) {
        if (Object.hasOwn(metadata, key)) {
          providerMetadataChecked = true;
          if (!matchesId(metadata[key], expected)) return reject("Paystack recovery metadata does not match case", 409);
        }
      }
      if (Object.hasOwn(metadata, "source") && metadata.source !== "REVIVE") {
        return reject("Unexpected Paystack recovery source", 409);
      }
    }

    // This schema has no initialized recovery-payment reference. Only validate
    // exact-reference evidence if it already exists; never create or infer it.
    const storedTransaction = await db.orm.public.Transaction.where({ reference }).first();
    if (storedTransaction && (storedTransaction.id !== recoveryCase.transactionId ||
      storedTransaction.businessId !== recoveryCase.businessId ||
      storedTransaction.amount !== transaction.amount || storedTransaction.currency !== transaction.currency)) {
      return reject("Stored payment transaction does not match recovery case", 409);
    }
    const recoveryLogs = await db.orm.public.ActivityLog.where({ action: "PAYMENT_RECOVERED" }).all();
    const matchingLogs = recoveryLogs.filter(log => isRecord(log.metadata) && log.metadata.reference === reference);
    for (const log of matchingLogs) {
      const value = log.metadata;
      if (!isRecord(value) || log.businessId !== recoveryCase.businessId ||
        !matchesId(value.recoveryCaseId, recoveryCase.id) ||
        (Object.hasOwn(value, "amount") && value.amount !== transaction.amount) ||
        (Object.hasOwn(value, "currency") && value.currency !== transaction.currency) ||
        (Object.hasOwn(value, "paymentStatus") && value.paymentStatus !== "success")) {
        return reject("Stored recovery audit does not match payment", 409);
      }
    }

    const paymentSuccessful = transaction.status === "success";
    return NextResponse.json({
      success: true,
      paymentSuccessful,
      payment: {
        status: transaction.status,
        reference: transaction.reference,
        amount: transaction.amount,
        currency: transaction.currency,
        paidAt: typeof transaction.paid_at === "string" ? transaction.paid_at : null,
        gatewayResponse: typeof transaction.gateway_response === "string" ? transaction.gateway_response : null,
      },
      recoveryCase: {
        id: recoveryCase.id,
        status: recoveryCase.status,
        amountAtRisk: recoveryCase.amountAtRisk,
        recoveredAmount: recoveryCase.recoveredAmount,
      },
      validation: {
        referenceMatches: true,
        statusSuccessful: paymentSuccessful,
        amountMatches: true,
        currencyMatches: true,
        caseAssociation: "reference_case_id",
        providerMetadataChecked,
        storedPaymentBinding: matchingLogs.length > 0 ? "recovery_audit_log" : storedTransaction ? "transaction" : null,
        initializedPaymentBindingStored: false,
        expectedAmountSource: "current_recovery_case",
      },
    });
  } catch {
    console.error("Paystack transaction verification failed");
    return reject("Failed to verify transaction", 500);
  }
}
