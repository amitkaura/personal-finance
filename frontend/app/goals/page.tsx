"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import {
  Plus,
  Target,
  Calendar,
  Trash2,
  Check,
  TrendingUp,
  X,
  Loader2,
  Link2,
  Users,
  ChevronDown,
  History,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";
import { useHousehold } from "@/components/household-provider";
import type { Goal, GoalContribution, Account } from "@/lib/types";
import ConfirmDialog from "@/components/confirm-dialog";

const PRESET_COLORS = [
  { name: "Purple", value: "#6d28d9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Yellow", value: "#eab308" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GoalsPage() {
  const formatCurrency = useFormatCurrency();
  const scope = useScope();
  const { household } = useHousehold();
  const isViewingOwn = scope === "personal";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [updateProgressGoal, setUpdateProgressGoal] = useState<Goal | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);

  const { data: goalsResponse, isLoading } = useQuery({
    queryKey: ["goals", scope],
    queryFn: () => api.getGoals(scope),
  });

  const goals = goalsResponse?.goals ?? [];
  const sharedSummary = goalsResponse?.shared_goals_summary ?? null;

  const activeGoals = goals.filter((g) => !g.is_completed);
  const completedGoals = goals.filter((g) => g.is_completed);

  const canCreate = isViewingOwn || scope === "household";

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteGoal(id),
    onSuccess: () => {
      invalidate();
      setDeleteGoal(null);
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["goals"] });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Track your savings targets and progress.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            <Plus className="h-4 w-4" />
            New Goal
          </button>
        )}
      </div>

      {/* Shared goals collapsed summary in personal scope */}
      {isViewingOwn && sharedSummary && sharedSummary.count > 0 && (
        <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">
                {sharedSummary.count} shared goal{sharedSummary.count !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                — {sharedSummary.total_progress_pct}% avg progress
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Switch to household view to see details
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl border border-border bg-card"
            />
          ))}
        </div>
      ) : !goals.length ? (
        <EmptyState onNewGoal={() => setCreateOpen(true)} editable={canCreate} />
      ) : (
        <div className="mt-8 space-y-10">
          {activeGoals.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Active Goals
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    formatCurrency={formatCurrency}
                    onUpdateProgress={() => setUpdateProgressGoal(goal)}
                    onDelete={() => setDeleteGoal(goal)}
                    invalidate={invalidate}
                    editable={isViewingOwn || !!goal.household_id}
                  />
                ))}
              </div>
            </section>
          )}

          {completedGoals.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Completed
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    formatCurrency={formatCurrency}
                    onUpdateProgress={() => setUpdateProgressGoal(goal)}
                    onDelete={() => setDeleteGoal(goal)}
                    invalidate={invalidate}
                    editable={isViewingOwn || !!goal.household_id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {canCreate && createOpen && (
        <CreateGoalDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            invalidate();
          }}
          householdId={household?.id ?? null}
        />
      )}

      {updateProgressGoal && (
        <UpdateProgressDialog
          key={updateProgressGoal.id}
          goal={updateProgressGoal}
          onClose={() => setUpdateProgressGoal(null)}
          onSuccess={() => {
            setUpdateProgressGoal(null);
            invalidate();
          }}
        />
      )}

      {deleteGoal && (
        <ConfirmDialog
          open={!!deleteGoal}
          title={`Delete "${deleteGoal.name}"?`}
          description="This action cannot be undone."
          confirmLabel="Delete"
          destructive
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteGoal.id)}
          onCancel={() => setDeleteGoal(null)}
        />
      )}
    </>
  );
}

function EmptyState({
  onNewGoal,
  editable,
}: {
  onNewGoal: () => void;
  editable: boolean;
}) {
  return (
    <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15">
        <Target className="h-8 w-8 text-accent" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">No goals yet</h3>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        Create a savings goal to track your progress. Set a target amount,
        optional deadline, and watch your progress grow.
      </p>
      {editable && (
        <button
          onClick={onNewGoal}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
        >
          <Plus className="h-4 w-4" />
          Create your first goal
        </button>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  formatCurrency,
  onUpdateProgress,
  onDelete,
  invalidate,
  editable = true,
}: {
  goal: Goal;
  formatCurrency: (n: number) => string;
  onUpdateProgress: () => void;
  onDelete: () => void;
  invalidate: () => void;
  editable?: boolean;
}) {
  const progress = Math.min(100, goal.progress);
  const [showHistory, setShowHistory] = useState(false);

  const completeMutation = useMutation({
    mutationFn: () =>
      api.updateGoal(goal.id, { is_completed: true, current_amount: goal.target_amount }),
    onSuccess: invalidate,
  });

  return (
    <div
      className="relative rounded-2xl border border-border bg-card p-6"
      style={{ borderLeftWidth: 4, borderLeftColor: goal.color }}
    >
      {goal.is_completed && (
        <div className="absolute right-4 top-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
            <Check className="h-3 w-3" />
            Completed
          </span>
        </div>
      )}

      <div className="pr-20">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{goal.name}</h3>
          {goal.household_id && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              Shared
            </span>
          )}
          {goal.is_account_linked && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              <Link2 className="mr-0.5 inline h-3 w-3" />
              Auto
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatCurrency(goal.current_amount)}
          </span>
          <span>/</span>
          <span>{formatCurrency(goal.target_amount)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: goal.color,
            }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {progress.toFixed(0)}% complete
        </p>
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Remaining</span>
          <span className="font-medium">{formatCurrency(goal.remaining)}</span>
        </div>
        {goal.target_date && (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Target date
            </span>
            <span>{formatDate(goal.target_date)}</span>
          </div>
        )}
        {goal.months_left != null && goal.months_left > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Months left</span>
            <span>{goal.months_left}</span>
          </div>
        )}
        {goal.monthly_needed != null && goal.monthly_needed > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly needed</span>
            <span className="font-medium text-accent">
              {formatCurrency(goal.monthly_needed)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {editable && !goal.is_completed && !goal.is_account_linked && (
          <button
            onClick={onUpdateProgress}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            <TrendingUp className="h-3 w-3" />
            Update Progress
          </button>
        )}
        {editable && !goal.is_completed && progress >= 100 && (
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/25 disabled:opacity-50"
          >
            {completeMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Mark Complete
          </button>
        )}
        {!goal.is_account_linked && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <History className="h-3 w-3" />
            History
          </button>
        )}
        {editable && (
          <button
            onClick={onDelete}
            className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            title="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {showHistory && <ContributionHistory goalId={goal.id} />}
    </div>
  );
}

function ContributionHistory({ goalId }: { goalId: number }) {
  const formatCurrency = useFormatCurrency();
  const { data: contributions, isLoading } = useQuery({
    queryKey: ["goalContributions", goalId],
    queryFn: () => api.getGoalContributions(goalId),
  });

  if (isLoading) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!contributions?.length) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">No contribution history yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 max-h-48 space-y-2 overflow-y-auto border-t border-border pt-4">
      {contributions.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          {c.user_picture ? (
            <Image
              src={c.user_picture}
              alt={c.user_name}
              width={18}
              height={18}
              className="rounded-full"
            />
          ) : (
            <div className="h-[18px] w-[18px] rounded-full bg-muted" />
          )}
          <span className="font-medium">{c.user_name}</span>
          <span className="text-accent font-medium">+{formatCurrency(c.amount)}</span>
          {c.note && <span className="truncate text-muted-foreground italic">{c.note}</span>}
          <span className="ml-auto text-muted-foreground">
            {new Date(c.created_at).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function CreateGoalDialog({
  onClose,
  onSuccess,
  householdId,
}: {
  onClose: () => void;
  onSuccess: () => void;
  householdId: number | null;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const scope = useScope();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [targetDate, setTargetDate] = useState("");
  const [color, setColor] = useState("#6d28d9");
  const [isShared, setIsShared] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<number[]>([]);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", isShared ? "household" : "personal"],
    queryFn: () => api.getAccounts(isShared ? "household" : "personal"),
  });

  const depositoryAccounts = useMemo(
    () => accounts?.filter((a) => a.type === "depository" || a.type === "investment") ?? [],
    [accounts]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createGoal({
        name: name.trim(),
        target_amount: parseFloat(targetAmount) || 0,
        current_amount: linkedAccounts.length ? 0 : parseFloat(currentAmount) || 0,
        target_date: targetDate || undefined,
        color,
        household_id: isShared && householdId ? householdId : undefined,
        linked_account_ids: linkedAccounts.length ? linkedAccounts : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount || parseFloat(targetAmount) <= 0) return;
    createMutation.mutate();
  };

  const toggleAccount = (id: number) => {
    setLinkedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isShared ? "New Shared Goal" : "New Goal"}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Goal name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency fund"
              className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {householdId && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-muted/50 px-4 py-3">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-muted text-accent focus:ring-accent"
              />
              <Users className="h-4 w-4 text-accent" />
              <div>
                <span className="text-sm font-medium">Shared goal</span>
                <p className="text-[11px] text-muted-foreground">Both partners can contribute</p>
              </div>
            </label>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Target amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
              />
            </div>
            {!linkedAccounts.length && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Current amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Target date <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
            />
          </div>

          {/* Link to accounts */}
          <div>
            <button
              type="button"
              onClick={() => setShowAccountPicker(!showAccountPicker)}
              className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Link2 className="h-4 w-4 text-blue-400" />
              <span className="flex-1 text-left">
                {linkedAccounts.length
                  ? `${linkedAccounts.length} account${linkedAccounts.length !== 1 ? "s" : ""} linked`
                  : "Link to accounts (auto-track balance)"}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showAccountPicker ? "rotate-180" : ""}`}
              />
            </button>
            {showAccountPicker && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-card p-2 space-y-1">
                {depositoryAccounts.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No eligible accounts</p>
                ) : (
                  depositoryAccounts.map((acct) => (
                    <label
                      key={acct.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={linkedAccounts.includes(acct.id)}
                        onChange={() => toggleAccount(acct.id)}
                        className="h-3.5 w-3.5 rounded border-border bg-muted text-accent focus:ring-accent"
                      />
                      <span className="flex-1 truncate">{acct.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`h-8 w-8 rounded-full transition-all hover:scale-110 ${
                    color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-card" : ""
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !name.trim() ||
                !targetAmount ||
                parseFloat(targetAmount) <= 0 ||
                createMutation.isPending
              }
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isShared ? "Create Shared Goal" : "Create Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpdateProgressDialog({
  goal,
  onClose,
  onSuccess,
}: {
  goal: Goal;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const contributeMutation = useMutation({
    mutationFn: () => api.addGoalContribution(goal.id, parseFloat(amount), note || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goalContributions", goal.id] });
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const add = parseFloat(amount);
    if (isNaN(add) || add <= 0) return;
    contributeMutation.mutate();
  };

  if (goal.is_account_linked) {
    return (
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{goal.name}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <Link2 className="h-4 w-4" />
              Auto-tracking from linked accounts
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Progress is automatically calculated from linked account balances.
            </p>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Current: {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add to {goal.name}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Current: {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Amount to add
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Note <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bonus deposit"
              className="w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent placeholder:text-muted-foreground"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!amount || parseFloat(amount) <= 0 || contributeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {contributeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
