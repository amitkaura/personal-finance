"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Target,
  Calendar,
  Trash2,
  Check,
  TrendingUp,
  X,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrency, useScope } from "@/lib/hooks";
import type { Goal } from "@/lib/types";
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
  const isViewingOwn = scope === "personal";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [updateProgressGoal, setUpdateProgressGoal] = useState<Goal | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["goals", scope],
    queryFn: () => api.getGoals(scope),
  });

  const activeGoals = goals.filter((g) => !g.is_completed);
  const completedGoals = goals.filter((g) => g.is_completed);

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
        {isViewingOwn && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            <Plus className="h-4 w-4" />
            New Goal
          </button>
        )}
      </div>

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
        <EmptyState onNewGoal={() => setCreateOpen(true)} editable={isViewingOwn} />
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
                    editable={isViewingOwn}
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
                    editable={isViewingOwn}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {isViewingOwn && createOpen && (
        <CreateGoalDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            invalidate();
          }}
        />
      )}

      {isViewingOwn && updateProgressGoal && (
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

      {isViewingOwn && deleteGoal && (
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
        <h3 className="text-lg font-semibold">{goal.name}</h3>
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
        {editable && !goal.is_completed && (
          <>
            <button
              onClick={onUpdateProgress}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80"
            >
              <TrendingUp className="h-3 w-3" />
              Update Progress
            </button>
            {progress >= 100 && (
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
          </>
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
    </div>
  );
}

function CreateGoalDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [targetDate, setTargetDate] = useState("");
  const [color, setColor] = useState("#6d28d9");

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
        current_amount: parseFloat(currentAmount) || 0,
        target_date: targetDate || undefined,
        color,
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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">New Goal</h3>
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
              Create Goal
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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const updateMutation = useMutation({
    mutationFn: (addAmount: number) =>
      api.updateGoal(goal.id, {
        current_amount: goal.current_amount + addAmount,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const add = parseFloat(amount);
    if (isNaN(add) || add <= 0) return;
    updateMutation.mutate(add);
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

        <form onSubmit={handleSubmit} className="mt-4">
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
              disabled={!amount || parseFloat(amount) <= 0 || updateMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {updateMutation.isPending ? (
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
