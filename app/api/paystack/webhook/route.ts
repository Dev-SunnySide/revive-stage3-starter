import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function POST(request: Request) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Paystack secret key is not configured",
        },
        { status: 500 }
      );
    }

    // Read the raw request body.
    // Paystack's signature is calculated from the raw payload.
    const rawBody = await request.text();

    const signature = request.headers.get(
      "x-paystack-signature"
    );

    if (!signature) {
      return NextResponse.json(
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
      signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

    if (!signaturesMatch) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Paystack signature",
        },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody);

    // We only process successful charges.
    if (event.event !== "charge.success") {
      return NextResponse.json({
        success: true,
        message: "Event received but no action required",
      });
    }

    const transaction = event.data;

    if (!transaction?.reference) {
      return NextResponse.json(
        {
          success: false,
          error: "Transaction reference is missing",
        },
        { status: 400 }
      );
    }

    // REVIVE recovery references follow:
    // REVIVE-{recoveryCaseId}-{timestamp}
    const match = transaction.reference.match(
      /^REVIVE-(\d+)-/
    );

    if (!match) {
      return NextResponse.json({
        success: true,
        message: "Payment is not a REVIVE recovery transaction",
      });
    }

    const recoveryCaseId = Number(match[1]);

    if (Number.isNaN(recoveryCaseId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid recovery case ID",
        },
        { status: 400 }
      );
    }

    // Find the recovery case.
    const recoveryCases =
      await db.orm.public.RecoveryCase.all();

    const recoveryCase = recoveryCases.find(
      (item) => item.id === recoveryCaseId
    );

    if (!recoveryCase) {
      return NextResponse.json(
        {
          success: false,
          error: "Recovery case not found",
        },
        { status: 404 }
      );
    }

    // Idempotency:
    // If Paystack sends the same event again, don't
    // credit the recovery twice.
    if (recoveryCase.status === "RECOVERED") {
      return NextResponse.json({
        success: true,
        message: "Recovery has already been recorded",
        recoveryCaseId,
      });
    }

    // Verify the payment amount before recording recovery.
    if (
      transaction.amount !==
      recoveryCase.amountAtRisk
    ) {
      console.error(
        "Recovery amount mismatch:",
        {
          expected: recoveryCase.amountAtRisk,
          received: transaction.amount,
          reference: transaction.reference,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: "Payment amount does not match recovery amount",
        },
        { status: 400 }
      );
    }

    // Verify currency.
    if (transaction.currency !== "NGN") {
      return NextResponse.json(
        {
          success: false,
          error: "Unexpected payment currency",
        },
        { status: 400 }
      );
    }

    const recoveredAt =
      transaction.paid_at ??
      new Date().toISOString();

    // Mark recovery case as recovered.
    const updatedRecoveryCase =
      await db.orm.public.RecoveryCase
        .where({ id: recoveryCase.id })
        .update({
          status: "RECOVERED",
          recoveredAmount: transaction.amount,
          recoveredAt,
        });

    // Record the successful recovery in the audit trail.
    const activityLog =
      await db.orm.public.ActivityLog.create({
        businessId: recoveryCase.businessId,
        userId: null,
        action: "PAYMENT_RECOVERED",
        metadata: {
          recoveryCaseId: recoveryCase.id,
          reference: transaction.reference,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentStatus: transaction.status,
          gatewayResponse:
            transaction.gateway_response,
          note:
            "Paystack confirmed successful payment recovery.",
        },
      });

    return NextResponse.json({
      success: true,
      message: "Payment recovery recorded successfully",
      recoveryCase: updatedRecoveryCase,
      activityLog,
    });
  } catch (error) {
    console.error(
      "Paystack webhook error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process Paystack webhook",
      },
      { status: 500 }
    );
  }
}
