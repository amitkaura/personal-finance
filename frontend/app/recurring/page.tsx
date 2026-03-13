"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  RotateCw,
  Calendar,
  AlertCircle,
  Check,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import type { RecurringTransaction } from "@/lib/types";

const FREQUENCY_TABS = [
  "all",
  "weekly",
  "bi-weekly",
  "monthly",
  "quarterly",
  "semi-annual",
  "annual",
] as const;

type FrequencyTab = (typeof FREQUENCY_TABS)[number];

const FREQUENCY_LABELS: Record<FrequencyTab, string> = {
  all: "All",
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  "semi-annual": "Semi-annual",
  annual: "Annual",
};

const FREQUENCY_BADGE_COLORS: Record<string, string> = {
  weekly: "bg-emerald-500/20 text-emerald-400",
  "bi-weekly": "bg-cyan-500/20 text-cyan-400",
  monthly: "bg-blue-500/20 text-blue-400",
  quarterly: "bg-amber-500/20 text-amber-400",
  "semi-annual": "bg-orange-500/20 text-orange-400",
  annual: "bg-purple-500/20 text-purple-400",
};

const MONTHLY_MULTIPLIERS: Record<string, number> = {
  weekly: 4.33,
  "bi-weekly": 2.17,
  monthly: 1,
  quarterly: 1 / 3,
  "semi-annual": 1 / 6,
  annual: 1 / 12,
};

function getEstimatedMonthly(amount: number, frequency: string): number {
  const mult = MONTHLY_MULTIPLIERS[frequency] ?? 1;
  return amount * mult;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SortKey = "amount" | "frequency" | "name";

export default function RecurringPage() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyTab>("all");
  const [sortBy, setSortBy] = useState<SortKey>("amount");

  const { data: recurring, isLoading, isError, refetch } = useQuery({
    queryKey: ["recurring", scope],
    queryFn: () => api.getRecurring({ scope }),
  });

  const filtered = useMemo(() => {
    if (!recurring) return [];
    if (frequencyFilter === "all") return recurring;
    return recurring.filter(
      (r) => r.frequency.toLowerCase() === frequencyFilter
    );
  }, [recurring, frequencyFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "amount") {
      list.sort((a, b) => {
        const amA = getEstimatedMonthly(a.average_amount, a.frequency);
        const amB = getEstimatedMonthly(b.average_amount, b.frequency);
        return amB - amA;
      });
    } else if (sortBy === "frequency") {
      const order = ["weekly", "bi-weekly", "monthly", "quarterly", "semi-annual", "annual"];
      list.sort((a, b) => {
        const iA = order.indexOf(a.frequency.toLowerCase());
        const iB = order.indexOf(b.frequency.toLowerCase());
        return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
      });
    } else {
      list.sort((a, b) =>
        a.merchant_name.localeCompare(b.merchant_name, undefined, { sensitivity: "base" })
      );
    }
    return list;
  }, [filtered, sortBy]);

  const summary = useMemo(() => {
    if (!recurring) return null;
    const totalMonthly = recurring.reduce(
      (sum, r) => sum + getEstimatedMonthly(r.average_amount, r.frequency),
      0
    );
    const nextUpcoming = recurring
      .filter((r) => r.next_expected)
      .sort((a, b) => (a.next_expected! < b.next_expected! ? -1 : 1))[0];
    return {
      totalMonthly,
      count: recurring.length,
      nextUpcoming: nextUpcoming?.next_expected ?? null,
      nextMerchant: nextUpcoming?.merchant_name ?? null,
    };
  }, [recurring]);

  const tabClass = (active: boolean) =>
    active
      ? "bg-accent text-accent-foreground rounded-md px-3 py-1 text-xs font-medium"
      : "text-muted-foreground hover:text-foreground rounded-md px-3 py-1 text-xs font-medium";

  const selectClass =
    "rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Recurring & Bills
        </h1>
        <p className="text-sm text-muted-foreground">
          Track subscriptions and recurring expenses.
        </p>
      </div>

      {/* Summary cards */}
      {isError ? (
        <div className="mt-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
          <p className="mt-3 text-muted-foreground">Something went wrong loading data.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-6 animate-pulse"
            >
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="mt-3 h-8 w-32 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total monthly
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {formatCurrency(summary.totalMonthly)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Subscriptions
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {summary.count}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Next upcoming
            </p>
            {summary.nextUpcoming ? (
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-accent" />
                <div>
                  <p className="font-semibold text-foreground">
                    {summary.nextMerchant}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(summary.nextUpcoming)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No upcoming dates
              </p>
            )}
          </div>
        </div>
      ) : null}

      {!isError && (
      <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {FREQUENCY_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFrequencyFilter(tab)}
              className={tabClass(frequencyFilter === tab)}
            >
              {FREQUENCY_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className={selectClass}
          >
            <option value="amount">Sort by amount</option>
            <option value="frequency">Sort by frequency</option>
            <option value="name">Sort by name</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-6 animate-pulse"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-48 rounded bg-muted" />
                  <div className="flex gap-2">
                    <div className="h-5 w-16 rounded bg-muted" />
                    <div className="h-5 w-20 rounded bg-muted" />
                  </div>
                  <div className="h-4 w-32 rounded bg-muted" />
                </div>
                <div className="h-6 w-24 rounded bg-muted" />
              </div>
              <div className="mt-4 flex gap-4">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-4 w-28 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : !sorted.length ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16">
          <RotateCw className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium text-foreground">
            No recurring transactions
          </p>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {frequencyFilter === "all"
              ? "Recurring transactions will appear here once we detect patterns from your transaction history."
              : `No ${FREQUENCY_LABELS[frequencyFilter].toLowerCase()} recurring transactions found.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {sorted.map((item, idx) => (
            <RecurringCard
              key={`${item.merchant_name}-${item.frequency}-${item.last_date}-${idx}`}
              item={item}
              formatCurrency={formatCurrency}
              estimatedMonthly={getEstimatedMonthly(
                item.average_amount,
                item.frequency
              )}
            />
          ))}
        </div>
      )}
      </>
      )}
    </>
  );
}

function RecurringCard({
  item,
  formatCurrency,
  estimatedMonthly,
}: {
  item: RecurringTransaction;
  formatCurrency: (n: number) => string;
  estimatedMonthly: number;
}) {
  const freq = item.frequency.toLowerCase();
  const badgeColor =
    FREQUENCY_BADGE_COLORS[freq] ?? "bg-muted text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">
              {item.merchant_name}
            </h3>
            {item.category && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {item.category}
              </span>
            )}
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${badgeColor}`}
            >
              {item.frequency}
            </span>
            {item.is_consistent_amount ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400"
                title="Consistent amount"
              >
                <Check className="h-3 w-3" />
                Consistent
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400"
                title="Amount varies"
              >
                <AlertCircle className="h-3 w-3" />
                Varies
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {item.occurrence_count} occurrences
            </span>
            <span>Last: {formatDate(item.last_date)}</span>
            {item.next_expected && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                Next: {formatDate(item.next_expected)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 text-right">
          <p className="text-lg font-semibold text-foreground">
            {formatCurrency(item.latest_amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            avg {formatCurrency(item.average_amount)}
          </p>
          <p className="text-xs font-medium text-accent">
            ~{formatCurrency(estimatedMonthly)}/mo
          </p>
        </div>
      </div>
    </div>
  );
}
