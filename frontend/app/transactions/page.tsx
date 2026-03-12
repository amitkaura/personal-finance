"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ChevronDown, AlertCircle, Search, Sparkles, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Transaction } from "@/lib/types";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"review" | "all">("review");

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", filter],
    queryFn: () =>
      api.getTransactions(
        filter === "review" ? { needs_review: true, limit: 100 } : { limit: 100 }
      ),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.updateTransaction(id, { needs_review: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const autoCatMutation = useMutation({
    mutationFn: api.autoCategorize,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const recategorizeMutation = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      api.updateTransaction(id, { category, needs_review: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Review and categorize your transactions.
          </p>
        </div>
        <button
          onClick={() => autoCatMutation.mutate()}
          disabled={autoCatMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {autoCatMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {autoCatMutation.isPending ? "Categorizing..." : "Auto-Categorize"}
        </button>
      </div>

      {autoCatMutation.isSuccess && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Done — {autoCatMutation.data.categorized} of {autoCatMutation.data.total} transactions categorized
          {autoCatMutation.data.skipped > 0 &&
            `, ${autoCatMutation.data.skipped} skipped`}
          .
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setFilter("review")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === "review"
              ? "bg-accent text-accent-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Needs Review
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-accent text-accent-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          All
        </button>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : !transactions?.length ? (
        <div className="mt-12 text-center">
          <Check className="mx-auto h-10 w-10 text-success" />
          <p className="mt-3 text-muted-foreground">
            {filter === "review"
              ? "All transactions reviewed!"
              : "No transactions found."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {transactions.map((txn: Transaction) => (
            <TransactionRow
              key={txn.id}
              txn={txn}
              categories={categories ?? []}
              onApprove={(id) => approveMutation.mutate(id)}
              onRecategorize={(id, cat) =>
                recategorizeMutation.mutate({ id, category: cat })
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

function TransactionRow({
  txn,
  categories,
  onApprove,
  onRecategorize,
}: {
  txn: Transaction;
  categories: string[];
  onApprove: (id: number) => void;
  onRecategorize: (id: number, category: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {txn.merchant_name || "Unknown"}
          </p>
          {txn.pending_status && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              PENDING
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {txn.date}
          {txn.category && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5">
              {txn.category}
            </span>
          )}
        </p>
      </div>

      <span
        className={`text-sm font-semibold ${
          txn.amount < 0 ? "text-success" : "text-foreground"
        }`}
      >
        {txn.amount < 0 ? "+" : "-"}
        {formatCurrency(txn.amount)}
      </span>

      {txn.needs_review && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Categorize
              <ChevronDown className="h-3 w-3" />
            </button>
            {open && (
              <div className="absolute right-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-xl">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      onRecategorize(txn.id, cat);
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => onApprove(txn.id)}
            className="inline-flex items-center gap-1 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/25"
          >
            <Check className="h-3 w-3" />
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
