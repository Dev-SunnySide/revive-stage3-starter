
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Target,
  User,
  CreditCard,
  Brain,
  Zap,
} from "lucide-react";

type Opportunity = {
  id: number;
  status: string;
  reason: string;
  amountAtRisk: number;
  recoveredAmount: number;
  identifiedAt: string;
  recoveredAt: string | null;

  customer: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;

  transaction: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
    createdAt: string;
  } | null;

  recommendation: {
    id: number;
    recommendation: string;
    confidence: number | null;
    reasoning: string | null;
  } | null;

    recoveryAction: {
    id: number;
    type: string;
    status: string;
    message: string | null;
    executedAt: string | null;
  } | null;

  activityLogs: {
    id: number;
    action: string;
    businessId: number;
    userId: number | null;
    metadata: {
      recoveryCaseId?: number;
      recoveryActionId?: number;
      actionType?: string;
      amountAtRisk?: number;
      note?: string;
    } | null;
    createdAt: string;
  }[];
};

function formatAmount(amount: number) {
  return `₦${(amount / 100).toLocaleString()}`;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default function OpportunityDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [opportunity, setOpportunity] =
    useState<Opportunity | null>(null);

  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    async function loadOpportunity() {
      try {
        const { id } = await params;

        const response = await fetch(
          `/api/opportunities/${id}`
        );

        const data = await response.json();

        if (data.success) {
          setOpportunity(data.opportunity);
        }
      } catch (error) {
        console.error(
          "Failed to load opportunity:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadOpportunity();
  }, [params]);

  async function executeRecoveryAction() {
    if (!opportunity) return;

    setExecuting(true);
    setActionMessage("");

    try {
      const response = await fetch(
        `/api/opportunities/${opportunity.id}/recover`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to execute recovery action"
        );
      }

      setOpportunity((current) =>
        current
          ? {
              ...current,
              recoveryAction: current.recoveryAction
                ? {
                    ...current.recoveryAction,
                    status: data.action.status,
                    executedAt: data.action.executedAt,
                  }
                : null,
            }
          : current
      );

      setActionMessage(data.message);
    } catch (error) {
      console.error(
        "Recovery action failed:",
        error
      );

      setActionMessage(
        "Failed to execute recovery action. Please try again."
      );
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-gray-500">
            Loading opportunity...
          </p>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-lg font-semibold">
            Opportunity not found
          </p>

          <Link
            href="/opportunities"
            className="mt-4 inline-flex items-center gap-2 text-sm text-indigo-600"
          >
            <ArrowLeft size={16} />
            Back to opportunities
          </Link>
        </div>
      </div>
    );
  }

  const confidence = opportunity.recommendation?.confidence
    ? Math.round(
        opportunity.recommendation.confidence * 100
      )
    : 0;

  const actionCompleted =
    opportunity.recoveryAction?.status === "COMPLETED";

  return (
    <div className="min-h-screen bg-gray-50 p-5 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* Back navigation */}
        <Link
          href="/opportunities"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Back to opportunities
        </Link>

        {/* Header */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">
              Recovery Opportunity #{opportunity.id}
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              {opportunity.reason}
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Identified by the REVIVE recovery engine.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              confidence >= 90
                ? "bg-rose-50 text-rose-600"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {confidence >= 90
              ? "High Priority"
              : "Medium Priority"}
          </span>
        </div>

        {/* Metrics */}
        <div className="mt-7 grid md:grid-cols-4 gap-4">

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <AlertCircle size={18} />
              <span className="text-xs">
                Amount at Risk
              </span>
            </div>

            <p className="mt-3 text-xl font-bold">
              {formatAmount(
                opportunity.amountAtRisk
              )}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Target size={18} />
              <span className="text-xs">
                AI Recovery Score
              </span>
            </div>

            <p className="mt-3 text-xl font-bold">
              {confidence}/100
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <CheckCircle2 size={18} />
              <span className="text-xs">
                Recovery Status
              </span>
            </div>

            <p className="mt-3 text-sm font-bold">
              {formatStatus(opportunity.status)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Zap size={18} />
              <span className="text-xs">
                Recovered
              </span>
            </div>

            <p className="mt-3 text-xl font-bold">
              {formatAmount(
                opportunity.recoveredAmount
              )}
            </p>
          </div>

        </div>

        {/* Customer + Transaction */}
        <div className="mt-5 grid md:grid-cols-2 gap-5">

          {/* Customer */}
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <User size={18} />
              <h2 className="font-semibold">
                Customer
              </h2>
            </div>

            {opportunity.customer ? (
              <div className="mt-5 space-y-3">

                <div>
                  <p className="text-xs text-gray-400">
                    Name
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {opportunity.customer.name}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Email
                  </p>

                  <p className="mt-1 text-sm">
                    {opportunity.customer.email ??
                      "Not available"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Phone
                  </p>

                  <p className="mt-1 text-sm">
                    {opportunity.customer.phone ??
                      "Not available"}
                  </p>
                </div>

              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                Customer information unavailable.
              </p>
            )}
          </div>

          {/* Transaction */}
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <CreditCard size={18} />
              <h2 className="font-semibold">
                Transaction
              </h2>
            </div>

            {opportunity.transaction ? (
              <div className="mt-5 space-y-3">

                <div>
                  <p className="text-xs text-gray-400">
                    Reference
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {opportunity.transaction.reference}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Amount
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {formatAmount(
                      opportunity.transaction.amount
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Status
                  </p>

                  <p className="mt-1 text-sm">
                    {formatStatus(
                      opportunity.transaction.status
                    )}
                  </p>
                </div>

              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                Transaction information unavailable.
              </p>
            )}
          </div>

        </div>

        {/* AI Recovery Intelligence */}
        <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm">

          <div className="flex items-center gap-2">
            <Brain size={20} />
            <h2 className="font-semibold">
              AI Recovery Intelligence
            </h2>
          </div>

          {opportunity.recommendation ? (
            <div className="mt-5">

              <div className="rounded-xl bg-indigo-50 p-5">

                <p className="text-xs font-medium text-indigo-600">
                  Recommended Action
                </p>

                <p className="mt-2 text-sm text-gray-700">
                  {
                    opportunity.recommendation
                      .recommendation
                  }
                </p>

              </div>

              <div className="mt-5 grid md:grid-cols-2 gap-5">

                <div>
                  <p className="text-xs text-gray-400">
                    AI Confidence
                  </p>

                  <p className="mt-1 text-lg font-bold">
                    {confidence}%
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    AI Reasoning
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {
                      opportunity.recommendation
                        .reasoning ??
                      "No additional reasoning provided."
                    }
                  </p>
                </div>

              </div>

            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              No AI recommendation is available.
            </p>
          )}

        </div>

        {/* Recovery Action */}
        <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm">

          <div className="flex items-center gap-2">
            <Zap size={20} />
            <h2 className="font-semibold">
              Recovery Action
            </h2>
          </div>
                  {/* Recovery Timeline */}
        <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} />
            <h2 className="font-semibold">
              Recovery Timeline
            </h2>
          </div>

          {opportunity.activityLogs.length > 0 ? (
            <div className="mt-6 space-y-6">
              {opportunity.activityLogs.map(
                (log, index) => (
                  <div
                    key={log.id}
                    className="relative flex gap-4"
                  >
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                        <CheckCircle2 size={16} />
                      </div>

                      {index !==
                        opportunity.activityLogs.length - 1 && (
                        <div className="mt-2 h-full w-px bg-gray-200" />
                      )}
                    </div>

                    <div className="pb-2">
                      <p className="text-sm font-semibold">
                        {formatStatus(
                          log.action
                        )}
                      </p>

                      {log.metadata?.note && (
                        <p className="mt-1 text-sm text-gray-500">
                          {log.metadata.note}
                        </p>
                      )}

                      {log.metadata?.actionType && (
                        <p className="mt-2 text-xs text-gray-400">
                          Action:{" "}
                          {formatStatus(
                            log.metadata.actionType
                          )}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-gray-400">
                        {log.createdAt}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="mt-5 text-sm text-gray-500">
              No recovery activity has been recorded yet.
            </p>
          )}
        </div>
          {opportunity.recoveryAction ? (
            <div className="mt-5">

              <div className="grid md:grid-cols-3 gap-5">

                <div>
                  <p className="text-xs text-gray-400">
                    Action Type
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {formatStatus(
                      opportunity.recoveryAction.type
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Action Status
                  </p>

                  <p
                    className={`mt-1 text-sm font-medium ${
                      actionCompleted
                        ? "text-green-600"
                        : "text-amber-600"
                    }`}
                  >
                    {formatStatus(
                      opportunity.recoveryAction.status
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Message
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {
                      opportunity.recoveryAction
                        .message ??
                      "No message created yet."
                    }
                  </p>
                </div>

              </div>

              {opportunity.recoveryAction.executedAt && (
                <div className="mt-5">
                  <p className="text-xs text-gray-400">
                    Executed At
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {
                      opportunity.recoveryAction
                        .executedAt
                    }
                  </p>
                </div>
              )}

            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              No recovery action has been created yet.
            </p>
          )}

          {/* Action result message */}
          {actionMessage && (
            <div
              className={`mt-5 rounded-xl p-4 text-sm ${
                actionCompleted
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {actionMessage}
            </div>
          )}

          {/* Execute action */}
          <div className="mt-6">

            <button
              onClick={executeRecoveryAction}
              disabled={
                executing ||
                actionCompleted ||
                !opportunity.recoveryAction
              }
              className={`rounded-xl px-5 py-3 text-sm font-medium text-white transition ${
                actionCompleted
                  ? "bg-green-600 cursor-not-allowed"
                  : executing
                    ? "bg-indigo-400 cursor-wait"
                    : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {executing
                ? "Executing..."
                : actionCompleted
                  ? "Action Executed"
                  : "Take Recovery Action"}
            </button>

            <p className="mt-2 text-xs text-gray-400">
              This demo records the recovery action as
              initiated. It does not confirm that payment
              has been recovered.
            </p>

          </div>

        </div>

      </div>
    </div>
  );
}
