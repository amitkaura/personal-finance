"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PiggyBank, ArrowRight, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";

function BudgetMini({
  label,
  spent,
  budgeted,
  formatCurrency,
  icon,
}: {
  label: string;
  spent: number;
  budgeted: number;
  formatCurrency: (n: number) => string;
  icon?: React.ReactNode;
}) {
  const ratio = budgeted > 0 ? spent / budgeted : 0;
  const barColor =
    ratio > 0.9 ? "bg-danger" : ratio > 0.75 ? "bg-amber-500" : "bg-success";

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-lg font-bold">{formatCurrency(spent)}</span>
        <span className="text-[10px] text-muted-foreground">
          of {formatCurrency(budgeted)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function BudgetSnippet() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["budgetSummary", month, scope],
    queryFn: () => api.getBudgetSummary(month, scope),
  });
  const { data: householdData, isLoading: isHouseholdLoading } = useQuery({
    queryKey: ["budgetSummary", month, "household", "snippet"],
    queryFn: () => api.getBudgetSummary(month, "household"),
    enabled: scope !== "household",
  });

  const ownSummaryItems = scope === "household" ? [] : (data?.items ?? []);
  const sharedSummary =
    scope === "household"
      ? data?.sections?.shared ?? data?.shared_summary ?? null
      : data?.shared_summary ?? householdData?.shared_summary ?? householdData?.sections?.shared ?? null;
  const hasOwn = ownSummaryItems.length > 0;
  const hasShared = (sharedSummary?.items.length ?? 0) > 0;
  const isEmpty = !hasOwn && !hasShared;
  const ownLabel = scope === "partner" ? "Yours" : "Personal";
  const ownCategoriesLabel = scope === "partner" ? "Your Categories" : "Personal Categories";
  const topOwn = [...ownSummaryItems]
    .sort((a, b) => b.percent_used - a.percent_used)
    .slice(0, 3);
  const topShared = [...(sharedSummary?.items ?? [])]
    .sort((a, b) => b.percent_used - a.percent_used)
    .slice(0, 3);

  if (isError)
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-red-400">
          Failed to load.{" "}
          <button onClick={() => refetch()} className="text-accent hover:underline">
            Retry
          </button>
        </p>
      </div>
    );

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Budget Overview
          </h3>
        </div>
        <Link
          href="/budgets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading || (scope !== "household" && isHouseholdLoading) ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No budgets set for this month.{" "}
          <Link href="/budgets" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="mt-4">
          <div className={`flex gap-4 ${hasShared && hasOwn ? "" : ""}`}>
            {hasOwn && data && (
              <BudgetMini
                label={ownLabel}
                spent={data.total_spent}
                budgeted={data.total_budgeted}
                formatCurrency={formatCurrency}
                icon={<PiggyBank className="h-3 w-3" />}
              />
            )}
            {hasShared && sharedSummary && (
              <BudgetMini
                label="Shared"
                spent={sharedSummary.total_spent}
                budgeted={sharedSummary.total_budgeted}
                formatCurrency={formatCurrency}
                icon={<Users className="h-3 w-3" />}
              />
            )}
          </div>

          <div className="mt-3 space-y-3">
            {hasOwn && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {ownCategoriesLabel}
                </p>
                <ul className="space-y-1.5">
                  {topOwn.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {item.category}
                      </span>
                      <span
                        className={`font-medium ${
                          item.percent_used > 100
                            ? "text-danger"
                            : item.percent_used > 90
                              ? "text-amber-500"
                              : "text-foreground"
                        }`}
                      >
                        {item.percent_used}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasShared && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Users className="h-3 w-3 text-accent" />
                  Shared Categories
                </p>
                <ul className="space-y-1.5">
                  {topShared.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {item.category}
                      </span>
                      <span
                        className={`font-medium ${
                          item.percent_used > 100
                            ? "text-danger"
                            : item.percent_used > 90
                              ? "text-amber-500"
                              : "text-foreground"
                        }`}
                      >
                        {item.percent_used}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
