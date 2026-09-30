import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference } = await params;

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

    // Verify the transaction with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error(
        "Paystack verification failed:",
        paystackData
      );

      return NextResponse.json(
        {
          success: false,
          error:
            paystackData.message ||
            "Failed to verify Paystack transaction",
        },
        { status: 502 }
      );
    }

    const transaction = paystackData.data;

    // Find the REVIVE recovery case associated
    // with this payment reference.
    const recoveryReference = reference;

    const recoveryCases =
      await db.orm.public.RecoveryCase.all();

    const recoveryCaseIdMatch =
      recoveryReference.match(/^REVIVE-(\d+)-/);

    if (!recoveryCaseIdMatch) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid REVIVE recovery reference",
        },
        { status: 400 }
      );
    }

    const recoveryCaseId = Number(
      recoveryCaseIdMatch[1]
    );

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

    const paymentSuccessful =
      transaction.status === "success";

    return NextResponse.json({
      success: true,
      payment: {
        status: transaction.status,
        reference: transaction.reference,
        amount: transaction.amount,
        currency: transaction.currency,
        paidAt: transaction.paid_at,
        gatewayResponse: transaction.gateway_response,
      },
      recoveryCase: {
        id: recoveryCase.id,
        status: recoveryCase.status,
        amountAtRisk: recoveryCase.amountAtRisk,
        recoveredAmount: recoveryCase.recoveredAmount,
      },
      paymentSuccessful,
    });
  } catch (error) {
    console.error(
      "Paystack transaction verification error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify transaction",
      },
      { status: 500 }
    );
  }
}
