"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveBar } from "@nivo/bar";
import { api } from "@/lib/api";
import { useFormatCurrency } from "@/lib/hooks";
import type { Transaction } from "@/lib/types";

type Granularity = "month" | "quarter" | "year";

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

export default function CashFlowBarChart() {
  const formatCurrency = useFormatCurrency();
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const { data: transactions } = useQuery({
    queryKey: ["transactions", "all"],
    queryFn: () => api.getTransactions({ limit: 200 }),
  });

  const availableYears = useMemo(() => {
    if (!transactions) return [];
    const years = new Set(transactions.map((t) => new Date(t.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  const monthsForQuarter = useMemo(() => {
    if (selectedQuarter === null) return Array.from({ length: 12 }, (_, i) => i);
    const start = (selectedQuarter - 1) * 3;
    return [start, start + 1, start + 2];
  }, [selectedQuarter]);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      const d = new Date(t.date);
      if (selectedYear !== null && d.getFullYear() !== selectedYear) return false;
      if (selectedQuarter !== null && Math.floor(d.getMonth() / 3) + 1 !== selectedQuarter) return false;
      if (selectedMonth !== null && d.getMonth() !== selectedMonth) return false;
      return true;
    });
  }, [transactions, selectedYear, selectedQuarter, selectedMonth]);

  const chartData = buildChartData(filteredTransactions, granularity);

  function handleGranularityChange(g: Granularity) {
    setGranularity(g);
    if (g === "year") {
      setSelectedQuarter(null);
      setSelectedMonth(null);
    } else if (g === "quarter") {
      setSelectedMonth(null);
    }
  }

  function handleYearChange(value: string) {
    setSelectedYear(value === "" ? null : parseInt(value));
    setSelectedQuarter(null);
    setSelectedMonth(null);
  }

  function handleQuarterChange(value: string) {
    setSelectedQuarter(value === "" ? null : parseInt(value));
    setSelectedMonth(null);
  }

  const selectClass =
    "rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";

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
              onClick={() => handleGranularityChange(value)}
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

      <div className="mt-3 flex items-center gap-2">
        <select
          value={selectedYear ?? ""}
          onChange={(e) => handleYearChange(e.target.value)}
          className={selectClass}
        >
          <option value="">All Years</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {granularity !== "year" && (
          <select
            value={selectedQuarter ?? ""}
            onChange={(e) => handleQuarterChange(e.target.value)}
            className={selectClass}
          >
            <option value="">All Quarters</option>
            <option value="1">Q1 (Jan – Mar)</option>
            <option value="2">Q2 (Apr – Jun)</option>
            <option value="3">Q3 (Jul – Sep)</option>
            <option value="4">Q4 (Oct – Dec)</option>
          </select>
        )}

        {granularity === "month" && (
          <select
            value={selectedMonth ?? ""}
            onChange={(e) => setSelectedMonth(e.target.value === "" ? null : parseInt(e.target.value))}
            className={selectClass}
          >
            <option value="">All Months</option>
            {monthsForQuarter.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES[m]}</option>
            ))}
          </select>
        )}
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
            groupMode="stacked"
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
              format: (v) => formatCurrency(Math.abs(v as number)),
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
                {formatCurrency(Math.abs(value as number))}
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
