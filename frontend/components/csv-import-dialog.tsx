"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { api, ImportProgressEvent, ImportCompleteEvent } from "@/lib/api";

interface Props {
  accountId: number;
  accountName: string;
  onClose: () => void;
}

interface ParsedRow {
  date: string;
  amount: number;
  merchant_name: string;
  category?: string;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));

  const dateIdx = header.findIndex((h) => h === "date");
  const amountIdx = header.findIndex((h) => h === "amount");
  const merchantIdx = header.findIndex((h) =>
    ["merchant", "merchant_name", "description", "name", "payee"].includes(h),
  );
  const categoryIdx = header.findIndex((h) => h === "category");

  if (dateIdx === -1 || amountIdx === -1 || merchantIdx === -1) return [];

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const amount = parseFloat(cols[amountIdx]);
    if (isNaN(amount)) continue;
    rows.push({
      date: cols[dateIdx],
      amount,
      merchant_name: cols[merchantIdx] || "Unknown",
      category: categoryIdx >= 0 ? cols[categoryIdx] || undefined : undefined,
    });
  }
  return rows;
}

export default function CsvImportDialog({ accountId, accountName, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);
  const [result, setResult] = useState<ImportCompleteEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result as string);
      if (parsed.length === 0) {
        setError("Could not parse CSV. Ensure it has date, amount, and merchant/description columns.");
        return;
      }
      setError(null);
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const complete = await api.streamImportTransactions(
        accountId,
        rows,
        (evt) => setProgress(evt),
      );
      setResult(complete);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Import CSV to {accountName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-success">
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
                {result.errors.length > 5 && (
                  <p>...and {result.errors.length - 5} more</p>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-accent hover:text-foreground w-full justify-center"
              >
                <Upload className="h-4 w-4" />
                {rows.length > 0 ? `${rows.length} rows parsed` : "Choose CSV file"}
              </button>
            </div>

            {rows.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border text-xs">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Merchant</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1">{r.date}</td>
                        <td className="px-2 py-1 truncate max-w-[150px]">{r.merchant_name}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                    {rows.length > 10 && (
                      <tr className="border-t border-border">
                        <td colSpan={3} className="px-2 py-1 text-center text-muted-foreground">
                          ...and {rows.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {importing && progress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.merchant}</span>
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

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={importing}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={rows.length === 0 || importing}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {importing ? "Importing..." : `Import ${rows.length} rows`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
