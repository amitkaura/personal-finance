"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
  Tags,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Category, CategoryRule } from "@/lib/types";
import ConfirmDialog from "@/components/confirm-dialog";

const inputClass =
  "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";
const selectClass =
  "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";
const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";

export default function CategoriesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
      <p className="text-sm text-muted-foreground">
        Manage your transaction categories and keyword-based categorization
        rules.
      </p>
      <div className="mt-8 space-y-6">
        <CategoriesSection />
        <CategoryRulesSection />
      </div>
    </>
  );
}

// ── Categories ────────────────────────────────────────────────

function CategoriesSection() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ["categoryObjects"],
    queryFn: api.getCategoryObjects,
  });

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Pick<Category, "id" | "name"> | null>(null);
  const [reassignMode, setReassignMode] = useState<"reassign" | "uncategorize">(
    "uncategorize"
  );
  const [reassignToId, setReassignToId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [txnCount, setTxnCount] = useState<number | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categoryObjects"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setNewName("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.updateCategory(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categoryObjects"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setEditingId(null);
      setEditName("");
    },
  });

  function startEdit(cat: Pick<Category, "id" | "name">) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  async function openDeleteDialog(cat: Pick<Category, "id" | "name">) {
    setDeleteTarget(cat);
    setReassignMode("uncategorize");
    setReassignToId(null);
    setTxnCount(null);
    try {
      const txns = await api.getTransactions({ category: cat.name, limit: 200 });
      setTxnCount(txns.length);
    } catch {
      setTxnCount(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCategory(
        deleteTarget.id,
        reassignMode === "reassign" && reassignToId != null
          ? reassignToId
          : undefined
      );
      queryClient.invalidateQueries({ queryKey: ["categoryObjects"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!deleteTarget) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteTarget(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deleteTarget]);

  const otherCategories = categories
    ?.filter((c) => c.id !== deleteTarget?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Tags className="h-4 w-4 text-accent" />
        <h2 className="text-base font-semibold">Categories</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Add, rename, or remove categories. Renaming updates all transactions and
        rules automatically.
      </p>

      {isLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {categories?.length === 0 && (
            <p className="w-full py-4 text-center text-sm text-muted-foreground">
              No categories yet. Add one below to get started.
            </p>
          )}
          {categories?.map((cat) =>
            editingId === cat.id ? (
              <div
                key={cat.id}
                className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/5 px-3 py-1.5"
              >
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-36 bg-transparent text-sm outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim())
                      updateMutation.mutate({ id: cat.id, name: editName.trim() });
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditName("");
                    }
                  }}
                />
                <button
                  onClick={() =>
                    editName.trim() &&
                    updateMutation.mutate({ id: cat.id, name: editName.trim() })
                  }
                  disabled={!editName.trim() || updateMutation.isPending}
                  className="rounded p-0.5 text-green-400 hover:bg-green-500/15"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setEditName("");
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div
                key={cat.id}
                className="group flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm transition-colors hover:border-accent/30"
              >
                <span>{cat.name}</span>
                <button
                  onClick={() => startEdit(cat)}
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => openDeleteDialog(cat)}
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Add new category */}
      <div className="mt-4 flex items-center gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className={`${inputClass} flex-1`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim())
              createMutation.mutate(newName.trim());
          }}
        />
        <button
          onClick={() =>
            newName.trim() && createMutation.mutate(newName.trim())
          }
          disabled={!newName.trim() || createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </button>
      </div>

      {createMutation.isError && (
        <p className="mt-2 text-xs text-red-400">
          {(createMutation.error as Error).message}
        </p>
      )}
      {updateMutation.isError && (
        <p className="mt-2 text-xs text-red-400">
          {(updateMutation.error as Error).message}
        </p>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === overlayRef.current) setDeleteTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-semibold">
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {txnCount !== null && txnCount > 0
                ? `There are ${txnCount} transaction${txnCount === 1 ? "" : "s"} in this category.`
                : "No transactions use this category."}{" "}
              How would you like to handle them?
            </p>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="reassign"
                  checked={reassignMode === "uncategorize"}
                  onChange={() => setReassignMode("uncategorize")}
                  className="accent-accent"
                />
                <span className="text-sm">Leave uncategorized</span>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="reassign"
                  checked={reassignMode === "reassign"}
                  onChange={() => setReassignMode("reassign")}
                  className="mt-0.5 accent-accent"
                />
                <div className="flex-1">
                  <span className="text-sm">Reassign to another category</span>
                  {reassignMode === "reassign" && (
                    <select
                      value={reassignToId ?? ""}
                      onChange={(e) =>
                        setReassignToId(
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className={`${selectClass} mt-2 w-full`}
                    >
                      <option value="">Select a category...</option>
                      {otherCategories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={
                  deleting ||
                  (reassignMode === "reassign" && reassignToId == null)
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Category Rules ────────────────────────────────────────────

function CategoryRulesSection() {
  const queryClient = useQueryClient();
  const { data: rules } = useQuery({
    queryKey: ["rules"],
    queryFn: api.getRules,
  });
  const { data: categories } = useQuery({
    queryKey: ["categoryObjects"],
    queryFn: api.getCategoryObjects,
  });

  const categoryNames = (categories?.map((c) => c.name) ?? []).sort((a, b) => a.localeCompare(b));

  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CategoryRule>>({});
  const [ruleDeleteId, setRuleDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!newCategory && categoryNames.length > 0) {
      setNewCategory(categoryNames[0]);
    }
  }, [categoryNames, newCategory]);

  const createMutation = useMutation({
    mutationFn: api.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setNewKeyword("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Partial<CategoryRule> & { id: number }) =>
      api.updateRule(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setEditingId(null);
      setEditForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });

  function startEdit(rule: CategoryRule) {
    setEditingId(rule.id);
    setEditForm({
      keyword: rule.keyword,
      category: rule.category,
      case_sensitive: rule.case_sensitive,
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Category Rules</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Keyword rules for automatic categorization. Matched before the AI
        fallback.
      </p>

      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5">Keyword</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Case Sensitive</th>
              <th className="px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {rules?.map((rule) =>
              editingId === rule.id ? (
                <tr key={rule.id} className="border-b border-border">
                  <td className="px-4 py-2">
                    <input
                      value={editForm.keyword ?? ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, keyword: e.target.value })
                      }
                      className={`${inputClass} w-full`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editForm.category ?? ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value })
                      }
                      className={`${selectClass} w-full`}
                    >
                      {categoryNames.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={editForm.case_sensitive ?? false}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          case_sensitive: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded accent-accent"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          updateMutation.mutate({
                            id: rule.id,
                            ...editForm,
                          })
                        }
                        className="rounded p-1 text-green-400 hover:bg-green-500/15"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditForm({});
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={rule.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {rule.keyword}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {rule.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {rule.case_sensitive ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(rule)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setRuleDeleteId(rule.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {(!rules || rules.length === 0) && editingId === null && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-xs text-muted-foreground"
                >
                  No rules yet. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add new rule */}
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label className={labelClass}>Keyword</label>
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="e.g. Starbucks"
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="flex-1">
          <label className={labelClass}>Category</label>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className={`${selectClass} w-full`}
          >
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={newCaseSensitive}
            onChange={(e) => setNewCaseSensitive(e.target.checked)}
            className="h-4 w-4 rounded accent-accent"
          />
          Case sensitive
        </label>
        <button
          onClick={() =>
            newKeyword.trim() &&
            createMutation.mutate({
              keyword: newKeyword.trim(),
              category: newCategory,
              case_sensitive: newCaseSensitive,
            })
          }
          disabled={!newKeyword.trim() || createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>

      <ConfirmDialog
        open={ruleDeleteId !== null}
        title="Delete category rule"
        description="This keyword rule will be permanently deleted. Transactions already categorized by this rule will keep their current category."
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (ruleDeleteId !== null) {
            deleteMutation.mutate(ruleDeleteId, {
              onSuccess: () => setRuleDeleteId(null),
            });
          }
        }}
        onCancel={() => setRuleDeleteId(null)}
      />
    </div>
  );
}
