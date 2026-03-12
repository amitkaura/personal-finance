"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";
import type { UserSettings, CategoryRule } from "@/lib/types";
import ConfirmDialog from "@/components/confirm-dialog";

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "JPY", "CHF", "INR", "BRL", "MXN"];
const DATE_FORMATS = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
const LOCALES = [
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ja-JP", label: "Japanese" },
];
const TIMEZONES = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];
const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transportation",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Health & Fitness",
  "Travel",
  "Education",
  "Subscriptions",
  "Income",
  "Transfer",
  "Rent & Mortgage",
  "Insurance",
  "Investments",
  "Other",
];

const selectClass =
  "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";
const inputClass =
  "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";
const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Configure your preferences and manage your data.
      </p>
      <div className="mt-8 space-y-6">
        <GeneralSection />
        <SyncSection />
        <CategoryRulesSection />
        <AiSection />
        <DataSection />
      </div>
    </>
  );
}

// ── General ───────────────────────────────────────────────────

function GeneralSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});

  const currency = form.currency ?? settings?.currency ?? "CAD";
  const dateFormat = form.date_format ?? settings?.date_format ?? "YYYY-MM-DD";
  const locale = form.locale ?? settings?.locale ?? "en-CA";

  const dirty =
    form.currency !== undefined ||
    form.date_format !== undefined ||
    form.locale !== undefined;

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">General</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Display preferences for currency, dates, and number formatting.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className={`${selectClass} w-full`}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date Format</label>
          <select
            value={dateFormat}
            onChange={(e) => setForm({ ...form, date_format: e.target.value })}
            className={`${selectClass} w-full`}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Locale</label>
          <select
            value={locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
            className={`${selectClass} w-full`}
          >
            {LOCALES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {dirty && (
        <div className="mt-4 flex justify-end">
          <SaveButton
            loading={mutation.isPending}
            onClick={() => mutation.mutate(form)}
          />
        </div>
      )}
    </div>
  );
}

// ── Sync Schedule ─────────────────────────────────────────────

function SyncSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});

  const enabled = form.sync_enabled ?? settings?.sync_enabled ?? true;
  const hour = form.sync_hour ?? settings?.sync_hour ?? 0;
  const minute = form.sync_minute ?? settings?.sync_minute ?? 0;
  const timezone = form.sync_timezone ?? settings?.sync_timezone ?? "America/Toronto";

  const dirty =
    form.sync_enabled !== undefined ||
    form.sync_hour !== undefined ||
    form.sync_minute !== undefined ||
    form.sync_timezone !== undefined;

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Sync Schedule</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatically sync transactions from all connected accounts.
          </p>
        </div>
        <button
          onClick={() => setForm({ ...form, sync_enabled: !enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-accent" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {enabled && (
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Hour</label>
            <select
              value={hour}
              onChange={(e) =>
                setForm({ ...form, sync_hour: parseInt(e.target.value) })
              }
              className={`${selectClass} w-full`}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Minute</label>
            <select
              value={minute}
              onChange={(e) =>
                setForm({ ...form, sync_minute: parseInt(e.target.value) })
              }
              className={`${selectClass} w-full`}
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  :{String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <select
              value={timezone}
              onChange={(e) =>
                setForm({ ...form, sync_timezone: e.target.value })
              }
              className={`${selectClass} w-full`}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {dirty && (
        <div className="mt-4 flex justify-end">
          <SaveButton
            loading={mutation.isPending}
            onClick={() => mutation.mutate(form)}
          />
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

  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CategoryRule>>({});

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
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
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
                        className="rounded p-1 text-success hover:bg-success/15"
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
                        onClick={() => deleteMutation.mutate(rule.id)}
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
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
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
          Case
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
    </div>
  );
}

// ── AI Categorization ─────────────────────────────────────────

function AiSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const baseUrl = form.llm_base_url ?? settings?.llm_base_url ?? "";
  const model = form.llm_model ?? settings?.llm_model ?? "";
  const keyIsSet = settings?.llm_api_key_set ?? false;

  const dirty =
    form.llm_base_url !== undefined ||
    form.llm_model !== undefined ||
    apiKey.length > 0;

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
      setApiKey("");
    },
  });

  function handleSave() {
    const payload: Partial<UserSettings> & { llm_api_key?: string } = {
      ...form,
    };
    if (apiKey) {
      payload.llm_api_key = apiKey;
    }
    mutation.mutate(payload);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">AI Categorization</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Configure the LLM provider used as a fallback when no keyword rules
        match. Works with OpenAI, Ollama, Azure, and any OpenAI-compatible API.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) =>
              setForm({ ...form, llm_base_url: e.target.value })
            }
            placeholder="https://api.openai.com/v1"
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className={labelClass}>Model</label>
          <input
            value={model}
            onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
            placeholder="gpt-4o-mini"
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className={labelClass}>API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyIsSet ? "••••••••  (key is set)" : "sk-..."}
              className={`${inputClass} w-full pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      {dirty && (
        <div className="mt-4 flex justify-end">
          <SaveButton
            loading={mutation.isPending}
            onClick={handleSave}
          />
        </div>
      )}
    </div>
  );
}

// ── Data Management ───────────────────────────────────────────

function DataSection() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClear() {
    setClearing(true);
    try {
      await api.clearTransactions();
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Data Management</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Export your data or clear transaction history.
      </p>

      <div className="mt-5 flex items-center gap-4">
        <a
          href={api.exportTransactions()}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          <Download className="h-4 w-4" />
          Export Transactions (CSV)
        </a>
      </div>

      <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Permanently delete all transaction records. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          <Trash2 className="h-4 w-4" />
          Clear All Transactions
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear all transactions?"
        description="This will permanently delete every transaction record. Connected accounts and category rules will remain. This action cannot be undone."
        confirmLabel="Delete Everything"
        destructive
        loading={clearing}
        onConfirm={handleClear}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────

function SaveButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {loading ? "Saving..." : "Save"}
    </button>
  );
}
