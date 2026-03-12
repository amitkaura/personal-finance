"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveBar } from "@nivo/bar";
import { api } from "@/lib/api";
import type { Transaction } from "@/lib/types";

type Granularity = "month" | "quarter" | "year";

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
];

function periodKey(dateStr: string, granularity: Granularity): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();

  switch (granularity) {
    case "month":
      return `${year}-${String(month + 1).padStart(2, "0")}`;
    case "quarter":
      return `${year} Q${Math.floor(month / 3) + 1}`;
    case "year":
      return `${year}`;
  }
}

function periodLabel(key: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [y, m] = key.split("-");
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  return key;
}

function buildChartData(transactions: Transaction[], granularity: Granularity) {
  const buckets = new Map<string, { income: number; expenses: number }>();

  for (const txn of transactions) {
    const key = periodKey(txn.date, granularity);
    const bucket = buckets.get(key) || { income: 0, expenses: 0 };

    // Plaid convention: negative amount = money flowing in (income)
    if (txn.amount < 0) {
      bucket.income += Math.abs(txn.amount);
    } else {
      bucket.expenses += txn.amount;
    }

    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { income, expenses }]) => ({
      period: periodLabel(key, granularity),
      Income: Math.round(income * 100) / 100,
      Expenses: Math.round(-expenses * 100) / 100,
    }));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
}

export default function CashFlowBarChart() {
  const [granularity, setGranularity] = useState<Granularity>("month");

  const { data: transactions } = useQuery({
    queryKey: ["transactions", "all"],
    queryFn: () => api.getTransactions({ limit: 200 }),
  });

  const chartData = transactions
    ? buildChartData(transactions, granularity)
    : [];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Income vs Expenses
        </h3>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {GRANULARITY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setGranularity(value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                granularity === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-80 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No transaction data available.
          </p>
        </div>
      ) : (
        <div className="h-80 mt-4">
          <ResponsiveBar
            data={chartData}
            keys={["Income", "Expenses"]}
            indexBy="period"
            groupMode="grouped"
            margin={{ top: 10, right: 20, bottom: 40, left: 70 }}
            padding={0.3}
            valueScale={{ type: "symlog" }}
            colors={["#22c55e", "#ef4444"]}
            borderRadius={4}
            axisBottom={{
              tickSize: 0,
              tickPadding: 12,
              tickRotation: chartData.length > 8 ? -45 : 0,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              format: (v) => formatCurrency(v as number),
            }}
            enableGridX={false}
            gridYValues={5}
            enableLabel={false}
            tooltip={({ id, value, color }) => (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
                <span
                  className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: color }}
                />
                <span className="font-medium">{id}:</span>{" "}
                {formatCurrency(value as number)}
              </div>
            )}
            theme={{
              text: { fill: "#a1a1aa", fontSize: 11 },
              grid: { line: { stroke: "#27272a" } },
              axis: { ticks: { text: { fill: "#71717a" } } },
            }}
            markers={[
              {
                axis: "y",
                value: 0,
                lineStyle: { stroke: "#3f3f46", strokeWidth: 1 },
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
