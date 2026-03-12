"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Store,
} from "lucide-react";
import { ResponsiveBar } from "@nivo/bar";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";
import type {
  SpendingByCategory,
  MonthlyTrend,
  TopMerchant,
} from "@/lib/types";

const PERIOD_OPTIONS = [1, 3, 6, 12] as const;

const nivoTheme = {
  text: { fill: "#a1a1aa" },
  axis: {
    ticks: { text: { fill: "#a1a1aa" } },
    legend: { text: { fill: "#a1a1aa" } },
  },
  grid: { line: { stroke: "#27272a" } },
  tooltip: {
    container: {
      background: "#18181b",
      color: "#fafafa",
      border: "1px solid #27272a",
    },
  },
};

const CATEGORY_PALETTE = [
  "#6d28d9", // purple accent
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#22c55e",
  "#34d399",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
];

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[m - 1]} ${y}`;
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-8 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}

function CategoryBarSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-6 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />
  );
}

function MerchantSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const [months, setMonths] = useState(6);

  const { data: spending, isLoading: spendingLoading } = useQuery({
    queryKey: ["spendingByCategory", months, scope],
    queryFn: () => api.getSpendingByCategory(months, scope),
  });

  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: ["monthlyTrends", months, scope],
    queryFn: () => api.getMonthlyTrends(months, scope),
  });

  const { data: topMerchants, isLoading: merchantsLoading } = useQuery({
    queryKey: ["topMerchants", months, scope],
    queryFn: () => api.getTopMerchants(months, 10, scope),
  });

  const chartData = useMemo(() => {
    if (!trends?.length) return [];
    return trends.map((t) => ({
      month: formatMonthLabel(t.month),
      monthKey: t.month,
      Income: t.income,
      Expenses: t.expenses,
    }));
  }, [trends]);

  const maxCategoryAmount = useMemo(() => {
    if (!spending?.categories?.length) return 1;
    return Math.max(
      ...spending.categories.map((c) => c.amount),
      1
    );
  }, [spending]);

  const isLoading = spendingLoading || trendsLoading || merchantsLoading;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Spending analysis and trends over time.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {PERIOD_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                months === m
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m} {m === 1 ? "month" : "months"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : spending ? (
          <>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Income
                </p>
              </div>
              <p className="mt-1 text-2xl font-bold text-emerald-400">
                {formatCurrency(spending.total_income)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-red-500" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Expenses
                </p>
              </div>
              <p className="mt-1 text-2xl font-bold text-red-400">
                {formatCurrency(spending.total_expenses)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                {spending.total_income - spending.total_expenses >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Net
                </p>
              </div>
              <p
                className={`mt-1 text-2xl font-bold ${
                  spending.total_income - spending.total_expenses >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {formatCurrency(spending.total_income - spending.total_expenses)}
              </p>
            </div>
          </>
        ) : null}
      </div>

      {/* Category spending breakdown */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-6 text-sm font-semibold text-foreground">
          Category Spending
        </h2>
        {spendingLoading ? (
          <CategoryBarSkeleton />
        ) : spending?.categories?.length ? (
          <div className="space-y-4">
            {spending.categories.map((cat, idx) => (
              <div key={cat.category} className="flex items-center gap-4">
                <span
                  className="min-w-[140px] text-sm font-medium"
                  title={cat.category}
                >
                  {cat.category.length > 18
                    ? `${cat.category.slice(0, 18)}…`
                    : cat.category}
                </span>
                <div className="relative h-8 flex-1 min-w-0 overflow-hidden rounded-lg bg-muted">
                  <div
                    className="h-full rounded-lg transition-all"
                    style={{
                      width: `${(cat.amount / maxCategoryAmount) * 100}%`,
                      backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
                    }}
                  />
                </div>
                <span className="min-w-[70px] text-right text-sm font-medium tabular-nums">
                  {formatCurrency(cat.amount)}
                </span>
                <span className="min-w-[48px] text-right text-xs text-muted-foreground tabular-nums">
                  {cat.percent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No spending data for this period.
          </p>
        )}
      </div>

      {/* Monthly income vs expenses trend */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-6 text-sm font-semibold text-foreground">
          Monthly Income vs Expenses
        </h2>
        {trendsLoading ? (
          <ChartSkeleton />
        ) : chartData.length > 0 ? (
          <div className="h-80">
            <ResponsiveBar
              data={chartData}
              keys={["Income", "Expenses"]}
              indexBy="month"
              groupMode="grouped"
              margin={{ top: 10, right: 20, bottom: 50, left: 70 }}
              padding={0.3}
              valueScale={{ type: "linear" }}
              colors={["#22c55e", "#ef4444"]}
              borderRadius={4}
              axisBottom={{
                tickSize: 0,
                tickPadding: 12,
                tickRotation: chartData.length > 6 ? -45 : 0,
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
                format: (v) => formatCurrency(v as number),
              }}
              enableGridX={false}
              gridYValues={5}
              enableLabel={false}
              theme={nivoTheme}
              tooltip={({ id, value, color }) => (
                <div
                  className="rounded-lg border px-3 py-2 text-xs shadow-xl"
                  style={{
                    background: "#18181b",
                    color: "#fafafa",
                    borderColor: "#27272a",
                  }}
                >
                  <span
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: color }}
                  />
                  <span className="font-medium">{id}:</span>{" "}
                  {formatCurrency(value as number)}
                </div>
              )}
            />
          </div>
        ) : (
          <div className="flex h-80 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No trend data for this period.
            </p>
          </div>
        )}
      </div>

      {/* Top Merchants */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-6 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Store className="h-4 w-4" />
          Top Merchants
        </h2>
        {merchantsLoading ? (
          <MerchantSkeleton />
        ) : topMerchants?.length ? (
          <div className="space-y-4">
            {topMerchants.map((m) => (
              <div
                key={m.merchant}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.merchant}</p>
                  {m.category && (
                    <p className="text-xs text-muted-foreground">{m.category}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium tabular-nums text-red-400">
                    {formatCurrency(m.total)}
                  </span>
                  <span className="text-muted-foreground">
                    {m.count} transaction{m.count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No merchant data for this period.
          </p>
        )}
      </div>
    </div>
  );
}
