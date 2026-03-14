"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import type { Account } from "@/lib/types";

export default function TopMovers() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { data: accounts, isLoading, isError, refetch } = useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => api.getAccounts(scope),
  });

  const investments = (accounts ?? []).filter((a: Account) => a.type === "investment");
  const total = investments.reduce((sum, a) => sum + a.current_balance, 0);

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
    <div className="h-full rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Investments
          </h3>
        </div>
        {!isLoading && investments.length > 0 && (
          <span className="text-sm font-semibold text-success">
            {formatCurrency(total)}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : investments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No investment accounts.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {investments.map((acct: Account) => {
            const positive = acct.current_balance >= 0;
            return (
              <li
                key={acct.id}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{acct.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {acct.official_name || "Investment"}
                  </p>
                </div>
                <div className="ml-3 flex items-center gap-1.5">
                  {positive ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-danger" />
                  )}
                  <span
                    className={`text-sm font-semibold ${
                      positive ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatCurrency(acct.current_balance)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
