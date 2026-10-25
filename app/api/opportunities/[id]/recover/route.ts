import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
      // Serialize with the webhook, then read the current state under the lock.
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

      const recoveryAction = await tx.orm.public.RecoveryAction.where({ recoveryCaseId: recoveryCase.id }).first();
      if (!recoveryAction) {
        return { status: 404, body: { success: false, error: "No recovery action exists for this opportunity" } };
      }
      const metadata = {
        recoveryCaseId: recoveryCase.id,
        recoveryActionId: recoveryAction.id,
        actionType: recoveryAction.type,
        amountAtRisk: recoveryCase.amountAtRisk,
        note: "REVIVE initiated the recovery action. Payment recovery has not yet been confirmed.",
      };
      if (recoveryAction.status === "COMPLETED") {
        const logs = await tx.orm.public.ActivityLog.where({ businessId: recoveryCase.businessId, action: "RECOVERY_ACTION_EXECUTED" }).all();
        const existingLog = logs.find((log) => {
          const value: unknown = log.metadata;
          return isRecord(value) &&
            value.recoveryCaseId === recoveryCase.id &&
            value.recoveryActionId === recoveryAction.id;
        });
        const activityLog = existingLog ?? await tx.orm.public.ActivityLog.create({
          businessId: recoveryCase.businessId, userId: null, action: "RECOVERY_ACTION_EXECUTED", metadata,
        });
        return { status: 200, body: {
          success: true, message: "Recovery action has already been executed.",
          action: recoveryAction, recoveryCase, activityLog,
        } };
      }

      // Action execution is not payment confirmation. Commit these writes together.
      const updatedAction = await tx.orm.public.RecoveryAction.where({ id: recoveryAction.id })
        .update({ status: "COMPLETED", executedAt: new Date().toISOString() });
      if (!updatedAction) throw new Error("Recovery action update returned no action");
      const updatedRecoveryCase = await tx.orm.public.RecoveryCase.where({ id: recoveryCase.id })
        .update({ status: "IN_PROGRESS" });
      if (!updatedRecoveryCase) throw new Error("Recovery update returned no case");
      const activityLog = await tx.orm.public.ActivityLog.create({
        businessId: recoveryCase.businessId, userId: null, action: "RECOVERY_ACTION_EXECUTED", metadata,
      });
      return { status: 200, body: {
        success: true, message: "Recovery action executed successfully.",
        action: updatedAction, recoveryCase: updatedRecoveryCase, activityLog,
      } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    console.error("Recovery action execution failed");
    return NextResponse.json({ success: false, error: "Failed to execute recovery action" }, { status: 500 });
  }
}
