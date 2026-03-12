"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TrendingUp, Camera } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";

export default function NetWorthHistory() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(12);

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["netWorthHistory", months, scope],
    queryFn: () => api.getNetWorthHistory(months, scope),
  });

  const snapshotMutation = useMutation({
    mutationFn: api.takeNetWorthSnapshot,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["netWorthHistory"] }),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Net Worth History
          </h3>
        </div>
        <div className="mt-4 h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium text-muted-foreground">
              Net Worth History
            </h3>
          </div>
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Camera className="h-3 w-3" />
            Snapshot
          </button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No historical data yet. Snapshots are taken automatically during sync,
          or you can take one manually.
        </p>
      </div>
    );
  }

  const values = snapshots.map((s) => s.net_worth);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const change = last.net_worth - first.net_worth;
  const changePercent =
    first.net_worth !== 0
      ? ((change / Math.abs(first.net_worth)) * 100).toFixed(1)
      : "0";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Net Worth History
          </h3>
          {snapshots.length > 1 && (
            <span
              className={`ml-2 text-xs font-medium ${
                change >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {formatCurrency(change)} ({changePercent}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground outline-none cursor-pointer"
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>1 year</option>
            <option value={24}>2 years</option>
          </select>
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Camera className="h-3 w-3" />
            Snapshot
          </button>
        </div>
      </div>

      <div className="mt-4 flex h-48 items-end gap-px">
        {snapshots.map((s) => {
          const height = ((s.net_worth - minVal) / range) * 100;
          return (
            <div
              key={s.date}
              className="group relative flex-1"
              style={{ minWidth: 4 }}
            >
              <div
                className={`w-full rounded-t transition-colors ${
                  s.net_worth >= 0
                    ? "bg-accent/60 group-hover:bg-accent"
                    : "bg-danger/60 group-hover:bg-danger"
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl group-hover:block whitespace-nowrap">
                <p className="font-medium">{formatCurrency(s.net_worth)}</p>
                <p className="text-muted-foreground">{s.date}</p>
                <p className="text-muted-foreground">
                  Assets: {formatCurrency(s.assets)}
                </p>
                <p className="text-muted-foreground">
                  Liabilities: {formatCurrency(s.liabilities)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {snapshots.length > 1 && (
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{snapshots[0].date}</span>
          <span>{snapshots[snapshots.length - 1].date}</span>
        </div>
      )}
    </div>
  );
}
