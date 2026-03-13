"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";

export default function ReviewSnippet() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { data, isLoading } = useQuery({
    queryKey: ["transactions", "uncategorized", scope],
    queryFn: () => api.getTransactions({ uncategorized: true, limit: 5, scope }),
  });

  const count = data?.length ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-medium text-muted-foreground">
            Needs Review
          </h3>
        </div>
        <Link
          href="/transactions"
          className="text-xs font-medium text-accent hover:underline"
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : count === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          All caught up — nothing to review.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {(data ?? []).map((txn) => (
            <li
              key={txn.id}
              className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {txn.merchant_name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">{txn.date}</p>
              </div>
              <span className="ml-3 text-sm font-medium">
                {formatCurrency(Math.abs(txn.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
