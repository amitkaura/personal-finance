"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Copy,
  PiggyBank,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";
import type { BudgetSummary, BudgetSummaryItem } from "@/lib/types";
import ConfirmDialog from "@/components/confirm-dialog";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function formatMonthDisplay(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function prevMonth(key: string): string {
  const { year, month } = parseMonthKey(key);
  if (month === 1) return getMonthKey(year - 1, 12);
  return getMonthKey(year, month - 1);
}

function nextMonth(key: string): string {
  const { year, month } = parseMonthKey(key);
  if (month === 12) return getMonthKey(year + 1, 1);
  return getMonthKey(year, month + 1);
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return getMonthKey(now.getFullYear(), now.getMonth() + 1);
}

function progressColor(percent: number): string {
  if (percent < 75) return "bg-emerald-500";
  if (percent < 90) return "bg-amber-500";
  return "bg-red-500";
}

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const isViewingOwn = scope === "personal";
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [addCategory, setAddCategory] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<BudgetSummaryItem | null>(null);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["budgetSummary", month, scope],
    queryFn: () => api.getBudgetSummary(month, scope),
  });

  const { data: budgets } = useQuery({
    queryKey: ["budgets", month, scope],
    queryFn: () => api.getBudgets(month, scope),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });

  const rolloverByBudgetId = useMemo(() => {
    const map = new Map<number, boolean>();
    budgets?.forEach((b) => map.set(b.id, b.rollover));
    return map;
  }, [budgets]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["budgetSummary"] });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };

  const copyMutation = useMutation({
    mutationFn: () => api.copyBudgets(prevMonth(month), month),
    onSuccess: invalidate,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createBudget({
        category: addCategory,
        amount: parseFloat(addAmount) || 0,
        month,
        rollover: false,
      }),
    onSuccess: () => {
      invalidate();
      setAddCategory("");
      setAddAmount("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, rollover }: { id: number; rollover: boolean }) =>
      api.updateBudget(id, { rollover }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteBudget(id),
    onSuccess: () => {
      invalidate();
      setDeleteConfirm(null);
    },
  });

  const availableCategories = useMemo(() => {
    const budgeted = new Set(summary?.items.map((i) => i.category) ?? []);
    return categories?.filter((c) => !budgeted.has(c)) ?? [];
  }, [categories, summary?.items]);

  const handleAddBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCategory || !addAmount || parseFloat(addAmount) <= 0) return;
    createMutation.mutate();
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
          <p className="text-sm text-muted-foreground">
            Plan and track spending by category.
          </p>
        </div>
      </div>

      {/* Month selector */}
      <div className="mt-6 flex items-center gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setMonth((m) => prevMonth(m))}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] px-4 py-2 text-center text-sm font-medium">
            {formatMonthDisplay(month)}
          </span>
          <button
            onClick={() => setMonth((m) => nextMonth(m))}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {isViewingOwn && (
          <button
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            {copyMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy from last month
          </button>
        )}
      </div>

      {copyMutation.isSuccess && copyMutation.data && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Copied {copyMutation.data.copied} budget{copyMutation.data.copied !== 1 ? "s" : ""} from {formatMonthDisplay(prevMonth(month))}.
        </div>
      )}

      {createMutation.isError && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {(createMutation.error as Error).message}
        </div>
      )}

      {/* Add Budget form */}
      {isViewingOwn && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Add Budget</h2>
          <form onSubmit={handleAddBudget} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label htmlFor="add-category" className="mb-1 block text-xs text-muted-foreground">
              Category
            </label>
            <select
              id="add-category"
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
            >
              <option value="">Select category</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label htmlFor="add-amount" className="mb-1 block text-xs text-muted-foreground">
              Amount
            </label>
            <input
              id="add-amount"
              type="number"
              min="0"
              step="0.01"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            disabled={!addCategory || !addAmount || parseFloat(addAmount) <= 0 || createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add Budget
          </button>
          </form>
        </div>
      )}

      {/* Budget summary */}
      {isLoading ? (
        <div className="mt-6 space-y-4">
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        </div>
      ) : summary ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Budgeted
              </p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(summary.total_budgeted)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Spent
              </p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(summary.total_spent)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Remaining
              </p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  summary.total_remaining >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatCurrency(summary.total_remaining)}
              </p>
            </div>
          </div>

          {/* Budget items list */}
          {summary.items.length === 0 ? (
            <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16">
              <PiggyBank className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No budgets for this month yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a budget above or copy from last month.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {summary.items.map((item) => (
                <BudgetItemRow
                  key={item.id}
                  item={item}
                  rolloverEnabled={rolloverByBudgetId.get(item.id) ?? false}
                  formatCurrency={formatCurrency}
                  onToggleRollover={(enabled) =>
                    updateMutation.mutate({ id: item.id, rollover: enabled })
                  }
                  onDelete={() => setDeleteConfirm(item)}
                  isUpdating={updateMutation.isPending}
                  editable={isViewingOwn}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete budget?"
        description={
          deleteConfirm
            ? `This will remove the budget for "${deleteConfirm.category}". Spending data is not affected.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}

function BudgetItemRow({
  item,
  rolloverEnabled,
  formatCurrency,
  onToggleRollover,
  onDelete,
  isUpdating,
  editable = true,
}: {
  item: BudgetSummaryItem;
  rolloverEnabled: boolean;
  formatCurrency: (n: number) => string;
  onToggleRollover: (enabled: boolean) => void;
  onDelete: () => void;
  isUpdating: boolean;
  editable?: boolean;
}) {
  const percent = Math.min(item.percent_used, 100);
  const color = progressColor(item.percent_used);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{item.category}</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {formatCurrency(item.spent)} / {formatCurrency(item.effective_budget)}
              </span>
              <span
                className={
                  item.remaining >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {item.remaining >= 0
                  ? `${formatCurrency(item.remaining)} left`
                  : `${formatCurrency(Math.abs(item.remaining))} over`}
              </span>
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${color}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {editable && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rolloverEnabled}
                  onChange={(e) => onToggleRollover(e.target.checked)}
                  disabled={isUpdating}
                  className="h-4 w-4 rounded border-border bg-muted text-accent focus:ring-accent"
                />
                <span className="text-muted-foreground">Rollover</span>
              </label>
              <button
                onClick={onDelete}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                aria-label={`Delete budget for ${item.category}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
