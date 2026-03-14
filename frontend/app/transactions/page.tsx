"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  AlertCircle,
  Search,
  Sparkles,
  Loader2,
  X,
  Plus,
  Trash2,
  SlidersHorizontal,
  Pencil,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useCategorizationProgress } from "@/components/categorization-progress-provider";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import type { Account, Transaction, CategoryRule } from "@/lib/types";
import { generateKeywordOptions } from "@/lib/rule-utils";
import ConfirmDialog from "@/components/confirm-dialog";

export default function TransactionsPage() {
  const formatCurrency = useFormatCurrencyPrecise();
  const queryClient = useQueryClient();
  const scope = useScope();
  const searchParams = useSearchParams();
  const isViewingOwn = scope === "personal";
  const [filter, setFilter] = useState<"review" | "all">("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    () => searchParams.get("category") ?? "",
  );
  const [transactionType, setTransactionType] = useState<
    "all" | "income" | "expense"
  >("all");
  const [dateFrom, setDateFrom] = useState(
    () => searchParams.get("from") ?? "",
  );
  const [dateTo, setDateTo] = useState(
    () => searchParams.get("to") ?? "",
  );
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(
    () => searchParams.get("account") ?? "",
  );

  const PAGE_SIZE = 50;

  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);
  const { startAutoCategorize, state: catState } = useCategorizationProgress();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [ruleSuggestion, setRuleSuggestion] = useState<{
    merchantName: string;
    category: string;
    selectedKeyword: string;
  } | null>(null);
  const [ruleCreated, setRuleCreated] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState<number | null>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    function handleClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filtersOpen]);

  const accountIdNum = selectedAccountId ? Number(selectedAccountId) : undefined;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["transactions", "list", filter, scope, accountIdNum],
    queryFn: ({ pageParam = 0 }) =>
      api.getTransactions(
        filter === "review"
          ? { uncategorized: true, limit: PAGE_SIZE, offset: pageParam, scope, account_id: accountIdNum }
          : { limit: PAGE_SIZE, offset: pageParam, scope, account_id: accountIdNum }
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
  });

  const transactions = useMemo(() => {
    const all = data?.pages.flat() ?? [];
    const seen = new Set<number>();
    return all.filter((txn) => {
      if (seen.has(txn.id)) return false;
      seen.add(txn.id);
      return true;
    });
  }, [data]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => api.getAccounts(scope === "personal" ? undefined : scope),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });

  const catBusy = catState === "categorizing" || catState === "syncing";

  const recategorizeMutation = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      api.updateTransaction(id, { category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setDeleteConfirm(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: api.createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowAddForm(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { category?: string; merchant_name?: string; amount?: number; date?: string; notes?: string } }) =>
      api.updateTransaction(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setEditingTxnId(null);
    },
  });

  const { data: rules } = useQuery({
    queryKey: ["rules"],
    queryFn: api.getRules,
  });

  const createRuleMutation = useMutation({
    mutationFn: (body: { keyword: string; category: string; case_sensitive?: boolean }) =>
      api.createRule(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });

  const activeFilterCount = [
    selectedCategory,
    transactionType !== "all" ? transactionType : "",
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    selectedAccountId,
  ].filter(Boolean).length;

  const hasActiveFilters = !!searchQuery || activeFilterCount > 0;

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((txn) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (txn.merchant_name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (selectedCategory && txn.category !== selectedCategory) return false;
      if (transactionType === "income" && txn.amount > 0) return false;
      if (transactionType === "expense" && txn.amount <= 0) return false;
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

  function handleFilterChange(newFilter: "review" | "all") {
    setFilter(newFilter);
  }

  function clearFilters() {
    setSearchQuery("");
    setSelectedCategory("");
    setTransactionType("all");
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
    setSelectedAccountId("");
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
        {isViewingOwn && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Add Transaction
            </button>
            <button
              onClick={startAutoCategorize}
              disabled={catBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
              title="Use rules and AI to categorize uncategorized transactions"
            >
              {catBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {catBusy ? "Categorizing..." : "Auto-Categorize"}
            </button>
          </div>
        )}
      </div>

      {showAddForm && (
        <AddTransactionForm
          categories={categories ?? []}
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowAddForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* Search + toggle + filters — single row */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by merchant name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search transactions"
            className="w-full rounded-lg bg-muted py-2 pl-10 pr-10 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <button
            onClick={() => handleFilterChange("all")}
            className={tabClass(filter === "all")}
          >
            All
          </button>
          <button
            onClick={() => handleFilterChange("review")}
            className={`inline-flex items-center gap-1.5 ${tabClass(filter === "review")}`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Uncategorized
          </button>
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Filters popover trigger */}
        <div className="relative" ref={filtersRef}>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span
                data-testid="filter-badge"
                className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground"
              >
                {activeFilterCount}
              </span>
            )}
          </button>

          {filtersOpen && (
            <div className="absolute left-0 z-20 mt-1 w-[calc(100vw-2rem)] sm:w-80 max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={`${selectClass} w-full`}
                  >
                    <option value="">All Categories</option>
                    {categories?.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    Type
                  </label>
                  <select
                    value={transactionType}
                    onChange={(e) =>
                      setTransactionType(
                        e.target.value as "all" | "income" | "expense"
                      )
                    }
                    className={`${selectClass} w-full`}
                  >
                    <option value="all">All Types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expenses</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className={`${selectClass} w-full`}
                  >
                    <option value="">All Accounts</option>
                    {accounts?.map((acct) => (
                      <option key={acct.id} value={String(acct.id)}>
                        {acct.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={`${inputClass} w-full`}
                    aria-label="From date"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={`${inputClass} w-full`}
                    aria-label="To date"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    Min Amount
                  </label>
                  <input
                    type="number"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    placeholder="$0"
                    className={`${inputClass} w-full`}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                    Max Amount
                  </label>
                  <input
                    type="number"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    placeholder="$∞"
                    className={`${inputClass} w-full`}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

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

      {hasActiveFilters && transactions.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {filteredTransactions.length} of {transactions.length}{" "}
          loaded transactions
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
              onRecategorize={(id, cat) =>
                recategorizeMutation.mutate({ id, category: cat })
              }
              onDelete={(id) =>
                setDeleteConfirm(
                  filteredTransactions.find((t) => t.id === id) ?? null
                )
              }
              editable={isViewingOwn}
              showOwner={!isViewingOwn}
              rules={rules ?? []}
              onCreateRule={(keyword, category) =>
                createRuleMutation.mutate({ keyword, category })
              }
              onSuggestRule={(merchantName, category, selectedKeyword) => {
                setRuleCreated(false);
                setRuleSuggestion({ merchantName, category, selectedKeyword });
              }}
              isEditing={editingTxnId === txn.id}
              onStartEdit={() => setEditingTxnId(txn.id)}
              onUpdate={(body) => {
                const oldCategory = txn.category;
                editMutation.mutate({ id: txn.id, body });
                if (!oldCategory && body.category && txn.merchant_name) {
                  const merchant = txn.merchant_name;
                  const hasMatchingRule = (rules ?? []).some((r) => {
                    const flags = r.case_sensitive ? "" : "i";
                    try {
                      return new RegExp(`\\b${r.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, flags).test(merchant);
                    } catch { return false; }
                  });
                  if (!hasMatchingRule) {
                    const opts = generateKeywordOptions(merchant);
                    if (opts.length > 0) {
                      const keyword = opts.length > 1 ? opts[opts.length - 2] : opts[0];
                      setRuleCreated(false);
                      setRuleSuggestion({ merchantName: merchant, category: body.category, selectedKeyword: keyword });
                    }
                  }
                }
              }}
              onCancelEdit={() => setEditingTxnId(null)}
              accountName={accounts?.find((a) => a.id === txn.account_id)?.name}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && transactions.length > 0 && !hasNextPage && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          All {transactions.length} transactions loaded
        </p>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete transaction?"
        description={
          deleteConfirm
            ? `This will permanently delete the manual transaction "${deleteConfirm.merchant_name || "Unknown"}".`
            : ""
        }
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

      {ruleSuggestion && (
        <div className="fixed bottom-6 right-6 z-50 w-96 rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <RuleSuggestionCard
            merchantName={ruleSuggestion.merchantName}
            category={ruleSuggestion.category}
            selectedKeyword={ruleSuggestion.selectedKeyword}
            onSelectKeyword={(kw) =>
              setRuleSuggestion((prev) => prev ? { ...prev, selectedKeyword: kw } : null)
            }
            onCreateRule={() => {
              createRuleMutation.mutate({
                keyword: ruleSuggestion.selectedKeyword,
                category: ruleSuggestion.category,
              });
              setRuleCreated(true);
              setTimeout(() => {
                setRuleSuggestion(null);
                setRuleCreated(false);
              }, 1500);
            }}
            onDismiss={() => setRuleSuggestion(null)}
            created={ruleCreated}
          />
        </div>
      )}
    </>
  );
}

function TransactionRow({
  txn,
  categories,
  formatCurrency,
  onRecategorize,
  onDelete,
  editable = true,
  showOwner = false,
  rules = [],
  onCreateRule,
  onSuggestRule,
  isEditing = false,
  onStartEdit,
  onUpdate,
  onCancelEdit,
  accountName,
}: {
  txn: Transaction;
  categories: string[];
  formatCurrency: (n: number) => string;
  onRecategorize: (id: number, category: string) => void;
  onDelete: (id: number) => void;
  editable?: boolean;
  showOwner?: boolean;
  rules?: CategoryRule[];
  onCreateRule?: (keyword: string, category: string) => void;
  onSuggestRule?: (merchantName: string, category: string, selectedKeyword: string) => void;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onUpdate?: (body: { category?: string; merchant_name?: string; amount?: number; date?: string; notes?: string }) => void;
  onCancelEdit?: () => void;
  accountName?: string;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
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
          {txn.is_manual && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              MANUAL
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>{txn.date}</span>
          {txn.category && (
            <span className="rounded bg-muted px-1.5 py-0.5">
              {txn.category}
            </span>
          )}
          {txn.tags?.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
          {showOwner && txn.owner_name && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-accent">
              {txn.owner_picture ? (
                <Image
                  src={txn.owner_picture}
                  alt={txn.owner_name}
                  width={14}
                  height={14}
                  className="rounded-full"
                />
              ) : null}
              {txn.owner_name.split(" ")[0]}
            </span>
          )}
          {txn.notes && (
            <span className="ml-1 italic text-muted-foreground/70 truncate max-w-[200px]">
              {txn.notes}
            </span>
          )}
        </div>
      </div>

      <span
        className={`text-sm font-semibold whitespace-nowrap ${
          txn.amount < 0 ? "text-success" : "text-foreground"
        }`}
      >
        {txn.amount < 0 ? "+" : "-"}
        {formatCurrency(Math.abs(txn.amount))}
      </span>

      {!txn.category && editable && (
        <div className="flex items-center gap-2">
          <div className="relative" ref={dropdownRef}>
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
                      const merchant = txn.merchant_name || "";
                      const hasMatchingRule = rules.some((r) => {
                        const flags = r.case_sensitive ? "" : "i";
                        try {
                          return new RegExp(`\\b${r.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, flags).test(merchant);
                        } catch {
                          return false;
                        }
                      });
                      if (!hasMatchingRule && merchant && onSuggestRule) {
                        const opts = generateKeywordOptions(merchant);
                        if (opts.length > 0) {
                          const keyword = opts.length > 1 ? opts[opts.length - 2] : opts[0];
                          onSuggestRule(merchant, cat, keyword);
                        }
                      }
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editable && (
        <button
          onClick={() => onStartEdit?.()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Edit transaction"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {txn.is_manual && editable && (
        <button
          onClick={() => onDelete(txn.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-danger transition-colors"
          title="Delete manual transaction"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {isEditing && (
        <InlineEditForm
          txn={txn}
          categories={categories}
          onSave={(body) => onUpdate?.(body)}
          onCancel={() => onCancelEdit?.()}
          accountName={accountName}
        />
      )}
    </div>
  );
}

function InlineEditForm({
  txn,
  categories,
  onSave,
  onCancel,
  accountName,
}: {
  txn: Transaction;
  categories: string[];
  onSave: (body: { category?: string; merchant_name?: string; amount?: number; date?: string; notes?: string }) => void;
  onCancel: () => void;
  accountName?: string;
}) {
  const [merchant, setMerchant] = useState(txn.merchant_name || "");
  const [category, setCategory] = useState(txn.category || "");
  const [amount, setAmount] = useState(Math.abs(txn.amount).toFixed(2));
  const [isExpense, setIsExpense] = useState(txn.amount >= 0);
  const [date, setDate] = useState(txn.date);
  const [notes, setNotes] = useState(txn.notes || "");

  const inputClass =
    "w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground";

  return (
    <div className="w-full border-t border-border pt-3 mt-1">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Merchant</label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Amount</label>
          <div className="flex gap-2">
            <select
              value={isExpense ? "expense" : "income"}
              onChange={(e) => setIsExpense(e.target.value === "expense")}
              className="rounded-md bg-muted px-2 py-2 text-sm text-foreground outline-none cursor-pointer"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
              min="0"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted-foreground mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note..."
            className={inputClass}
          />
        </div>
      </div>
      {accountName && (
        <p className="mt-2 text-xs text-muted-foreground">
          Account: <span className="font-medium text-foreground">{accountName}</span>
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const numAmount = parseFloat(amount);
            onSave({
              merchant_name: merchant || undefined,
              category: category || undefined,
              amount: isNaN(numAmount) ? undefined : (isExpense ? Math.abs(numAmount) : -Math.abs(numAmount)),
              date,
              notes: notes || undefined,
            });
          }}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function RuleSuggestionCard({
  merchantName,
  category,
  selectedKeyword,
  onSelectKeyword,
  onCreateRule,
  onDismiss,
  created,
}: {
  merchantName: string;
  category: string;
  selectedKeyword: string;
  onSelectKeyword: (keyword: string) => void;
  onCreateRule: () => void;
  onDismiss: () => void;
  created: boolean;
}) {
  const options = generateKeywordOptions(merchantName);

  if (created) {
    return (
      <div className="col-span-full mt-1 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
        <Check className="mr-1 inline-block h-3 w-3" />
        Rule created
      </div>
    );
  }

  return (
    <div className="col-span-full mt-1 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            Always categorize &ldquo;{merchantName}&rdquo; as{" "}
            <span className="rounded bg-muted px-1.5 py-0.5">{category}</span>?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => onSelectKeyword(opt)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  selectedKeyword === opt
                    ? "border-accent bg-accent/20 text-accent font-medium"
                    : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <button
              onClick={onCreateRule}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80"
            >
              Create Rule
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss rule suggestion"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddTransactionForm({
  categories,
  onSubmit,
  onCancel,
  isPending,
}: {
  categories: string[];
  onSubmit: (data: {
    date: string;
    amount: number;
    merchant_name: string;
    category?: string;
    notes?: string;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [isExpense, setIsExpense] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || !merchant) return;
    onSubmit({
      date,
      amount: isExpense ? Math.abs(numAmount) : -Math.abs(numAmount),
      merchant_name: merchant,
      category: category || undefined,
      notes: notes || undefined,
    });
  }

  const inputClass =
    "w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-2xl border border-border bg-card p-6"
    >
      <h3 className="text-sm font-medium mb-4">Add Manual Transaction</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Merchant
          </label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. Coffee Shop"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Amount
          </label>
          <div className="flex gap-2">
            <select
              value={isExpense ? "expense" : "income"}
              onChange={(e) => setIsExpense(e.target.value === "expense")}
              className="rounded-md bg-muted px-2 py-2 text-sm text-foreground outline-none cursor-pointer"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className={inputClass}
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted-foreground mb-1">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note..."
            className={inputClass}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !merchant || !amount}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add Transaction
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
