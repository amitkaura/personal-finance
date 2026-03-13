"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCw, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import type { Transaction } from "@/lib/types";

function detectRecurring(transactions: Transaction[]): Transaction[] {
  const merchantCounts = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    const name = txn.merchant_name?.toLowerCase();
    if (!name) continue;
    const existing = merchantCounts.get(name) || [];
    existing.push(txn);
    merchantCounts.set(name, existing);
  }
  const recurring: Transaction[] = [];
  for (const [, txns] of merchantCounts) {
    if (txns.length >= 2) {
      const latest = txns.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];
      recurring.push(latest);
    }
  }
  return recurring.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export default function RecurringWidget() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { data: transactions, isLoading, isError, refetch } = useQuery({
    queryKey: ["transactions", "all", scope],
    queryFn: () => api.getAllTransactions(scope),
  });

  const recurring = transactions ? detectRecurring(transactions) : [];

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
      <div className="flex items-center gap-2">
        <RotateCw className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-medium text-muted-foreground">
          Recurring
        </h3>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : recurring.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No recurring transactions detected yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {recurring.slice(0, 6).map((txn) => (
            <li
              key={txn.id}
              className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {txn.merchant_name}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Last: {txn.date}</span>
                </div>
              </div>
              <span className="ml-3 text-sm font-semibold text-danger">
                -{formatCurrency(Math.abs(txn.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
