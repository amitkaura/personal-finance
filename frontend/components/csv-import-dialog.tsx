"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  X,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  Tag,
  SkipForward,
} from "lucide-react";
import {
  api,
  type ImportProgressEvent,
  type ImportCompleteEvent,
} from "@/lib/api";
import {
  type ColumnRole,
  type MappedRow,
  ROLE_OPTIONS,
  parseCsv,
  guessRole,
  buildMappedRows,
} from "@/lib/csv-utils";

type Step = "upload" | "map" | "preview" | "importing" | "result";

interface ProgressState {
  current: number;
  total: number;
  items: ImportProgressEvent[];
}

export default function CsvImportDialog({
  accountId,
  accountName,
  onClose,
}: {
  accountId: number;
  accountName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnRoles, setColumnRoles] = useState<ColumnRole[]>([]);
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [result, setResult] = useState<ImportCompleteEvent | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    current: 0,
    total: 0,
    items: [],
  });
  const [importing, setImporting] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress.items.length]);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setParseError("CSV must have at least a header row and one data row.");
        return;
      }
      setRawRows(rows);
      const header = rows[0];
      setColumnRoles(header.map(guessRole));
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) handleFile(file);
    },
    [handleFile],
  );

  const hasAmountColumn = columnRoles.includes("amount");
  const hasDebitOrCredit =
    columnRoles.includes("debit") || columnRoles.includes("credit");
  const canProceed =
    columnRoles.includes("date") &&
    columnRoles.includes("merchant") &&
    (hasAmountColumn || hasDebitOrCredit);

  function goToPreview() {
    const rows = buildMappedRows(rawRows, columnRoles);
    setMappedRows(rows);
    setStep("preview");
  }

  async function startImport() {
    setImporting(true);
    setStep("importing");
    setProgress({ current: 0, total: mappedRows.length, items: [] });

    try {
      const complete = await api.streamImportTransactions(
        accountId,
        mappedRows,
        (event) => {
          setProgress((prev) => ({
            current: event.current,
            total: event.total,
            items: [...prev.items.slice(-99), event],
          }));
        },
      );
      setResult(complete);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch {
      setResult({
        type: "complete",
        imported: 0,
        skipped: 0,
        categorized: 0,
        errors: ["Import failed unexpectedly. Please try again."],
      });
      setStep("result");
    } finally {
      setImporting(false);
    }
  }

  const headerRow = rawRows[0] ?? [];
  const previewData = rawRows.slice(1, 6);

  const perAccountRoles = ROLE_OPTIONS.filter(
    (r) => !["account", "owner"].includes(r.value),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Import Transactions</h2>
            <p className="text-xs text-muted-foreground">
              Import CSV into {accountName}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps indicator */}
        {step !== "result" && <StepIndicator current={step} />}

        <div className="p-6">
          {/* Upload */}
          {step === "upload" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center transition-colors hover:border-accent/50"
            >
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">
                Drag & drop a CSV file here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Expected columns: Date, Merchant/Description, Amount (or
                Debit/Credit)
              </p>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80">
                <Upload className="h-4 w-4" />
                Choose File
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
              {parseError && (
                <p className="mt-3 text-sm text-red-400">{parseError}</p>
              )}
            </div>
          )}

          {/* Map Columns */}
          {step === "map" && (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">
                Assign a role to each column. At minimum, map{" "}
                <strong>Date</strong>, <strong>Merchant</strong>, and{" "}
                <strong>Amount</strong> (or Debit/Credit).
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {headerRow.map((h, i) => (
                        <th
                          key={i}
                          className="px-3 py-2 text-left font-normal"
                        >
                          <select
                            value={columnRoles[i]}
                            onChange={(e) => {
                              const next = [...columnRoles];
                              next[i] = e.target.value as ColumnRole;
                              setColumnRoles(next);
                            }}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                          >
                            {perAccountRoles.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1 truncate text-[10px] text-muted-foreground">
                            {h}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, ri) => (
                      <tr
                        key={ri}
                        className="border-b border-border/50 last:border-0"
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`px-3 py-1.5 text-xs ${
                              columnRoles[ci] === "skip"
                                ? "text-muted-foreground/50"
                                : ""
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {previewData.length} of {rawRows.length - 1} rows
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep("upload")}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <button
                    onClick={goToPreview}
                    disabled={!canProceed}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
                  >
                    Next
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {step === "preview" && (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">
                {mappedRows.length} transaction
                {mappedRows.length !== 1 ? "s" : ""} ready to import into{" "}
                <strong>{accountName}</strong>. Duplicates will be
                automatically skipped.
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Merchant
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Category
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="px-3 py-1.5 text-xs">{row.date}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {row.merchant_name}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-xs text-right tabular-nums ${
                            row.amount < 0 ? "text-green-500" : ""
                          }`}
                        >
                          {row.amount < 0 ? "+" : "-"}
                          {Math.abs(row.amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {row.category || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedRows.length > 100 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing first 100 of {mappedRows.length} rows
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setStep("map")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  onClick={startImport}
                  disabled={mappedRows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import {mappedRows.length} Transaction
                  {mappedRows.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* Importing */}
          {step === "importing" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Processing {progress.current} of {progress.total}{" "}
                    transactions...
                  </span>
                  <span className="tabular-nums font-medium">
                    {progress.total > 0
                      ? Math.round(
                          (progress.current / progress.total) * 100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-200"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div
                ref={feedRef}
                className="max-h-64 overflow-y-auto rounded-lg border border-border"
              >
                {progress.items.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Starting import...
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {progress.items.map((item, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="px-3 py-1.5 text-xs truncate max-w-[200px]">
                            {item.merchant}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-right">
                            <StatusBadge
                              status={item.status}
                              category={item.category}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {step === "result" && result && (
            <div className="space-y-4 text-center py-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
                <Check className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-lg font-semibold">Import Complete</p>
                <div className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
                  <span className="text-accent">
                    {result.imported} imported
                  </span>
                  {result.categorized > 0 && (
                    <span className="text-emerald-500">
                      {result.categorized} auto-categorized
                    </span>
                  )}
                  {result.skipped > 0 && (
                    <span className="text-muted-foreground">
                      {result.skipped} duplicates skipped
                    </span>
                  )}
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mx-auto max-w-md rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-red-400 mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {result.errors.length} error
                    {result.errors.length !== 1 ? "s" : ""}
                  </div>
                  <ul className="space-y-0.5 text-xs text-red-400/80">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 10 && (
                      <li>... and {result.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Columns" },
    { key: "preview", label: "Preview" },
    { key: "importing", label: "Import" },
  ];

  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1 border-b border-border px-6 py-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          {i > 0 && (
            <div
              className={`h-px w-4 ${i <= currentIdx ? "bg-accent" : "bg-border"}`}
            />
          )}
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              i === currentIdx
                ? "bg-accent/15 text-accent"
                : i < currentIdx
                  ? "text-accent/60"
                  : "text-muted-foreground/50"
            }`}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({
  status,
  category,
}: {
  status: string;
  category: string | null;
}) {
  switch (status) {
    case "categorized":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
          <Tag className="h-2.5 w-2.5" />
          {category}
        </span>
      );
    case "imported":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
          <Check className="h-2.5 w-2.5" />
          Imported
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium text-yellow-500">
          <SkipForward className="h-2.5 w-2.5" />
          Duplicate
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-500">
          <AlertCircle className="h-2.5 w-2.5" />
          Error
        </span>
      );
    default:
      return null;
  }
}
