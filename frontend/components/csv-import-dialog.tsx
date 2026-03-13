"use client";

import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { api, ImportProgressEvent, ImportCompleteEvent } from "@/lib/api";
import {
  parseCsv,
  guessRole,
  buildMappedRows,
  ROLE_OPTIONS,
  type ColumnRole,
  type MappedRow,
} from "@/lib/csv-utils";

interface Props {
  accountId: number;
  accountName: string;
  onClose: () => void;
}

type Step = "upload" | "columns" | "preview" | "importing" | "result";

export default function CsvImportDialog({ accountId, accountName, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnRoles, setColumnRoles] = useState<ColumnRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);
  const [result, setResult] = useState<ImportCompleteEvent | null>(null);
  const [negateAmounts, setNegateAmounts] = useState(false);

  const headers = rawRows[0] ?? [];

  const hasDateAndMerchant =
    columnRoles.includes("date") &&
    columnRoles.includes("merchant") &&
    (columnRoles.includes("amount") || columnRoles.includes("debit") || columnRoles.includes("credit"));

  const mappedRows = useMemo<MappedRow[]>(() => {
    if (!hasDateAndMerchant || rawRows.length < 2) return [];
    return buildMappedRows(rawRows, columnRoles, { negateAmounts });
  }, [rawRows, columnRoles, hasDateAndMerchant, negateAmounts]);

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
      const guessed = parsed[0].map((h) => guessRole(h));
      setColumnRoles(guessed);
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

  async function handleImport() {
    setStep("importing");
    setError(null);
    try {
      const complete = await api.streamImportTransactions(
        accountId,
        mappedRows,
        (evt) => setProgress(evt),
      );
      setResult(complete);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }
  }

  const selectClass =
    "rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Import CSV to {accountName}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-4 flex gap-1">
          {(["Upload", "Map Columns", "Preview"] as const).map((label, i) => {
            const stepOrder: Step[] = ["upload", "columns", "preview"];
            const active = stepOrder.indexOf(
              step === "importing" || step === "result" ? "preview" : step,
            ) >= i;
            return (
              <div
                key={label}
                className={`h-1 flex-1 rounded-full ${active ? "bg-accent" : "bg-muted"}`}
              />
            );
          })}
        </div>

        {/* ── Upload step ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file exported from your bank. We'll auto-detect columns.
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
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Column mapping step ── */}
        {step === "columns" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Verify column assignments. Banks that use separate Debit/Credit columns are supported.
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
                          {ROLE_OPTIONS.filter((o) => !["account", "original_statement", "owner"].includes(o.value)).map((o) => (
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

            {!hasDateAndMerchant && (
              <p className="text-xs text-amber-400">
                Assign at least Date, Merchant, and Amount (or Debit/Credit) columns to continue.
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
                onClick={() => setStep("preview")}
                disabled={!hasDateAndMerchant || mappedRows.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Preview step ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {mappedRows.length} transactions ready to import.
              {rawRows.length - 1 - mappedRows.length > 0 &&
                ` (${rawRows.length - 1 - mappedRows.length} rows skipped due to invalid data)`}
            </p>

            <div className="max-h-60 overflow-y-auto rounded-lg border border-border text-xs">
              <table className="w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Date</th>
                    <th className="px-2 py-1.5 text-left font-medium">Merchant</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                    <th className="px-2 py-1.5 text-left font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">{r.date}</td>
                      <td className="px-2 py-1 truncate max-w-[180px]">{r.merchant_name}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${r.amount < 0 ? "text-green-400" : ""}`}>
                        {r.amount < 0 ? "+" : ""}
                        {Math.abs(r.amount).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">{r.category ?? "—"}</td>
                    </tr>
                  ))}
                  {mappedRows.length > 20 && (
                    <tr className="border-t border-border">
                      <td colSpan={4} className="px-2 py-1 text-center text-muted-foreground">
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

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep("columns")}
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

        {/* ── Importing step ── */}
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

        {/* ── Result step ── */}
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
