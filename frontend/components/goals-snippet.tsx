"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Target, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";

export default function GoalsSnippet() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const { data: goals, isLoading } = useQuery({
    queryKey: ["goals", scope],
    queryFn: () => api.getGoals(scope),
  });

  const activeGoals = goals?.filter((g) => !g.is_completed) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Goals Progress
          </h3>
        </div>
        <Link
          href="/goals"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : activeGoals.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No active goals.{" "}
          <Link href="/goals" className="text-accent hover:underline">
            Set one
          </Link>
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activeGoals.slice(0, 3).map((goal) => (
            <li key={goal.id} className="rounded-lg bg-muted/40 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">
                  {goal.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {goal.progress}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(goal.progress, 100)}%`,
                    backgroundColor: goal.color,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{formatCurrency(goal.current_amount)}</span>
                <span>{formatCurrency(goal.target_amount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
