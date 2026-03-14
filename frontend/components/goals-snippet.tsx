"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Target, ArrowRight, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";

export default function GoalsSnippet() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const { data: goalsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ["goals", scope],
    queryFn: () => api.getGoals(scope),
  });
  const { data: householdGoalsResponse, isLoading: isHouseholdLoading } = useQuery({
    queryKey: ["goals", "household", "snippet"],
    queryFn: () => api.getGoals("household"),
    enabled: scope !== "household",
  });

  const goals = goalsResponse?.goals ?? [];
  const activeGoals = goals.filter((g) => !g.is_completed);
  const ownGoals = activeGoals.filter((g) => !g.household_id);
  const sharedGoals =
    scope === "household"
      ? activeGoals.filter((g) => !!g.household_id)
      : (householdGoalsResponse?.goals ?? []).filter((g) => !g.is_completed && !!g.household_id);
  const dedupedSharedGoals =
    sharedGoals.filter((goal, idx, arr) => arr.findIndex((g) => g.id === goal.id) === idx);
  const visibleGoals =
    scope === "household"
      ? activeGoals
      : [...ownGoals.slice(0, 3), ...dedupedSharedGoals.slice(0, 3)];

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

      {isLoading || (scope !== "household" && isHouseholdLoading) ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : visibleGoals.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No active goals.{" "}
          <Link href="/goals" className="text-accent hover:underline">
            Set one
          </Link>
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {/* Expanded rows in all scopes, including shared goals in Mine/Yours/Ours views */}
          {visibleGoals.slice(0, 3).map((goal) => (
            <GoalRow key={goal.id} goal={goal} formatCurrency={formatCurrency} />
          ))}
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
