import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export async function GET() {
  try {
    const recoveryCases = await db.orm.public.RecoveryCase.all();
    const recommendations = await db.orm.public.AIRecommendation.all();

    const opportunities = recoveryCases
      .filter((recoveryCase) => recoveryCase.status !== "RECOVERED")
      .map((recoveryCase) => {
        const recommendation = recommendations.find(
          (item) => item.recoveryCaseId === recoveryCase.id
        );

        const score = recommendation?.confidence
          ? Math.round(recommendation.confidence * 100)
          : 0;

        return {
          id: recoveryCase.id,
          reason: recoveryCase.reason,
          amount: recoveryCase.amountAtRisk,
          score,
          recommendation:
            recommendation?.recommendation ??
            "Review payment recovery",
          status: recoveryCase.status,
        };
      })
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      opportunities,
    });
  } catch (error) {
    console.error("Recovery opportunities error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load recovery opportunities",
      },
      { status: 500 }
    );
  }
}