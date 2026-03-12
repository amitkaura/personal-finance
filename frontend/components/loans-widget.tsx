"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

export default function LoansWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["accountSummary"],
    queryFn: api.getAccountSummary,
  });

  const loans = data?.loan_accounts ?? [];
  const totalOwed = data?.loan_balance ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium text-muted-foreground">Loans</h3>
        </div>
        {!isLoading && loans.length > 0 && (
          <span className="text-sm font-semibold text-danger">
            {formatCurrency(totalOwed)} remaining
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
          No loans linked.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
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
                {formatCurrency(loan.current_balance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
