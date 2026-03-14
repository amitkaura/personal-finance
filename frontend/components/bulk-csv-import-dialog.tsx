"use client";

import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { api, BulkImportPayload, ImportProgressEvent, ImportCompleteEvent } from "@/lib/api";
import { useCategorizationProgress } from "@/components/categorization-progress-provider";
import { useHousehold } from "@/components/household-provider";
import { ACCOUNT_TYPES, SUBTYPES } from "@/app/accounts/page";
import {
  parseCsv,
  guessRole,
  buildBulkMappedRows,
  matchCategories,
  ROLE_OPTIONS,
  type ColumnRole,
  type BulkMappedRow,
  type CategoryMatch,
} from "@/lib/csv-utils";

interface Props {
  onClose: () => void;
}

type Step = "upload" | "columns" | "accounts" | "categories" | "preview" | "importing" | "result";

export default function BulkCsvImportDialog({ onClose }: Props) {
  const queryClient = useQueryClient();
  const { startAutoCategorize } = useCategorizationProgress();
  const { data: llmConfig } = useQuery({ queryKey: ["llm-config"], queryFn: api.getLLMConfig });
  const fileRef = useRef<HTMLInputElement>(null);
  const { household } = useHousehold();
  const [step, setStep] = useState<Step>("upload");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnRoles, setColumnRoles] = useState<ColumnRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);
  const [result, setResult] = useState<ImportCompleteEvent | null>(null);
  const [negateAmounts, setNegateAmounts] = useState(false);
  const [accountMeta, setAccountMeta] = useState<Record<string, { type: string; subtype: string; balance: string }>>({});

  const { data: existingAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.getAccounts(),
  });

  const { data: existingCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.getCategories(),
  });

  const headers = rawRows[0] ?? [];

  const hasRequired =
    columnRoles.includes("date") &&
    columnRoles.includes("merchant") &&
    (columnRoles.includes("amount") || columnRoles.includes("debit") || columnRoles.includes("credit"));

  const mappedRows = useMemo<BulkMappedRow[]>(() => {
    if (!hasRequired || rawRows.length < 2) return [];
    return buildBulkMappedRows(rawRows, columnRoles, { negateAmounts });
  }, [rawRows, columnRoles, hasRequired, negateAmounts]);

  const csvAccountNames = useMemo(() => {
    const names = new Set(mappedRows.map((r) => r.account_name).filter(Boolean));
    return [...names] as string[];
  }, [mappedRows]);

  const existingAccountNames = useMemo(
    () => new Set((existingAccounts ?? []).map((a) => a.name.toLowerCase())),
    [existingAccounts],
  );

  const csvCategories = useMemo(() => {
    const cats = new Set(mappedRows.map((r) => r.category).filter(Boolean));
    return [...cats] as string[];
  }, [mappedRows]);

  const categoryMatches = useMemo<CategoryMatch[]>(() => {
    if (csvCategories.length === 0 || !existingCategories) return [];
    return matchCategories(csvCategories, existingCategories);
  }, [csvCategories, existingCategories]);

  const hasOwnerColumn = columnRoles.includes("owner");
  const showOwnersStep = hasOwnerColumn && !!household;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result as string);
      if (parsed.length < 2) {
        setError("CSV must contain a header row and at least one data row.");
        return;
      }
      setError(null);
      setRawRows(parsed);
      setColumnRoles(parsed[0].map((h) => guessRole(h)));
      setStep("columns");
    };
    reader.readAsText(file);
  }

  function handleRoleChange(idx: number, role: ColumnRole) {
    setColumnRoles((prev) => {
      const next = [...prev];
      next[idx] = role;
      return next;
    });
  }

  function nextFromColumns() {
    if (csvAccountNames.length > 0) {
      const meta: Record<string, { type: string; subtype: string; balance: string }> = {};
      for (const name of csvAccountNames) {
        if (!existingAccountNames.has(name.toLowerCase()) && !accountMeta[name]) {
          meta[name] = { type: "depository", subtype: SUBTYPES["depository"]?.[0] ?? "", balance: "0" };
        }
      }
      if (Object.keys(meta).length > 0) {
        setAccountMeta((prev) => ({ ...prev, ...meta }));
      }
      setStep("accounts");
    } else if (csvCategories.length > 0) {
      setStep("categories");
    } else {
      setStep("preview");
    }
  }

  function nextFromAccounts() {
    if (csvCategories.length > 0) {
      setStep("categories");
    } else {
      setStep("preview");
    }
  }

  function backFromAccounts() {
    setStep("columns");
  }

  function backFromCategories() {
    if (csvAccountNames.length > 0) {
      setStep("accounts");
    } else {
      setStep("columns");
    }
  }

  async function handleImport() {
    setStep("importing");
    setError(null);
    try {
      const newAccountNames = csvAccountNames.filter(
        (n) => !existingAccountNames.has(n.toLowerCase()),
      );
      const newCategories = categoryMatches
        .filter((m) => m.isNew)
        .map((m) => m.csvCategory);

      const payload: BulkImportPayload = {
        accounts: newAccountNames.map((name) => {
          const m = accountMeta[name];
          return {
            name,
            type: m?.type ?? "depository",
            subtype: m?.subtype ?? SUBTYPES["depository"]?.[0] ?? "",
            current_balance: parseFloat(m?.balance ?? "0") || 0,
          };
        }),
        transactions: mappedRows,
        new_categories: newCategories,
        skip_llm: true,
      };

      const complete = await api.bulkImportTransactions(payload, (evt) =>
        setProgress(evt),
      );
      setResult(complete);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (complete.imported > complete.categorized) {
        startAutoCategorize();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }
  }

  const selectClass =
    "rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer w-full";

  const stepLabels = ["Upload", "Map Columns", "Accounts", "Categories", "Preview"];
  const stepOrder: Step[] = ["upload", "columns", "accounts", "categories", "preview"];
  const currentStepIdx = stepOrder.indexOf(
    step === "importing" || step === "result" ? "preview" : step,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Bulk Import Accounts &amp; Transactions</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-4 flex gap-1">
          {stepLabels.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${currentStepIdx >= i ? "bg-accent" : "bg-muted"}`} />
          ))}
        </div>

        {/* ── Upload ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import transactions from a bank export or spreadsheet. Accounts are created automatically from your CSV if they don&apos;t already exist.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Required columns:</strong> Date, Amount (or separate Debit/Credit columns), Description / Merchant name.
              <br />
              <strong>Optional columns:</strong> Category, Account name, Notes, Owner (for shared households).
            </p>
            <p className="text-xs text-muted-foreground">
              Duplicates are automatically detected and skipped.
            </p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-sm text-muted-foreground hover:border-accent hover:text-foreground w-full justify-center transition-colors"
            >
              <Upload className="h-5 w-5" />
              Choose CSV file
            </button>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        {/* ── Column mapping ── */}
        {step === "columns" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We auto-detected your columns. Verify the assignments below and fix any that look wrong.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Column</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Sample</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{header}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">
                        {rawRows[1]?.[i] ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={columnRoles[i]}
                          onChange={(e) => handleRoleChange(i, e.target.value as ColumnRole)}
                          className={selectClass}
                        >
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={negateAmounts}
                onChange={(e) => setNegateAmounts(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-muted-foreground">
                Negate amounts (flip income/expense signs)
              </span>
            </label>

            {!hasRequired && (
              <p className="text-xs text-amber-400">
                Assign at least Date, Merchant, and Amount (or Debit/Credit) to continue.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep("upload"); setRawRows([]); setColumnRoles([]); }}
                className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex-1" />
              <button
                onClick={nextFromColumns}
                disabled={!hasRequired || mappedRows.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Accounts review ── */}
        {step === "accounts" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {csvAccountNames.length} account{csvAccountNames.length !== 1 ? "s" : ""} found in your CSV. Match them to existing accounts or let us create new ones. You can set the account type and starting balance for new accounts.
            </p>
            <div className="space-y-2">
              {csvAccountNames.map((name) => {
                const exists = existingAccountNames.has(name.toLowerCase());
                const meta = accountMeta[name];
                return (
                  <div key={name} className="rounded-lg border border-border px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${exists ? "bg-muted text-muted-foreground" : "bg-accent/20 text-accent"}`}>
                        {exists ? "Existing" : "New"}
                      </span>
                    </div>
                    {!exists && meta && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="w-32">
                          <label className="mb-0.5 block text-[10px] text-muted-foreground">Type</label>
                          <select
                            value={meta.type}
                            onChange={(e) => {
                              const newType = e.target.value;
                              const subs = SUBTYPES[newType] ?? [];
                              setAccountMeta((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], type: newType, subtype: subs[0] ?? "" },
                              }));
                            }}
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-accent"
                          >
                            {ACCOUNT_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-32">
                          <label className="mb-0.5 block text-[10px] text-muted-foreground">Subtype</label>
                          <select
                            value={meta.subtype}
                            onChange={(e) =>
                              setAccountMeta((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], subtype: e.target.value },
                              }))
                            }
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs capitalize outline-none focus:ring-1 focus:ring-accent"
                          >
                            {(SUBTYPES[meta.type] ?? []).map((sub) => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-28">
                          <label className="mb-0.5 block text-[10px] text-muted-foreground">Balance</label>
                          <input
                            type="number"
                            step="0.01"
                            value={meta.balance}
                            onChange={(e) =>
                              setAccountMeta((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], balance: e.target.value },
                              }))
                            }
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums outline-none focus:ring-1 focus:ring-accent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={backFromAccounts} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex-1" />
              <button onClick={nextFromAccounts} className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Category matching ── */}
        {step === "categories" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {csvCategories.length} categories found in your CSV. We matched them against your existing categories. Unmatched categories will be created as new.
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {categoryMatches.map((m) => (
                <div key={m.csvCategory} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium">{m.csvCategory}</span>
                    {m.suggestion && (
                      <span className="ml-2 text-xs text-muted-foreground">→ {m.suggestion}</span>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    m.confidence === "exact" ? "bg-green-500/20 text-green-400" :
                    m.confidence === "fuzzy" ? "bg-amber-500/20 text-amber-400" :
                    "bg-accent/20 text-accent"
                  }`}>
                    {m.confidence === "exact" ? "Exact" : m.confidence === "fuzzy" ? "~Fuzzy" : "New"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={backFromCategories} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex-1" />
              <button onClick={() => setStep("preview")} className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Ready to import:</p>
              <p>{mappedRows.length} transactions{csvAccountNames.length > 0 && ` across ${csvAccountNames.length} account${csvAccountNames.length !== 1 ? "s" : ""}`}</p>
              <p>Duplicates will be skipped</p>
              <p>Uncategorized transactions will be auto-categorized {llmConfig?.configured ? "by rules and AI" : "by rules"}</p>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border text-xs">
              <table className="w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Date</th>
                    <th className="px-2 py-1.5 text-left font-medium">Merchant</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                    {csvAccountNames.length > 0 && <th className="px-2 py-1.5 text-left font-medium">Account</th>}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">{r.date}</td>
                      <td className="px-2 py-1 truncate max-w-[150px]">{r.merchant_name}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${r.amount < 0 ? "text-green-400" : ""}`}>
                        {r.amount < 0 ? "+" : ""}{Math.abs(r.amount).toFixed(2)}
                      </td>
                      {csvAccountNames.length > 0 && (
                        <td className="px-2 py-1 text-muted-foreground">{r.account_name ?? "—"}</td>
                      )}
                    </tr>
                  ))}
                  {mappedRows.length > 20 && (
                    <tr className="border-t border-border">
                      <td colSpan={csvAccountNames.length > 0 ? 4 : 3} className="px-2 py-1 text-center text-muted-foreground">
                        ...and {mappedRows.length - 20} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={negateAmounts}
                onChange={(e) => setNegateAmounts(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-muted-foreground">
                Negate amounts (flip income/expense signs)
              </span>
            </label>

            <p className="text-xs text-muted-foreground">
              {llmConfig?.configured
                ? "Transactions will be auto-categorized in the background after import."
                : "Transactions will be categorized by rules after import. Configure AI in Settings for smarter categorization."}
            </p>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (csvCategories.length > 0) setStep("categories");
                  else if (csvAccountNames.length > 0) setStep("accounts");
                  else setStep("columns");
                }}
                className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex-1" />
              <button
                onClick={handleImport}
                disabled={mappedRows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Import {mappedRows.length} transactions
              </button>
            </div>
          </div>
        )}

        {/* ── Importing ── */}
        {step === "importing" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </div>
            {progress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="truncate max-w-[200px]">{progress.merchant}</span>
                  <span>{progress.current}/{progress.total}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Result ── */}
        {step === "result" && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Import complete</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {result.imported} imported, {result.skipped} skipped, {result.categorized} auto-categorized
            </p>
            {result.errors.length > 0 && (
              <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {result.errors.length > 5 && <p>...and {result.errors.length - 5} more</p>}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
