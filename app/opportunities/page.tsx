
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

type Opportunity = {
  id: number;
  reason: string;
  amount: number;
  score: number;
  recommendation: string;
  status: string;
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOpportunities() {
      try {
        const response = await fetch("/api/opportunities");
        const data = await response.json();

        if (data.success) {
          setOpportunities(data.opportunities);
        }
      } catch (error) {
        console.error(
          "Failed to load opportunities:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadOpportunities();
  }, []);

  const potentialRecovery = opportunities.reduce(
    (total, opportunity) => total + opportunity.amount,
    0
  );

  const highPriority = opportunities.filter(
    (opportunity) => opportunity.score >= 90
  ).length;

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1">
        <Topbar />

        <main className="p-5 md:p-8 max-w-[1600px]">
          {/* Page Header */}
          <div>
            <h1 className="text-2xl font-bold">
              Recovery Opportunities
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Prioritized opportunities identified by the REVIVE recovery engine.
            </p>
          </div>

          {/* Summary Cards */}
          <div className="mt-7 grid sm:grid-cols-3 gap-4">
            {/* Open Opportunities */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-xs text-gray-500">
                Open opportunities
              </p>

              <p className="mt-2 text-2xl font-bold">
                {opportunities.length}
              </p>
            </div>

            {/* Potential Recovery */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-xs text-gray-500">
                Potential recovery
              </p>

              <p className="mt-2 text-2xl font-bold">
                ₦{(potentialRecovery / 100).toLocaleString()}
              </p>
            </div>

            {/* High Priority */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-xs text-gray-500">
                High priority
              </p>

              <p className="mt-2 text-2xl font-bold">
                {highPriority}
              </p>
            </div>
          </div>

          {/* Opportunities List */}
          <div className="mt-5 rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b font-semibold">
              Prioritized opportunities
            </div>

            {loading ? (
              <div className="p-8 text-sm text-gray-500">
                Loading recovery opportunities...
              </div>
            ) : opportunities.length === 0 ? (
              <div className="p-8 text-sm text-gray-500">
                No recovery opportunities found.
              </div>
            ) : (
              <div className="divide-y">
                {opportunities.map((opportunity) => (
                  <div
                    key={opportunity.id}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Opportunity Information */}
                    <div>
                      <p className="font-medium">
                        {opportunity.reason}
                      </p>

                      <p className="text-sm text-gray-500 mt-1">
                        ₦
                        {(
                          opportunity.amount / 100
                        ).toLocaleString()}{" "}
                        · {opportunity.status}
                      </p>

                      <p className="text-xs text-gray-400 mt-2 max-w-xl">
                        {opportunity.recommendation}
                      </p>
                    </div>

                    {/* Score + Priority + View */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        Score {opportunity.score}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          opportunity.score >= 90
                            ? "bg-rose-50 text-rose-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {opportunity.score >= 90
                          ? "High"
                          : "Medium"}
                      </span>

                      {/* View Opportunity */}
                      <Link
                        href={`/opportunities/${opportunity.id}`}
                        className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-50 transition"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
