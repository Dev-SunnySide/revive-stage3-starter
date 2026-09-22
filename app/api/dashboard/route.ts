import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function GET() {
  try {
    const transactions = await db.orm.public.Transaction.all();
    const recoveryCases = await db.orm.public.RecoveryCase.all();

    const failedTransactions = transactions.filter(
      (transaction) => transaction.status === "FAILED"
    );

    const successfulTransactions = transactions.filter(
      (transaction) => transaction.status === "SUCCESSFUL"
    );

    const revenueAtRisk = recoveryCases
      .filter((recoveryCase) => recoveryCase.status !== "RECOVERED")
      .reduce(
        (total, recoveryCase) => total + recoveryCase.amountAtRisk,
        0
      );

    const recoveredRevenue = recoveryCases.reduce(
      (total, recoveryCase) => total + recoveryCase.recoveredAmount,
      0
    );

    const totalRecoveryOpportunity = recoveryCases.reduce(
      (total, recoveryCase) => total + recoveryCase.amountAtRisk,
      0
    );

    const recoveryRate =
      totalRecoveryOpportunity > 0
        ? (recoveredRevenue / totalRecoveryOpportunity) * 100
        : 0;

    return NextResponse.json({
      success: true,
      metrics: {
        revenueAtRisk,
        recoveredRevenue,
        failedTransactions: failedTransactions.length,
        successfulTransactions: successfulTransactions.length,
        recoveryCases: recoveryCases.length,
        recoveryRate: Number(recoveryRate.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load dashboard metrics",
      },
      { status: 500 }
    );
  }
}