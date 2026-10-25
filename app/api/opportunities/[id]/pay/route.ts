import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const opportunityId = Number(id);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(opportunityId) || opportunityId <= 0 || opportunityId > 2147483647) {
      return NextResponse.json({ success: false, error: "Invalid opportunity ID" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // Share the webhook's row lock so recovery cannot race this state guard.
      await tx.query(db.raw.sql`
        SELECT "id" FROM "public"."recoveryCase"
        WHERE "id" = ${opportunityId} FOR UPDATE
      `.returnsRow({ id: "pg/int4@1" }).build());
      const recoveryCase = await tx.orm.public.RecoveryCase.where({ id: opportunityId }).first();
      if (!recoveryCase) {
        return { status: 404, body: { success: false, error: "Recovery opportunity not found" } };
      }
      if (recoveryCase.status === "RECOVERED") {
        return { status: 409, body: { success: false, error: "Recovery case has already been recovered" } };
      }

      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!secretKey) {
        return { status: 500, body: { success: false, error: "Paystack secret key is not configured" } };
      }
      const customer = recoveryCase.customerId === null ? null :
        await tx.orm.public.Customer.where({ id: recoveryCase.customerId }).first();
      if (!customer || customer.businessId !== recoveryCase.businessId) {
        return { status: 404, body: { success: false, error: "Customer not found" } };
      }
      if (!customer.email) {
        return { status: 400, body: { success: false, error: "Customer email is required for Paystack checkout" } };
      }
      if (!Number.isSafeInteger(recoveryCase.amountAtRisk) || recoveryCase.amountAtRisk <= 0) {
        return { status: 400, body: { success: false, error: "Recovery amount must be a positive integer" } };
      }

      const reference = `REVIVE-${recoveryCase.id}-${Date.now()}`;
      // Until attempts can be reserved durably, keep the lock during initialization.
      // Bound the HTTP request so it cannot hold this lock indefinitely.
      const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          email: customer.email,
          amount: String(recoveryCase.amountAtRisk),
          currency: "NGN",
          reference,
          metadata: JSON.stringify({
            recoveryCaseId: recoveryCase.id,
            businessId: recoveryCase.businessId,
            customerId: recoveryCase.customerId,
            source: "REVIVE",
          }),
        }),
      });
      const paystackData = await paystackResponse.json();
      if (!paystackResponse.ok || paystackData?.status !== true ||
        paystackData.data?.reference !== reference ||
        typeof paystackData.data?.authorization_url !== "string" || !paystackData.data.authorization_url ||
        typeof paystackData.data?.access_code !== "string" || !paystackData.data.access_code) {
        console.error("Paystack initialization failed", { status: paystackResponse.status });
        return { status: 502, body: { success: false, error: "Failed to initialize Paystack transaction" } };
      }
      return { status: 200, body: {
        success: true,
        authorizationUrl: paystackData.data.authorization_url,
        accessCode: paystackData.data.access_code,
        reference: paystackData.data.reference,
      } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    console.error("Recovery payment initialization failed");
    return NextResponse.json({ success: false, error: "Failed to initialize recovery payment" }, { status: 500 });
  }
}
