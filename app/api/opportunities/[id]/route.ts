
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function GET(
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

    // Load related data
    const customers =
      await db.orm.public.Customer.all();

    const transactions =
      await db.orm.public.Transaction.all();

    const recommendations =
      await db.orm.public.AIRecommendation.all();

    const actions =
      await db.orm.public.RecoveryAction.all();

    const activityLogs =
      await db.orm.public.ActivityLog.all();

    // Match related records
    const customer = customers.find(
      (item) => item.id === recoveryCase.customerId
    );

    const transaction = transactions.find(
      (item) => item.id === recoveryCase.transactionId
    );

    const recommendation =
      recommendations.find(
        (item) =>
          item.recoveryCaseId === recoveryCase.id
      );

    const recoveryAction =
      actions.find(
        (item) =>
          item.recoveryCaseId === recoveryCase.id
      );

    // ActivityLog currently stores the recovery case
    // ID inside metadata, so we filter against it.
    const opportunityActivityLogs =
      activityLogs.filter((log) => {
        if (!log.metadata) return false;

        const metadata = log.metadata as {
          recoveryCaseId?: number;
        };

        return (
          metadata.recoveryCaseId === recoveryCase.id
        );
      });

    return NextResponse.json({
      success: true,

      opportunity: {
        id: recoveryCase.id,
        status: recoveryCase.status,
        reason: recoveryCase.reason,
        amountAtRisk: recoveryCase.amountAtRisk,
        recoveredAmount: recoveryCase.recoveredAmount,
        identifiedAt: recoveryCase.identifiedAt,
        recoveredAt: recoveryCase.recoveredAt,

        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            }
          : null,

        transaction: transaction
          ? {
              id: transaction.id,
              reference: transaction.reference,
              amount: transaction.amount,
              currency: transaction.currency,
              status: transaction.status,
              paidAt: transaction.paidAt,
              createdAt: transaction.createdAt,
            }
          : null,

        recommendation: recommendation
          ? {
              id: recommendation.id,
              recommendation:
                recommendation.recommendation,
              confidence:
                recommendation.confidence,
              reasoning:
                recommendation.reasoning,
            }
          : null,

        recoveryAction: recoveryAction
          ? {
              id: recoveryAction.id,
              type: recoveryAction.type,
              status: recoveryAction.status,
              message: recoveryAction.message,
              executedAt:
                recoveryAction.executedAt,
            }
          : null,

        activityLogs: opportunityActivityLogs,
      },
    });
  } catch (error) {
    console.error(
      "Opportunity details error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load opportunity",
      },
      { status: 500 }
    );
  }
}