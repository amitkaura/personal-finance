"use client";

import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import type { Account } from "@/lib/types";

export default function CashAccountsWidget() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { data: accounts, isLoading, isError, refetch } = useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => api.getAccounts(scope),
  });

  const cashAccounts = (accounts ?? []).filter((a: Account) => a.type === "depository");
  const total = cashAccounts.reduce((sum, a) => sum + a.current_balance, 0);

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
          <Landmark className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-muted-foreground">Cash</h3>
        </div>
        {!isLoading && cashAccounts.length > 0 && (
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
      ) : cashAccounts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No cash accounts.
        </p>
      ) : (
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {cashAccounts.map((acct: Account) => (
            <li
              key={acct.id}
              className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{acct.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {acct.subtype || "Depository"}
                </p>
              </div>
              <span className="ml-3 text-sm font-semibold">
                {formatCurrency(acct.current_balance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
