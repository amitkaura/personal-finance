"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Check,
  ChevronDown,
  AlertCircle,
  Search,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise } from "@/lib/hooks";
import type { Transaction } from "@/lib/types";

export default function TransactionsPage() {
  const formatCurrency = useFormatCurrencyPrecise();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"review" | "all">("review");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [transactionType, setTransactionType] = useState<
    "all" | "income" | "expense"
  >("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

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

  const hasActiveFilters =
    searchQuery ||
    selectedCategory ||
    transactionType !== "all" ||
    dateFrom ||
    dateTo ||
    amountMin ||
    amountMax;

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((txn) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (txn.merchant_name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (selectedCategory && txn.category !== selectedCategory) return false;
      if (transactionType === "income" && txn.amount >= 0) return false;
      if (transactionType === "expense" && txn.amount < 0) return false;
      if (dateFrom && txn.date < dateFrom) return false;
      if (dateTo && txn.date > dateTo) return false;
      const absAmount = Math.abs(txn.amount);
      if (amountMin && absAmount < parseFloat(amountMin)) return false;
      if (amountMax && absAmount > parseFloat(amountMax)) return false;
      return true;
    });
  }, [
    transactions,
    searchQuery,
    selectedCategory,
    transactionType,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  ]);

  function clearFilters() {
    setSearchQuery("");
    setSelectedCategory("");
    setTransactionType("all");
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
  }

  const selectClass =
    "rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";
  const inputClass =
    "rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";
  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;

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
          Done — {autoCatMutation.data.categorized} of{" "}
          {autoCatMutation.data.total} transactions categorized
          {autoCatMutation.data.skipped > 0 &&
            `, ${autoCatMutation.data.skipped} skipped`}
          .
        </div>
      )}

      {/* Search bar */}
      <div className="relative mt-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by merchant name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg bg-muted py-2.5 pl-10 pr-10 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <button
            onClick={() => setFilter("review")}
            className={`inline-flex items-center gap-1.5 ${tabClass(filter === "review")}`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Needs Review
          </button>
          <button
            onClick={() => setFilter("all")}
            className={tabClass(filter === "all")}
          >
            All
          </button>
        </div>

        <div className="h-5 w-px bg-border" />

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={selectClass}
        >
          <option value="">All Categories</option>
          {categories?.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={transactionType}
          onChange={(e) =>
            setTransactionType(e.target.value as "all" | "income" | "expense")
          }
          className={selectClass}
        >
          <option value="all">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
        </select>

        <div className="h-5 w-px bg-border" />

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className={inputClass}
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className={inputClass}
          aria-label="To date"
        />

        <div className="h-5 w-px bg-border" />

        <input
          type="number"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          placeholder="Min $"
          className={`${inputClass} w-20`}
          min="0"
          step="0.01"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="number"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          placeholder="Max $"
          className={`${inputClass} w-20`}
          min="0"
          step="0.01"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {hasActiveFilters && transactions && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {filteredTransactions.length} of {transactions.length}{" "}
          transactions
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : !filteredTransactions.length ? (
        <div className="mt-12 text-center">
          {hasActiveFilters ? (
            <>
              <Search className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-muted-foreground">
                No transactions match your filters.
              </p>
            </>
          ) : (
            <>
              <Check className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 text-muted-foreground">
                {filter === "review"
                  ? "All transactions reviewed!"
                  : "No transactions found."}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {filteredTransactions.map((txn: Transaction) => (
            <TransactionRow
              key={txn.id}
              txn={txn}
              categories={categories ?? []}
              formatCurrency={formatCurrency}
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
  formatCurrency,
  onApprove,
  onRecategorize,
}: {
  txn: Transaction;
  categories: string[];
  formatCurrency: (n: number) => string;
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
        {formatCurrency(Math.abs(txn.amount))}
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
