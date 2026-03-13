"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { useScope } from "@/lib/hooks";

const CashFlowBarChart = dynamic(() => import("@/components/cashflow-bar-chart"), {
  loading: () => (
    <div className="rounded-2xl border border-border bg-card p-6 animate-pulse h-64" />
  ),
});

export default function CashFlowPage() {
  const scope = useScope();
  const { data: txns, isError, refetch } = useQuery({
    queryKey: ["transactions", "cashflow-check", scope],
    queryFn: () => api.getTransactions({ limit: 1, scope }),
  });

  const isEmpty = txns !== undefined && txns.length === 0;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Cash Flow</h1>
      <p className="text-sm text-muted-foreground">
        Click any bar to drill down into categories and individual transactions.
      </p>

      {isError ? (
        <div className="mt-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
          <p className="mt-3 text-muted-foreground">Something went wrong loading data.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <BarChart3 className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">No transactions yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Connect a bank account or add transactions manually to see your
            income and spending flow.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <CashFlowBarChart />
        </div>
      )}
    </>
  );
}
