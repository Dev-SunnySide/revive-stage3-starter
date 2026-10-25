"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Target,
} from "lucide-react";

export function Dashboard() {
  const [metrics, setMetrics] = useState({
    revenueAtRisk: 0,
    recoveredRevenue: 0,
    failedTransactions: 0,
    successfulTransactions: 0,
    recoveryCases: 0,
    recoveryRate: 0,
  });

  const [opportunities, setOpportunities] = useState<
    {
      id: number;
      reason: string;
      amount: number;
      score: number;
      recommendation: string;
      status: string;
    }[]
  >([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [dashboardResponse, opportunitiesResponse] =
          await Promise.all([
            fetch("/api/dashboard"),
            fetch("/api/opportunities"),
          ]);

        const dashboardData = await dashboardResponse.json();
        const opportunitiesData =
          await opportunitiesResponse.json();

        if (dashboardData.success) {
          setMetrics(dashboardData.metrics);
        }

        if (opportunitiesData.success) {
          setOpportunities(opportunitiesData.opportunities);
        }
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      }
    }

    loadDashboard();
  }, []);

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, Demo Store
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s what&apos;s happening with your revenue today.
        </p>
      </div>

      {/* Dashboard Metrics */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Revenue at Risk */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Revenue at Risk
            </p>

            <AlertCircle
              size={18}
              className="text-rose-500"
            />
          </div>

          <p className="mt-3 text-2xl font-bold">
            ₦{(metrics.revenueAtRisk / 100).toLocaleString()}
          </p>

          <p className="mt-2 text-xs text-rose-600">
            {metrics.failedTransactions} failed transactions
          </p>
        </div>

        {/* Recovered Revenue */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Recovered Revenue
            </p>

            <CheckCircle2
              size={18}
              className="text-emerald-500"
            />
          </div>

          <p className="mt-3 text-2xl font-bold">
            ₦{(metrics.recoveredRevenue / 100).toLocaleString()}
          </p>

          <p className="mt-2 text-xs text-emerald-600">
            Successfully recovered
          </p>
        </div>

        {/* Failed Payments */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Failed Payments
            </p>

            <AlertCircle
              size={18}
              className="text-rose-500"
            />
          </div>

          <p className="mt-3 text-2xl font-bold">
            {metrics.failedTransactions}
          </p>

          <p className="mt-2 text-xs text-rose-600">
            Transactions requiring attention
          </p>
        </div>

        {/* Recovery Rate */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Recovery Rate
            </p>

            <Target
              size={18}
              className="text-indigo-500"
            />
          </div>

          <p className="mt-3 text-2xl font-bold">
            {metrics.recoveryRate}%
          </p>

          <p className="mt-2 text-xs text-indigo-600">
            {metrics.recoveryCases} recovery cases
          </p>
        </div>

      </div>

      {/* Transaction Overview + Recovery Opportunities */}
      <div className="grid xl:grid-cols-5 gap-5">

        {/* Transaction Overview */}
        <section className="xl:col-span-3 rounded-2xl border bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                Transaction Overview
              </h2>

              <p className="text-xs text-gray-500 mt-1">
                Last 7 days
              </p>
            </div>

            <div className="text-xs text-gray-500">
              Successful · Failed
            </div>
          </div>

          <div className="mt-7 h-64 rounded-xl bg-gradient-to-b from-indigo-50/70 to-white relative overflow-hidden">

            <div className="absolute inset-x-5 top-8 border-t border-dashed border-gray-200" />

            <div className="absolute inset-x-5 top-24 border-t border-dashed border-gray-200" />

            <div className="absolute inset-x-5 top-40 border-t border-dashed border-gray-200" />

            <svg
              viewBox="0 0 700 250"
              className="absolute inset-0 h-full w-full p-5"
              preserveAspectRatio="none"
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-indigo-500"
                points="0,180 90,140 180,155 270,100 360,120 450,65 540,72 630,35 700,55"
              />

              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-rose-400"
                points="0,215 90,195 180,210 270,180 360,190 450,155 540,170 630,145 700,125"
              />
            </svg>

          </div>
        </section>

        {/* Recovery Opportunities */}
        <section className="xl:col-span-2 rounded-2xl border bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Top Recovery Opportunities
            </h2>

            <Link
              className="text-xs text-indigo-600"
              href="/opportunities"
            >
              View all
            </Link>
          </div>

          <div className="mt-4 divide-y">

            {opportunities.map((opportunity) => (
              <div
                key={opportunity.id}
                className="py-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {opportunity.reason}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    ₦{(opportunity.amount / 100).toLocaleString()} · Score{" "}
                    {opportunity.score}
                  </p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    opportunity.score >= 90
                      ? "bg-rose-50 text-rose-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {opportunity.score >= 90 ? "High" : "Medium"}
                </span>
              </div>
            ))}

          </div>
        </section>

      </div>
    </div>
  );
}