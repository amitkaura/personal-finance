"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Copy,
  PiggyBank,
  Loader2,
  AlertTriangle,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";
import { useHousehold } from "@/components/household-provider";
import type { Budget, BudgetSummary, BudgetSummaryItem, BudgetSectionSummary } from "@/lib/types";
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
  const { household } = useHousehold();
  const isViewingOwn = scope === "personal";
  const isHouseholdView = scope === "household";
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [addCategory, setAddCategory] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addShared, setAddShared] = useState(false);
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

  const { data: conflicts } = useQuery({
    queryKey: ["budgetConflicts", month],
    queryFn: () => api.getBudgetConflicts(month),
    enabled: !!household,
  });

  const rolloverByBudgetId = useMemo(() => {
    const map = new Map<number, boolean>();
    budgets?.forEach((b) => map.set(b.id, b.rollover));
    return map;
  }, [budgets]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["budgetSummary"] });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
    queryClient.invalidateQueries({ queryKey: ["budgetConflicts"] });
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
        household_id: addShared && household ? household.id : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setAddCategory("");
      setAddAmount("");
      setAddShared(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, rollover, amount }: { id: number; rollover?: boolean; amount?: number }) =>
      api.updateBudget(id, { ...(rollover !== undefined && { rollover }), ...(amount !== undefined && { amount }) }),
    onMutate: async (variables) => {
      const budgetSummaryKey = ["budgetSummary", month, scope];
      const budgetsKey = ["budgets", month, scope];
      await queryClient.cancelQueries({ queryKey: budgetSummaryKey });
      await queryClient.cancelQueries({ queryKey: budgetsKey });
      const previousSummary = queryClient.getQueryData(budgetSummaryKey);
      const previousBudgets = queryClient.getQueryData(budgetsKey);
      queryClient.setQueryData(budgetsKey, (old: Budget[] | undefined) => {
        if (!old) return old;
        return old.map((b) =>
          b.id === variables.id
            ? {
                ...b,
                ...(variables.amount !== undefined && { amount: variables.amount }),
                ...(variables.rollover !== undefined && { rollover: variables.rollover }),
              }
            : b
        );
      });
      queryClient.setQueryData(budgetSummaryKey, (old: BudgetSummary | undefined) => {
        if (!old) return old;
        const updateItem = (item: BudgetSummaryItem): BudgetSummaryItem => {
          if (item.id !== variables.id) return item;
          const newBudgeted = variables.amount !== undefined ? variables.amount : item.budgeted;
          const rolloverEnabled = variables.rollover !== undefined ? variables.rollover : (rolloverByBudgetId.get(item.id) ?? false);
          const newEffectiveBudget = rolloverEnabled ? newBudgeted + item.rollover : newBudgeted;
          const newRemaining = newEffectiveBudget - item.spent;
          const newPercentUsed = newEffectiveBudget > 0 ? Math.min((item.spent / newEffectiveBudget) * 100, 100) : 0;
          return {
            ...item,
            budgeted: newBudgeted,
            effective_budget: newEffectiveBudget,
            remaining: newRemaining,
            percent_used: newPercentUsed,
          };
        };
        const updateItems = (items: BudgetSummaryItem[]) => items.map(updateItem);
        const newItems = updateItems(old.items);
        const recalcTotals = (items: BudgetSummaryItem[]) => ({
          total_budgeted: items.reduce((s, i) => s + i.effective_budget, 0),
          total_spent: items.reduce((s, i) => s + i.spent, 0),
          total_remaining: items.reduce((s, i) => s + i.remaining, 0),
        });
        const totals = recalcTotals(newItems);
        return {
          ...old,
          items: newItems,
          ...totals,
          sections: old.sections
            ? {
                personal: { ...old.sections.personal, items: updateItems(old.sections.personal.items), ...recalcTotals(updateItems(old.sections.personal.items)) },
                partner: { ...old.sections.partner, items: updateItems(old.sections.partner.items), ...recalcTotals(updateItems(old.sections.partner.items)) },
                shared: { ...old.sections.shared, items: updateItems(old.sections.shared.items), ...recalcTotals(updateItems(old.sections.shared.items)) },
              }
            : undefined,
          shared_summary: old.shared_summary
            ? { ...old.shared_summary, items: updateItems(old.shared_summary.items), ...recalcTotals(updateItems(old.shared_summary.items)) }
            : undefined,
        };
      });
      return { previousSummary, previousBudgets };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSummary !== undefined) {
        queryClient.setQueryData(["budgetSummary", month, scope], context.previousSummary);
      }
      if (context?.previousBudgets !== undefined) {
        queryClient.setQueryData(["budgets", month, scope], context.previousBudgets);
      }
    },
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteBudget(id),
    onSuccess: () => {
      invalidate();
      setDeleteConfirm(null);
    },
  });

  const prefMutation = useMutation({
    mutationFn: ({ category, target }: { category: string; target: "personal" | "shared" }) =>
      api.setSpendingPreference(category, target),
    onSuccess: invalidate,
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

  const unresolvedConflicts = conflicts?.filter((c) => !c.current_preference) ?? [];

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

      {/* Spending preference conflicts */}
      {unresolvedConflicts.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Choose where your spending counts
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            You have both a personal and shared budget for these categories. Pick where your spending should be tracked.
          </p>
          <div className="mt-3 space-y-2">
            {unresolvedConflicts.map((c) => (
              <div key={c.category} className="flex items-center justify-between rounded-lg bg-card px-4 py-2.5">
                <span className="text-sm font-medium">{c.category}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => prefMutation.mutate({ category: c.category, target: "personal" })}
                    disabled={prefMutation.isPending}
                    className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Personal
                  </button>
                  <button
                    onClick={() => prefMutation.mutate({ category: c.category, target: "shared" })}
                    disabled={prefMutation.isPending}
                    className="rounded-md bg-accent/15 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/25 transition-colors"
                  >
                    Shared
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Budget form */}
      {(isViewingOwn || isHouseholdView) && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {addShared ? "Add Shared Budget" : "Add Budget"}
          </h2>
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
            {household && (
              <label className="flex cursor-pointer items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={addShared}
                  onChange={(e) => setAddShared(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-muted text-accent focus:ring-accent"
                />
                <Users className="h-3.5 w-3.5 text-accent" />
                <span className="text-muted-foreground">Shared</span>
              </label>
            )}
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
              {addShared ? "Add Shared Budget" : "Add Budget"}
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
          {/* Totals */}
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

          {/* Sectioned view for household scope */}
          {isHouseholdView && summary.sections ? (
            <div className="mt-6 space-y-6">
              <BudgetSection
                title="Your Budgets"
                section={summary.sections.personal}
                budgets={budgets ?? []}
                formatCurrency={formatCurrency}
                editable
                onToggleRollover={(id, enabled) => updateMutation.mutate({ id, rollover: enabled })}
                onUpdateAmount={(id, amount) => updateMutation.mutate({ id, amount })}
                onDelete={(item) => setDeleteConfirm(item)}
                isUpdating={updateMutation.isPending}
                month={month}
              />
              <BudgetSection
                title="Partner's Budgets"
                section={summary.sections.partner}
                budgets={budgets ?? []}
                formatCurrency={formatCurrency}
                editable={false}
                onToggleRollover={() => {}}
                onUpdateAmount={() => {}}
                onDelete={() => {}}
                isUpdating={false}
                month={month}
              />
              <BudgetSection
                title="Shared Budgets"
                section={summary.sections.shared}
                budgets={budgets ?? []}
                formatCurrency={formatCurrency}
                editable
                onToggleRollover={(id, enabled) => updateMutation.mutate({ id, rollover: enabled })}
                onUpdateAmount={(id, amount) => updateMutation.mutate({ id, amount })}
                onDelete={(item) => setDeleteConfirm(item)}
                isUpdating={updateMutation.isPending}
                showBreakdown
                month={month}
              />
            </div>
          ) : (
            /* Flat list for personal/partner scope */
            <>
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
                      onUpdateAmount={(amount) =>
                        updateMutation.mutate({ id: item.id, amount })
                      }
                      onDelete={() => setDeleteConfirm(item)}
                      isUpdating={updateMutation.isPending}
                      editable={isViewingOwn}
                      month={month}
                    />
                  ))}
                </div>
              )}

              {/* Shared summary in personal view */}
              {scope === "personal" && summary.shared_summary && summary.shared_summary.items.length > 0 && (
                <div className="mt-8">
                  <BudgetSection
                    title="Shared Budgets"
                    section={summary.shared_summary}
                    budgets={budgets ?? []}
                    formatCurrency={formatCurrency}
                    editable
                    onToggleRollover={(id, enabled) => updateMutation.mutate({ id, rollover: enabled })}
                    onUpdateAmount={(id, amount) => updateMutation.mutate({ id, amount })}
                    onDelete={(item) => setDeleteConfirm(item)}
                    isUpdating={updateMutation.isPending}
                    showBreakdown
                    month={month}
                  />
                </div>
              )}
            </>
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

function BudgetSection({
  title,
  section,
  budgets,
  formatCurrency,
  editable,
  onToggleRollover,
  onUpdateAmount,
  onDelete,
  isUpdating,
  showBreakdown = false,
  month,
}: {
  title: string;
  section: BudgetSectionSummary;
  budgets: { id: number; rollover: boolean }[];
  formatCurrency: (n: number) => string;
  editable: boolean;
  onToggleRollover: (id: number, enabled: boolean) => void;
  onUpdateAmount: (id: number, amount: number) => void;
  onDelete: (item: BudgetSummaryItem) => void;
  isUpdating: boolean;
  showBreakdown?: boolean;
  month: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const rolloverMap = useMemo(() => {
    const map = new Map<number, boolean>();
    budgets.forEach((b) => map.set(b.id, b.rollover));
    return map;
  }, [budgets]);

  if (section.items.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-3 flex w-full items-center gap-2 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
        <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatCurrency(section.total_spent)} / {formatCurrency(section.total_budgeted)}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-3">
          {section.items.map((item) => (
            <BudgetItemRow
              key={item.id}
              item={item}
              rolloverEnabled={rolloverMap.get(item.id) ?? false}
              formatCurrency={formatCurrency}
              onToggleRollover={(enabled) => onToggleRollover(item.id, enabled)}
              onUpdateAmount={(amount) => onUpdateAmount(item.id, amount)}
              onDelete={() => onDelete(item)}
              isUpdating={isUpdating}
              editable={editable}
              breakdown={showBreakdown ? item.breakdown : undefined}
              month={month}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetItemRow({
  item,
  rolloverEnabled,
  formatCurrency,
  onToggleRollover,
  onUpdateAmount,
  onDelete,
  isUpdating,
  editable = true,
  breakdown,
  month,
}: {
  item: BudgetSummaryItem;
  rolloverEnabled: boolean;
  formatCurrency: (n: number) => string;
  onToggleRollover: (enabled: boolean) => void;
  onUpdateAmount: (amount: number) => void;
  onDelete: () => void;
  isUpdating: boolean;
  editable?: boolean;
  breakdown?: Record<string, number>;
  month: string;
}) {
  const percent = Math.min(item.percent_used, 100);
  const color = progressColor(item.percent_used);
  const router = useRouter();
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountValue, setAmountValue] = useState(String(item.budgeted));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAmount && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingAmount]);

  function handleAmountKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      const val = parseFloat(amountValue);
      if (val > 0) {
        onUpdateAmount(val);
      }
      setEditingAmount(false);
    } else if (e.key === "Escape") {
      setAmountValue(String(item.budgeted));
      setEditingAmount(false);
    }
  }

  const breakdownEntries = breakdown ? Object.entries(breakdown) : [];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="min-w-0 flex-1 cursor-pointer rounded-xl transition-colors hover:bg-muted/50"
          onClick={() => {
            const [y, m] = month.split("-").map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const from = `${month}-01`;
            const to = `${month}-${String(lastDay).padStart(2, "0")}`;
            router.push(`/transactions?category=${encodeURIComponent(item.category)}&from=${from}&to=${to}`);
          }}
          role="link"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{item.category}</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {formatCurrency(item.spent)} /{" "}
                {editable && !editingAmount ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAmountValue(String(item.budgeted));
                      setEditingAmount(true);
                    }}
                    className="cursor-pointer hover:underline"
                  >
                    {formatCurrency(item.effective_budget)}
                  </button>
                ) : editingAmount ? (
                  <input
                    ref={inputRef}
                    type="number"
                    value={amountValue}
                    onChange={(e) => setAmountValue(e.target.value)}
                    onKeyDown={handleAmountKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      setAmountValue(String(item.budgeted));
                      setEditingAmount(false);
                    }}
                    className="w-20 rounded bg-muted px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
                    min="0"
                    step="0.01"
                  />
                ) : (
                  formatCurrency(item.effective_budget)
                )}
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

          {/* Progress bar */}
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={item.spent}
            aria-valuemin={0}
            aria-valuemax={item.effective_budget}
            aria-label={`${item.category} budget progress`}
          >
            {breakdownEntries.length > 1 && item.effective_budget > 0 ? (
              <div className="flex h-full">
                {breakdownEntries.map(([name, amount], i) => {
                  const w = (amount / item.effective_budget) * 100;
                  const colors = ["bg-accent", "bg-pink-500", "bg-amber-500"];
                  return (
                    <div
                      key={name}
                      className={`h-full ${colors[i % colors.length]} transition-all`}
                      style={{ width: `${Math.min(w, 100)}%` }}
                      title={`${name}: ${formatCurrency(amount)}`}
                    />
                  );
                })}
              </div>
            ) : (
              <div
                className={`h-full rounded-full transition-all ${color}`}
                style={{ width: `${percent}%` }}
              />
            )}
          </div>

          {/* Breakdown legend */}
          {breakdownEntries.length > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              {breakdownEntries.map(([name, amount], i) => {
                const colors = ["text-accent", "text-pink-500", "text-amber-500"];
                return (
                  <span key={name} className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${colors[i % colors.length].replace("text-", "bg-")}`} />
                    {name}: {formatCurrency(amount)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {editable && (
            <>
              <label
                className="flex cursor-pointer items-center gap-2 text-sm"
                title="Carry unspent budget forward to the next month"
              >
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
