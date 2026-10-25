import type { Models } from "@/src/prisma/contract";

export type PaymentAttempt = Omit<Models.public_RecoveryPaymentAttempt, "business" | "recoveryCase">;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function paymentEnvironment(secret: string): "test" | "live" | null {
  if (secret.startsWith("sk_test_")) return "test";
  if (secret.startsWith("sk_live_")) return "live";
  return null;
}

// Legacy references allow exact lookup only, never inferred association.
export function validReference(reference: string) {
  const match = /^REVIVE-([1-9]\d*)-(\d+|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(reference);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
}

export function validCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.paystack.com" && !url.username && !url.password;
  } catch { return false; }
}

export function providerId(value: unknown): string | null {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

export function bindingError(
  attempt: PaymentAttempt,
  recoveryCase: { id: number; businessId: number; customerId: number | null },
  environment: "test" | "live",
) {
  if (attempt.recoveryCaseId !== recoveryCase.id || attempt.businessId !== recoveryCase.businessId ||
    attempt.customerId !== recoveryCase.customerId) return "Stored payment case binding is inconsistent";
  if (attempt.environment !== environment) return "Payment environment does not match configuration";
  if (!Number.isSafeInteger(attempt.expectedAmount) || attempt.expectedAmount <= 0 || attempt.expectedCurrency !== "NGN") {
    return "Stored payment expectations are invalid";
  }
  return null;
}

// The saved reference and expectations are authoritative. Metadata is
// supplementary, but any supplied conflicting field fails closed.
export function paymentError(attempt: PaymentAttempt, transaction: Record<string, unknown>) {
  if (transaction.reference !== attempt.reference) return "Payment reference does not match attempt";
  if (!Number.isSafeInteger(transaction.amount) || transaction.amount !== attempt.expectedAmount) return "Payment amount does not match attempt";
  if (transaction.currency !== attempt.expectedCurrency) return "Payment currency does not match attempt";
  if (transaction.domain !== attempt.environment) return "Payment environment does not match attempt";
  if (typeof transaction.status !== "string" || !transaction.status) return "Invalid payment status";
  if (transaction.paid_at != null && (typeof transaction.paid_at !== "string" || !Number.isFinite(Date.parse(transaction.paid_at)))) {
    return "Invalid payment timestamp";
  }
  const id = providerId(transaction.id);
  if (transaction.id != null && !id) return "Invalid provider transaction ID";
  if (attempt.providerTransactionId !== null && attempt.providerTransactionId !== id) return "Provider transaction ID does not match attempt";
  let metadata = transaction.metadata;
  if (typeof metadata === "string" && metadata !== "") {
    try { metadata = JSON.parse(metadata); } catch { return "Invalid recovery metadata"; }
  }
  if (metadata != null && metadata !== "" && !isRecord(metadata)) return "Invalid recovery metadata";
  if (isRecord(metadata)) {
    for (const [key, expected] of [
      ["recoveryCaseId", attempt.recoveryCaseId], ["businessId", attempt.businessId],
      ["customerId", attempt.customerId], ["paymentAttemptId", attempt.id],
      ["source", "REVIVE"], ["environment", attempt.environment],
    ] as const) {
      if (Object.hasOwn(metadata, key) && metadata[key] !== expected &&
        !(typeof expected === "number" && metadata[key] === String(expected))) return "Recovery metadata does not match attempt";
    }
  }
  return null;
}
