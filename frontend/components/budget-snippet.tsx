"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PiggyBank, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";

export default function BudgetSnippet() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data, isLoading } = useQuery({
    queryKey: ["budgetSummary", month, scope],
    queryFn: () => api.getBudgetSummary(month, scope),
  });

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

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No budgets set for this month.{" "}
          <Link href="/budgets" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              {formatCurrency(data.total_spent)}
            </span>
            <span className="text-sm text-muted-foreground">
              of {formatCurrency(data.total_budgeted)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                data.total_spent / data.total_budgeted > 0.9
                  ? "bg-danger"
                  : data.total_spent / data.total_budgeted > 0.75
                    ? "bg-amber-500"
                    : "bg-success"
              }`}
              style={{
                width: `${Math.min((data.total_spent / data.total_budgeted) * 100, 100)}%`,
              }}
            />
          </div>
          <ul className="mt-4 space-y-2">
            {data.items
              .sort((a, b) => b.percent_used - a.percent_used)
              .slice(0, 3)
              .map((item) => (
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
        </>
      )}
    </div>
  );
}
