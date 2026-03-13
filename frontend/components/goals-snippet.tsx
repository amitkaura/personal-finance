"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Target, ArrowRight, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency } from "@/lib/hooks";

export default function GoalsSnippet() {
  const formatCurrency = useFormatCurrency();
  const { data: goalsResponse, isLoading } = useQuery({
    queryKey: ["goals", "personal"],
    queryFn: () => api.getGoals("personal"),
  });

  const goals = goalsResponse?.goals ?? [];
  const sharedSummary = goalsResponse?.shared_goals_summary ?? null;
  const activeGoals = goals.filter((g) => !g.is_completed);
  const personalGoals = activeGoals.filter((g) => !g.household_id);
  const sharedGoals = activeGoals.filter((g) => !!g.household_id);

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
      ) : personalGoals.length === 0 && !sharedSummary ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No active goals.{" "}
          <Link href="/goals" className="text-accent hover:underline">
            Set one
          </Link>
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {/* Personal goals */}
          {personalGoals.slice(0, 3).map((goal) => (
            <GoalRow key={goal.id} goal={goal} formatCurrency={formatCurrency} />
          ))}

          {/* Shared goals */}
          {sharedSummary && sharedSummary.count > 0 && (
            <div className="rounded-lg bg-accent/5 border border-accent/15 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-accent" />
                  <span className="text-xs font-medium">
                    {sharedSummary.count} shared goal{sharedSummary.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {sharedSummary.total_progress_pct}% avg
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalRow({
  goal,
  formatCurrency,
}: {
  goal: { id: number; name: string; progress: number; current_amount: number; target_amount: number; color: string; household_id?: number | null };
  formatCurrency: (n: number) => string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{goal.name}</span>
          {goal.household_id && (
            <Users className="h-3 w-3 text-accent" />
          )}
        </div>
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
    </div>
  );
}
