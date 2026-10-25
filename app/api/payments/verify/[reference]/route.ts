import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { bindingError, isRecord, paymentEnvironment, paymentError, validReference } from "@/src/payments/attempt";

function matchesId(value: unknown, expected: number | null) {
  return value === expected || (expected !== null && value === String(expected));
}

function reject(error: string, status: number) {
  return NextResponse.json({ success: false, paymentSuccessful: false, error }, { status });
}

// Verification reports provider evidence only. It never updates attempts,
// recovery cases, audit records, or legacy records.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    if (!validReference(reference)) return reject("Invalid REVIVE recovery reference", 400);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const environment = secret ? paymentEnvironment(secret) : null;
    if (!secret || !environment) return reject("Paystack environment is not configured", 500);

    const attempt = await db.orm.public.RecoveryPaymentAttempt.where({ reference }).first();
    if (!attempt) return reject("No persisted payment attempt; legacy payment requires manual review", 409);
    const recoveryCase = await db.orm.public.RecoveryCase.where({ id: attempt.recoveryCaseId }).first();
    if (!recoveryCase) return reject("Recovery case not found", 404);
    const binding = bindingError(attempt, recoveryCase, environment);
    if (binding) return reject(binding, 409);
    const originalTransaction = await db.orm.public.Transaction.where({ id: recoveryCase.transactionId }).first();
    if (!originalTransaction || originalTransaction.businessId !== attempt.businessId ||
      originalTransaction.currency !== attempt.expectedCurrency ||
      (attempt.customerId !== null && originalTransaction.customerId !== null &&
        originalTransaction.customerId !== attempt.customerId)) {
      return reject("Recovery case transaction binding is inconsistent", 409);
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET", headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const provider: unknown = await response.json();
    if (!response.ok || !isRecord(provider) || provider.status !== true || !isRecord(provider.data)) {
      return reject("Failed to verify Paystack transaction", 502);
    }
    const transaction = provider.data;
    if (typeof transaction.status !== "string" || !transaction.status) return reject("Invalid Paystack transaction status", 502);
    const error = paymentError(attempt, transaction);
    if (error) return reject(error, 409);

    // Preserve Phase 1 checks on any pre-existing exact-reference evidence.
    const storedTransaction = await db.orm.public.Transaction.where({ reference }).first();
    if (storedTransaction && (storedTransaction.id !== recoveryCase.transactionId ||
      storedTransaction.businessId !== attempt.businessId ||
      storedTransaction.amount !== attempt.expectedAmount || storedTransaction.currency !== attempt.expectedCurrency)) {
      return reject("Stored payment transaction does not match recovery case", 409);
    }
    const logs = await db.orm.public.ActivityLog.where({ action: "PAYMENT_RECOVERED" }).all();
    const matchingLogs = logs.filter(log => isRecord(log.metadata) && log.metadata.reference === reference);
    for (const log of matchingLogs) {
      const value = log.metadata;
      if (!isRecord(value) || log.businessId !== attempt.businessId || !matchesId(value.recoveryCaseId, attempt.recoveryCaseId) ||
        (Object.hasOwn(value, "paymentAttemptId") && !matchesId(value.paymentAttemptId, attempt.id)) ||
        (Object.hasOwn(value, "environment") && value.environment !== attempt.environment) ||
        (Object.hasOwn(value, "amount") && value.amount !== attempt.expectedAmount) ||
        (Object.hasOwn(value, "currency") && value.currency !== attempt.expectedCurrency) ||
        (Object.hasOwn(value, "paymentStatus") && value.paymentStatus !== "success")) {
        return reject("Stored recovery audit does not match payment", 409);
      }
    }
    const paymentSuccessful = transaction.status === "success";
    return NextResponse.json({
      success: true, paymentSuccessful,
      payment: { status: transaction.status, reference, amount: transaction.amount, currency: transaction.currency,
        paidAt: typeof transaction.paid_at === "string" ? transaction.paid_at : null,
        gatewayResponse: typeof transaction.gateway_response === "string" ? transaction.gateway_response : null },
      recoveryCase: { id: recoveryCase.id, status: recoveryCase.status, amountAtRisk: recoveryCase.amountAtRisk, recoveredAmount: recoveryCase.recoveredAmount },
      attempt: { id: attempt.id, status: attempt.status, environment: attempt.environment },
      validation: { referenceMatches: true, statusSuccessful: paymentSuccessful, amountMatches: true, currencyMatches: true,
        environmentMatches: true, caseAssociation: "persisted_payment_attempt",
        storedPaymentBinding: "payment_attempt", initializedPaymentBindingStored: true, expectedAmountSource: "payment_attempt",
        recoveryAuditPresent: matchingLogs.length > 0, originalTransactionReferenceMatches: storedTransaction !== null },
    });
  } catch {
    console.error("Paystack transaction verification failed");
    return reject("Failed to verify transaction", 500);
  }
}
