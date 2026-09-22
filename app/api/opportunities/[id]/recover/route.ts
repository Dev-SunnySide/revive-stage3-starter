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

    // Find the existing recovery action
    const recoveryActions =
      await db.orm.public.RecoveryAction.all();

    const recoveryAction = recoveryActions.find(
      (item) => item.recoveryCaseId === recoveryCase.id
    );

    if (!recoveryAction) {
      return NextResponse.json(
        {
          success: false,
          error: "No recovery action exists for this opportunity",
        },
        { status: 404 }
      );
    }

    // Prevent executing an already completed action
    if (recoveryAction.status === "COMPLETED") {
  const activityLogs =
    await db.orm.public.ActivityLog.all();

  const existingLog = activityLogs.find((log) => {
    if (!log.metadata) return false;

    const metadata = log.metadata as {
      recoveryCaseId?: number;
      recoveryActionId?: number;
    };

    return (
      metadata.recoveryCaseId === recoveryCase.id &&
      metadata.recoveryActionId === recoveryAction.id
    );
  });

  let activityLog = existingLog;

  if (!activityLog) {
    activityLog =
      await db.orm.public.ActivityLog.create({
        businessId: recoveryCase.businessId,
        userId: null,
        action: "RECOVERY_ACTION_EXECUTED",
        metadata: {
          recoveryCaseId: recoveryCase.id,
          recoveryActionId: recoveryAction.id,
          actionType: recoveryAction.type,
          amountAtRisk: recoveryCase.amountAtRisk,
          note:
            "REVIVE initiated the recovery action. Payment recovery has not yet been confirmed.",
        },
      });
  }

  return NextResponse.json({
    success: true,
    message: "Recovery action has already been executed.",
    action: recoveryAction,
    recoveryCase,
    activityLog,
  });
}

    /*
     * Stage 8 is currently a demo-safe simulation.
     *
     * We are recording that REVIVE initiated the
     * recommended recovery action.
     *
     * This does NOT mean the customer's payment
     * has actually been recovered.
     */
    const executedAt = new Date().toISOString();

    // 1. Mark the recovery action as completed
    const updatedAction =
      await db.orm.public.RecoveryAction
        .where({ id: recoveryAction.id })
        .update({
          status: "COMPLETED",
          executedAt,
        });

    // 2. Move the recovery case into IN_PROGRESS
    const updatedRecoveryCase =
      await db.orm.public.RecoveryCase
        .where({ id: recoveryCase.id })
        .update({
          status: "IN_PROGRESS",
        });

    // 3. Create an audit log
    const activityLog =
      await db.orm.public.ActivityLog.create({
        businessId: recoveryCase.businessId,
        userId: null,
        action: "RECOVERY_ACTION_EXECUTED",
        metadata: {
          recoveryCaseId: recoveryCase.id,
          recoveryActionId: recoveryAction.id,
          actionType: recoveryAction.type,
          amountAtRisk: recoveryCase.amountAtRisk,
          note: "REVIVE initiated the recovery action. Payment recovery has not yet been confirmed.",
        },
      });

    return NextResponse.json({
      success: true,
      message: "Recovery action executed successfully.",
      action: updatedAction,
      recoveryCase: updatedRecoveryCase,
      activityLog,
    });
  } catch (error) {
    console.error(
      "Recovery action execution error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute recovery action",
      },
      { status: 500 }
    );
  }
}