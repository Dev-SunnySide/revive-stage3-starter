import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const opportunityId = Number(id);

    if (Number.isNaN(opportunityId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid opportunity ID",
        },
        { status: 400 }
      );
    }

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

    // Find the recovery case
    const recoveryCases =
      await db.orm.public.RecoveryCase.all();

    const recoveryCase = recoveryCases.find(
      (item) => item.id === opportunityId
    );

    if (!recoveryCase) {
      return NextResponse.json(
        {
          success: false,
          error: "Recovery opportunity not found",
        },
        { status: 404 }
      );
    }

    // Find the customer
    const customers =
      await db.orm.public.Customer.all();

    const customer = customers.find(
      (item) => item.id === recoveryCase.customerId
    );

    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer not found",
        },
        { status: 404 }
      );
    }

    if (!customer.email) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer email is required for Paystack checkout",
        },
        { status: 400 }
      );
    }

    if (recoveryCase.amountAtRisk <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Recovery amount must be greater than zero",
        },
        { status: 400 }
      );
    }

    // Create a new unique reference for the recovery payment.
    // Do NOT reuse the original failed transaction reference.
    const reference = `REVIVE-${recoveryCase.id}-${Date.now()}`;

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
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
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error(
        "Paystack initialization failed:",
        paystackData
      );

      return NextResponse.json(
        {
          success: false,
          error:
            paystackData.message ||
            "Failed to initialize Paystack transaction",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      authorizationUrl:
        paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code,
      reference: paystackData.data.reference,
    });
  } catch (error) {
    console.error(
      "Paystack payment initialization error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to initialize recovery payment",
      },
      { status: 500 }
    );
  }
}
