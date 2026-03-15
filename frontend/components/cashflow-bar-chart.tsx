"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveBar } from "@nivo/bar";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";
import type { Transaction } from "@/lib/types";

type Granularity = "month" | "quarter" | "year";
type DrillType = "Income" | "Expenses";

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

interface PeriodDatum {
  period: string;
  _periodKey: string;
  Income: number;
  Expenses: number;
  [key: string]: string | number;
}

function buildChartData(transactions: Transaction[], granularity: Granularity): PeriodDatum[] {
  const buckets = new Map<string, { income: number; expenses: number }>();

  for (const txn of transactions) {
    const key = periodKey(txn.date, granularity);
    const bucket = buckets.get(key) || { income: 0, expenses: 0 };

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
      _periodKey: key,
      Income: Math.round(income * 100) / 100,
      Expenses: Math.round(expenses * 100) / 100,
    }));
}

interface CategoryDatum {
  category: string;
  amount: number;
  [key: string]: string | number;
}

function buildCategoryData(
  transactions: Transaction[],
  pKey: string,
  granularity: Granularity,
  drillType: DrillType,
): CategoryDatum[] {
  const isIncome = drillType === "Income";
  const buckets = new Map<string, number>();

  for (const txn of transactions) {
    if (periodKey(txn.date, granularity) !== pKey) continue;
    const matchesType = isIncome ? txn.amount < 0 : txn.amount >= 0;
    if (!matchesType) continue;

    const cat = txn.category || "Uncategorized";
    buckets.set(cat, (buckets.get(cat) || 0) + Math.abs(txn.amount));
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
    }));
}

function getTransactionsForCategory(
  transactions: Transaction[],
  pKey: string,
  granularity: Granularity,
  drillType: DrillType,
  category: string,
): Transaction[] {
  const isIncome = drillType === "Income";

  return transactions
    .filter((txn) => {
      if (periodKey(txn.date, granularity) !== pKey) return false;
      const matchesType = isIncome ? txn.amount < 0 : txn.amount >= 0;
      if (!matchesType) return false;
      return (txn.category || "Uncategorized") === category;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default function CashFlowBarChart() {
  const formatCurrency = useFormatCurrency();
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const [drillLevel, setDrillLevel] = useState<0 | 1 | 2>(0);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>("");
  const [selectedPeriodLabel, setSelectedPeriodLabel] = useState<string>("");
  const [selectedType, setSelectedType] = useState<DrillType>("Expenses");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const scope = useScope();
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", "all", scope],
    queryFn: () => api.getAllTransactions(scope),
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

  const WINDOW_SIZES: Record<Granularity, number> = { month: 12, quarter: 4, year: 5 };

  const displayData = useMemo(() => {
    if (selectedYear !== null) return chartData;
    return chartData.slice(-WINDOW_SIZES[granularity]);
  }, [chartData, granularity, selectedYear]);

  const categoryData = useMemo(() => {
    if (drillLevel < 1 || !selectedPeriodKey) return [];
    return buildCategoryData(filteredTransactions, selectedPeriodKey, granularity, selectedType);
  }, [drillLevel, filteredTransactions, selectedPeriodKey, granularity, selectedType]);

  const drillTransactions = useMemo(() => {
    if (drillLevel < 2 || !selectedPeriodKey || !selectedCategory) return [];
    return getTransactionsForCategory(
      filteredTransactions, selectedPeriodKey, granularity, selectedType, selectedCategory,
    );
  }, [drillLevel, filteredTransactions, selectedPeriodKey, granularity, selectedType, selectedCategory]);

  function handleGranularityChange(g: Granularity) {
    setGranularity(g);
    setDrillLevel(0);
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
    setDrillLevel(0);
  }

  function handleQuarterChange(value: string) {
    setSelectedQuarter(value === "" ? null : parseInt(value));
    setSelectedMonth(null);
    setDrillLevel(0);
  }

  function handleBarClick(datum: { id: string | number; indexValue: string | number; data: Record<string, unknown> }) {
    const type = datum.id as DrillType;
    const label = datum.indexValue as string;
    const pKey = (datum.data as unknown as PeriodDatum)._periodKey;
    setDrillLevel(1);
    setSelectedPeriodLabel(label);
    setSelectedPeriodKey(pKey);
    setSelectedType(type);
  }

  function handleCategoryClick(datum: { id: string | number; indexValue: string | number }) {
    setDrillLevel(2);
    setSelectedCategory(datum.indexValue as string);
  }

  function handleBack() {
    if (drillLevel === 2) {
      setDrillLevel(1);
      setSelectedCategory("");
    } else if (drillLevel === 1) {
      setDrillLevel(0);
      setSelectedPeriodKey("");
      setSelectedPeriodLabel("");
    }
  }

  const selectClass =
    "rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";

  const typeColor = selectedType === "Income" ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        {drillLevel === 0 ? (
          <h3 className="text-sm font-medium text-muted-foreground">
            Income vs Expenses
          </h3>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              aria-label="Back"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <span>{selectedPeriodLabel}</span>
              <span aria-hidden="true">›</span>
              <span style={{ color: typeColor }}>{selectedType}</span>
              {drillLevel === 2 && (
                <>
                  <span aria-hidden="true">›</span>
                  <span className="text-foreground">{selectedCategory}</span>
                </>
              )}
            </nav>
          </div>
        )}
        {drillLevel === 0 && (
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
        )}
      </div>

      {/* Time-period filters (level 0 only) */}
      {drillLevel === 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selectedYear ?? ""}
            onChange={(e) => handleYearChange(e.target.value)}
            className={selectClass}
          >
            <option value="">
              {granularity === "month"
                ? "Last 12 months"
                : granularity === "quarter"
                  ? "Last 4 quarters"
                  : "Last 5 years"}
            </option>
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
      )}

      {/* Chart / Content area */}
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
        </div>
      ) : drillLevel === 0 ? (
        displayData.length === 0 ? (
          <div className="flex h-80 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No transaction data available.
            </p>
          </div>
        ) : (
          <div className="h-80 mt-4">
            <ResponsiveBar
              data={displayData}
              keys={["Income", "Expenses"]}
              indexBy="period"
              groupMode="grouped"
              margin={{ top: 10, right: 20, bottom: displayData.length > 8 ? 70 : 40, left: 80 }}
              padding={0.3}
              valueScale={{ type: "linear" }}
              colors={["#22c55e", "#ef4444"]}
              borderRadius={4}
              axisBottom={{
                tickSize: 0,
                tickPadding: 12,
                tickRotation: displayData.length > 8 ? -45 : 0,
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
                tickValues: 5,
                format: (v) => formatCurrency(v as number),
              }}
              enableGridX={false}
              gridYValues={5}
              enableLabel={false}
              onClick={handleBarClick}
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
              markers={[]}
            />
          </div>
        )
      ) : drillLevel === 1 ? (
        categoryData.length === 0 ? (
          <div className="flex h-80 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No categories found for this period.
            </p>
          </div>
        ) : (
          <div className="h-[28rem] mt-4">
            <ResponsiveBar
              data={categoryData}
              keys={["amount"]}
              indexBy="category"
              layout="horizontal"
              margin={{ top: 10, right: 20, bottom: 40, left: 120 }}
              padding={0.3}
              colors={[typeColor]}
              borderRadius={4}
              axisBottom={{
                tickSize: 0,
                tickPadding: 8,
                format: (v) => formatCurrency(v as number),
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
              }}
              enableGridY={false}
              gridXValues={5}
              enableLabel={false}
              onClick={handleCategoryClick}
              tooltip={({ indexValue, value }) => (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
                  <span className="font-medium">{indexValue}:</span>{" "}
                  {formatCurrency(value as number)}
                </div>
              )}
              theme={{
                text: { fill: "#a1a1aa", fontSize: 11 },
                grid: { line: { stroke: "#27272a" } },
                axis: { ticks: { text: { fill: "#71717a" } } },
              }}
            />
          </div>
        )
      ) : (
        /* Level 2: Transaction list */
        <div className="mt-4 max-h-[28rem] overflow-y-auto">
          {drillTransactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transactions found.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Merchant</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {drillTransactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-muted-foreground">{txn.date}</td>
                    <td className="py-2.5">{txn.merchant_name || "—"}</td>
                    <td className="py-2.5 text-right font-medium" style={{ color: typeColor }}>
                      {formatCurrency(Math.abs(txn.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
