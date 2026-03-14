"use client";

import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { parseCsv, guessRole, type ColumnRole } from "@/lib/csv-utils";
import type { Account } from "@/lib/types";
import { SUBTYPES } from "@/app/accounts/page";

interface Props {
  onClose: () => void;
}

type Step = "upload" | "columns" | "accounts" | "importing" | "result";

type AccountMapping = {
  csvName: string;
  action: "create" | "match";
  matchedAccountId: number | null;
  newType: "depository" | "investment" | "credit" | "loan" | "real_estate";
  newSubtype: string;
};

type BalanceColumnRole = "date" | "balance" | "account" | "skip";

function guessBalanceRole(header: string): BalanceColumnRole {
  const h = header.toLowerCase();
  if (/date|posted/i.test(h)) return "date";
  if (/balance|amount|value|total/i.test(h)) return "balance";
  if (/account|name|fund|portfolio/i.test(h)) return "account";
  return "skip";
}

const BALANCE_ROLE_OPTIONS: { value: BalanceColumnRole; label: string }[] = [
  { value: "skip", label: "Skip" },
  { value: "date", label: "Date" },
  { value: "balance", label: "Balance" },
  { value: "account", label: "Account Name" },
];

export default function BalanceImportDialog({ onClose }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnRoles, setColumnRoles] = useState<BalanceColumnRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<AccountMapping[]>([]);
  const [result, setResult] = useState<{
    imported: number;
    accounts_created: number;
    snapshots_updated: number;
  } | null>(null);

  const { data: existingAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.getAccounts(),
  });

  const headers = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  const hasRequiredCols =
    columnRoles.includes("date") &&
    columnRoles.includes("balance") &&
    columnRoles.includes("account");

  const parsedRows = useMemo(() => {
    if (!hasRequiredCols || dataRows.length === 0) return [];
    const dateIdx = columnRoles.indexOf("date");
    const balanceIdx = columnRoles.indexOf("balance");
    const accountIdx = columnRoles.indexOf("account");
    return dataRows
      .map((row) => ({
        date: row[dateIdx]?.trim() ?? "",
        balance: parseFloat(row[balanceIdx]?.replace(/[,$]/g, "") ?? "0"),
        account_name: row[accountIdx]?.trim() ?? "",
      }))
      .filter((r) => r.date && r.account_name && !isNaN(r.balance));
  }, [dataRows, columnRoles, hasRequiredCols]);

  const uniqueAccountNames = useMemo(
    () => [...new Set(parsedRows.map((r) => r.account_name))],
    [parsedRows],
  );

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
      setColumnRoles(parsed[0].map((h) => guessBalanceRole(h)));
      setStep("columns");
    };
    reader.readAsText(file);
  }

  function goToAccounts() {
    const existing = mappings.reduce(
      (map, m) => ({ ...map, [m.csvName]: m }),
      {} as Record<string, AccountMapping>,
    );
    const newMappings = uniqueAccountNames.map((name) => {
      if (existing[name]) return existing[name];
      const match = (existingAccounts ?? []).find(
        (a: Account) => a.name.toLowerCase() === name.toLowerCase(),
      );
      return {
        csvName: name,
        action: match ? ("match" as const) : ("create" as const),
        matchedAccountId: match?.id ?? null,
        newType: "investment" as const,
        newSubtype: SUBTYPES["investment"]?.[0] ?? "",
      };
    });
    setMappings(newMappings);
    setStep("accounts");
  }

  function updateMapping(idx: number, update: Partial<AccountMapping>) {
    setMappings((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, ...update } : m)),
    );
  }

  async function handleImport() {
    setStep("importing");
    setError(null);
    try {
      const accountMapping = mappings.map((m) => ({
        csv_name: m.csvName,
        account_id: m.action === "match" ? m.matchedAccountId : null,
        create:
          m.action === "create"
            ? {
                name: m.csvName,
                type: m.newType,
                subtype: m.newSubtype || undefined,
              }
            : null,
      }));

      const res = await api.importBalances({
        rows: parsedRows,
        account_mapping: accountMapping,
      });
      setResult(res);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
      queryClient.invalidateQueries({ queryKey: ["netWorthHistory"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("accounts");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Upload */}
        {step === "upload" && (
          <div>
            <h2 className="text-lg font-semibold">Bulk Import Accounts &amp; Balances</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload historical account balances to build your net worth chart over time. Accounts that don&apos;t exist yet can be created during import.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong>Required columns:</strong> Date (balance snapshot date), Balance (account balance on that date), Account Name (which account).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Each row represents one account&apos;s balance on a given date. Net worth snapshots will be automatically recalculated.
            </p>
            {error && (
              <p className="mt-3 text-sm text-danger flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-10 text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors"
            >
              <Upload className="h-5 w-5" />
              Choose CSV file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        )}

        {/* Column Mapping */}
        {step === "columns" && (
          <div>
            <h2 className="text-lg font-semibold">Map Columns</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We auto-detected your columns. Verify each assignment below.
            </p>
            {!hasRequiredCols && (
              <p className="mt-2 text-xs text-amber-400">
                Assign Date, Balance, and Account Name to continue.
              </p>
            )}
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Column</th>
                  <th className="pb-2">Sample</th>
                  <th className="pb-2">Role</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 font-medium">{h}</td>
                    <td className="py-2 text-muted-foreground">
                      {dataRows[0]?.[i] ?? ""}
                    </td>
                    <td className="py-2">
                      <select
                        value={columnRoles[i]}
                        onChange={(e) => {
                          const next = [...columnRoles];
                          next[i] = e.target.value as BalanceColumnRole;
                          setColumnRoles(next);
                        }}
                        className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
                      >
                        {BALANCE_ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep("upload")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                disabled={!hasRequiredCols}
                onClick={goToAccounts}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Account Matching */}
        {step === "accounts" && (
          <div>
            <h2 className="text-lg font-semibold">Match Accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Match each account name from your CSV to an existing account, or create a new one. New accounts will use the most recent balance from your CSV.
            </p>
            {error && (
              <p className="mt-3 text-sm text-danger flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
            <div className="mt-4 space-y-4 max-h-64 overflow-y-auto">
              {mappings.map((m, i) => (
                <div
                  key={m.csvName}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium">{m.csvName}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={m.action}
                      onChange={(e) =>
                        updateMapping(i, {
                          action: e.target.value as "match" | "create",
                          matchedAccountId:
                            e.target.value === "match"
                              ? (existingAccounts?.[0]?.id ?? null)
                              : null,
                        })
                      }
                      className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
                    >
                      <option value="create">Create new</option>
                      <option value="match">Match existing</option>
                    </select>

                    {m.action === "match" && (
                      <select
                        value={m.matchedAccountId ?? ""}
                        onChange={(e) =>
                          updateMapping(i, {
                            matchedAccountId: Number(e.target.value),
                          })
                        }
                        className="flex-1 rounded-md bg-muted px-2 py-1 text-sm outline-none"
                      >
                        {(existingAccounts ?? []).map((a: Account) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.type})
                          </option>
                        ))}
                      </select>
                    )}

                    {m.action === "create" && (
                      <>
                        <select
                          value={m.newType}
                          onChange={(e) => {
                            const t = e.target.value as AccountMapping["newType"];
                            const subs = SUBTYPES[t] ?? [];
                            updateMapping(i, {
                              newType: t,
                              newSubtype: subs[0] ?? "",
                            });
                          }}
                          className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
                        >
                          <option value="depository">Depository</option>
                          <option value="investment">Investment</option>
                          <option value="credit">Credit</option>
                          <option value="loan">Loan</option>
                          <option value="real_estate">Real Estate</option>
                        </select>
                        <select
                          value={m.newSubtype}
                          onChange={(e) =>
                            updateMapping(i, { newSubtype: e.target.value })
                          }
                          className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
                        >
                          {(SUBTYPES[m.newType] ?? []).map((sub) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {parsedRows.filter((r) => r.account_name === m.csvName).length} rows
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep("columns")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={handleImport}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                Import
              </button>
            </div>
          </div>
        )}

        {/* Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="mt-4 text-sm text-muted-foreground">
              Importing balance history…
            </p>
          </div>
        )}

        {/* Result */}
        {step === "result" && result && (
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h2 className="text-lg font-semibold">Import Complete</h2>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="font-medium">{result.imported}</span> balance
                records imported
              </p>
              <p>
                <span className="font-medium">{result.accounts_created}</span>{" "}
                new accounts created
              </p>
              <p>
                <span className="font-medium">{result.snapshots_updated}</span>{" "}
                net worth snapshots updated
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Your net worth history has been updated. Visit the Net Worth page to see your timeline.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
