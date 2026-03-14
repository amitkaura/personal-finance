"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";

export default function LoansWidget() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["accountSummary", scope],
    queryFn: () => api.getAccountSummary(scope),
  });

  const loans = data?.loan_accounts ?? [];
  const totalOwed = data?.loan_balance ?? 0;

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
          <Building2 className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium text-muted-foreground">Loans</h3>
        </div>
        {!isLoading && loans.length > 0 && (
          <span className="text-sm font-semibold text-danger">
            {formatCurrency(Math.abs(totalOwed))} remaining
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : loans.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No loans.
        </p>
      ) : (
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {loans.map((loan) => (
            <li
              key={loan.id}
              className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{loan.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {loan.subtype || loan.official_name || "Loan"}
                </p>
              </div>
              <span className="ml-3 text-sm font-semibold text-danger">
                {formatCurrency(Math.abs(loan.current_balance))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
