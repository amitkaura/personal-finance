"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Landmark,
  TrendingUp,
  CreditCard,
  Building2,
  Home,
  Pencil,
  Unlink,
  EyeOff,
  Eye,
  Plus,
  Upload,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import { useAuth } from "@/components/auth-provider";
import type { Account } from "@/lib/types";
import LinkAccount from "@/components/link-account";
import ConfirmDialog from "@/components/confirm-dialog";
import CsvImportDialog from "@/components/csv-import-dialog";

export const ACCOUNT_TYPES = [
  { value: "depository", label: "Cash", icon: Landmark, color: "text-accent" },
  { value: "credit", label: "Credit Card", icon: CreditCard, color: "text-amber-400" },
  { value: "loan", label: "Loan", icon: Building2, color: "text-blue-400" },
  { value: "investment", label: "Investment", icon: TrendingUp, color: "text-accent" },
  { value: "real_estate", label: "Real Estate", icon: Home, color: "text-emerald-400" },
] as const;

export const SUBTYPES: Record<string, string[]> = {
  depository: ["Cash Management", "Checking", "HSA", "Money Market", "Savings"],
  credit: ["Credit Card"],
  loan: ["Auto", "HELOC", "Home Equity", "Line of Credit", "Mortgage", "Personal", "Student"],
  real_estate: ["Commercial", "Land", "Primary Residence", "Rental Property", "Vacation Home"],
  investment: [
    "401k", "529", "Annuity", "Bonds", "Brokerage", "CD", "Crypto",
    "ESPP", "ETF", "HSA Investment", "IRA", "LIRA", "Mutual Fund",
    "Pension", "Private Company Stock", "Private Equity", "Public Stock",
    "RESP", "Roth", "RRIF", "RRSP", "RSU", "Stock Options", "TFSA",
    "Whole Life Policy",
  ],
};

function typeConfig(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0];
}

function isManualAccount(account: Account) {
  return account.plaid_account_id.startsWith("manual-");
}

export default function AccountsPage() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => api.getAccounts(scope),
  });
  const isViewingOwn = scope === "personal";
  const [hideUnlinked, setHideUnlinked] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNameTouched, setNewNameTouched] = useState(false);

  useEffect(() => {
    if (searchParams.get("add") === "true") {
      setShowAddForm(true);
      setNewNameTouched(true);
    }
  }, [searchParams]);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("depository");
  const [newSubtype, setNewSubtype] = useState(SUBTYPES["depository"]?.[0] ?? "");
  const [newBalance, setNewBalance] = useState("0");
  const [newStatementDay, setNewStatementDay] = useState("");
  const isNewNameInvalid = !newName.trim();
  const [importAccount, setImportAccount] = useState<Account | null>(null);

  const createMutation = useMutation({
    mutationFn: () => {
      const body: Parameters<typeof api.createAccount>[0] = {
        name: newName,
        type: newType,
        subtype: newSubtype,
        current_balance: parseFloat(newBalance) || 0,
      };
      const dayVal = parseInt(newStatementDay, 10);
      if (dayVal >= 1 && dayVal <= 31) body.statement_available_day = dayVal;
      return api.createAccount(body);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
      queryClient.invalidateQueries({ queryKey: ["plaidItems"] });
      setShowAddForm(false);
      setNewName("");
      setNewType("depository");
      setNewSubtype(SUBTYPES["depository"]?.[0] ?? "");
      setNewBalance("0");
      setNewStatementDay("");
      setNewNameTouched(false);
      setImportAccount(created);
    },
  });

  const unlinkedCount = useMemo(
    () => accounts?.filter((a) => !a.is_linked && !isManualAccount(a)).length ?? 0,
    [accounts],
  );

  const visibleAccounts = useMemo(
    () =>
      hideUnlinked
        ? accounts?.filter((a) => a.is_linked || isManualAccount(a)) ?? []
        : accounts ?? [],
    [accounts, hideUnlinked],
  );

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            All linked bank and investment accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unlinkedCount > 0 && (
            <button
              onClick={() => setHideUnlinked(!hideUnlinked)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                hideUnlinked
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {hideUnlinked ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {hideUnlinked ? `${unlinkedCount} hidden` : "Hide unlinked"}
            </button>
          )}
          {isViewingOwn && (
            <button
              onClick={() => {
                const nextOpen = !showAddForm;
                setShowAddForm(nextOpen);
                setNewNameTouched(nextOpen);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Account
            </button>
          )}
          {isViewingOwn && <LinkAccount />}
        </div>
      </div>

      {/* Add Manual Account form */}
      {showAddForm && (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Add Manual Account</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">
                Account Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNewNameTouched(true);
                }}
                onBlur={() => setNewNameTouched(true)}
                placeholder="e.g. TD Chequing"
                aria-invalid={newNameTouched && isNewNameInvalid}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${newNameTouched && isNewNameInvalid ? "border-red-400" : "border-border"}`}
              />
              <p className={`absolute left-0 top-full mt-0.5 text-xs text-red-400 transition-opacity ${newNameTouched && isNewNameInvalid ? "opacity-100" : "opacity-0"}`}>
                Account name is required.
              </p>
            </div>
            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">
                Type
              </label>
              <select
                value={newType}
                onChange={(e) => {
                  setNewType(e.target.value);
                  const subs = SUBTYPES[e.target.value] ?? [];
                  setNewSubtype(subs[0] ?? "");
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">
                Subtype
              </label>
              <select
                value={newSubtype}
                onChange={(e) => setNewSubtype(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize outline-none focus:border-accent"
              >
                {(SUBTYPES[newType] ?? []).map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground mb-1 block">
                Balance
              </label>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                step="0.01"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent tabular-nums"
              />
            </div>
            <div className="w-32">
              <label htmlFor="new-statement-day" className="text-xs text-muted-foreground mb-1 block">
                Statement day
              </label>
              <input
                id="new-statement-day"
                type="number"
                min={1}
                max={31}
                value={newStatementDay}
                onChange={(e) => setNewStatementDay(e.target.value)}
                placeholder="1-31"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent tabular-nums"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={isNewNameInvalid || createMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                Create Account
              </button>
            </div>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-red-400">
              {(createMutation.error as Error).message}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-card"
            />
          ))}
        </div>
      ) : !visibleAccounts.length ? (
        <div className="mt-12 text-center">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            {hideUnlinked
              ? "All accounts are hidden. Toggle the filter to show unlinked accounts."
              : 'No accounts yet. Click "Add Account" or "Link Account" above to get started.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {visibleAccounts.map((acct: Account) => (
            <AccountRow
              key={acct.id}
              account={acct}
              scope={scope}
              editable={acct.user_id === user?.id}
              showOwner={scope !== "personal"}
              onImport={() => setImportAccount(acct)}
            />
          ))}
        </div>
      )}

      {importAccount && (
        <CsvImportDialog
          accountId={importAccount.id}
          accountName={importAccount.name}
          onClose={() => setImportAccount(null)}
        />
      )}
    </>
  );
}

function AccountRow({
  account,
  scope,
  editable = true,
  showOwner = false,
  onImport,
}: {
  account: Account;
  scope: "personal" | "partner" | "household";
  editable?: boolean;
  showOwner?: boolean;
  onImport: () => void;
}) {
  const formatCurrency = useFormatCurrencyPrecise();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(account.name);
  const [editType, setEditType] = useState(account.type);
  const [editSubtype, setEditSubtype] = useState(account.subtype || "");
  const [editBalance, setEditBalance] = useState(String(account.current_balance));
  const [editStatementDay, setEditStatementDay] = useState(
    account.statement_available_day != null ? String(account.statement_available_day) : "",
  );
  const config = typeConfig(account.type);
  const Icon = config.icon;
  const isManual = isManualAccount(account);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
    queryClient.invalidateQueries({ queryKey: ["plaidItems"] });
  };

  const editMutation = useMutation({
    mutationFn: (body: { name?: string; type?: string; subtype?: string; current_balance?: number }) =>
      api.updateAccount(account.id, body),
    onSuccess: () => {
      invalidate();
      setEditOpen(false);
    },
  });

  function openEditModal() {
    setEditName(account.name);
    setEditType(account.type);
    setEditSubtype(account.subtype || "");
    setEditBalance(String(account.current_balance));
    setEditStatementDay(
      account.statement_available_day != null ? String(account.statement_available_day) : "",
    );
    setEditOpen(true);
  }

  function saveEdit() {
    const body: { name?: string; type?: string; subtype?: string; current_balance?: number; statement_available_day?: number | null } = {
      name: editName,
      type: editType,
      subtype: editSubtype,
    };
    if (isManual) {
      const parsed = parseFloat(editBalance);
      if (!isNaN(parsed)) body.current_balance = parsed;
    }
    const dayVal = parseInt(editStatementDay, 10);
    body.statement_available_day = dayVal >= 1 && dayVal <= 31 ? dayVal : null;
    editMutation.mutate(body);
  }

  const unlinkMutation = useMutation({
    mutationFn: () => api.unlinkAccount(account.id),
    onSuccess: () => {
      invalidate();
      setConfirmUnlink(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAccount(account.id),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setConfirmDelete(false);
    },
  });

  const editSubtypeOptions = SUBTYPES[editType] ?? [];

  return (
    <>
      <div
        className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${
          account.is_linked || isManual
            ? "border-border bg-card"
            : "border-border/50 bg-card/50 opacity-70"
        }`}
      >
        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl transition-colors hover:bg-muted/50 sm:gap-4"
          onClick={() => router.push(`/transactions?account=${account.id}`)}
          role="link"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className={`h-5 w-5 ${config.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{account.name}</p>
              {showOwner && account.owner_name && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  {account.owner_picture ? (
                    <Image
                      src={account.owner_picture}
                      alt={account.owner_name}
                      width={14}
                      height={14}
                      className="rounded-full"
                    />
                  ) : null}
                  {account.owner_name.split(" ")[0]}
                </span>
              )}
              {!account.is_linked && !isManual && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Unlink className="h-2.5 w-2.5" />
                  Unlinked
                </span>
              )}
              {isManual && (
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                  Manual
                </span>
              )}
            </div>
            <p className="text-xs capitalize text-muted-foreground">
              {account.official_name || [config.label, account.subtype].filter(Boolean).join(" \u00b7 ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pl-[52px] sm:pl-0">
          <div className="text-left sm:text-right">
            <p className="text-lg font-semibold">
              {formatCurrency(account.current_balance)}
            </p>
            {account.available_balance !== null && (
              <p className="text-[10px] text-muted-foreground">
                {formatCurrency(account.available_balance)} available
              </p>
            )}
            {account.credit_limit !== null && (
              <p className="text-[10px] text-muted-foreground">
                {formatCurrency(account.credit_limit)} limit
              </p>
            )}
          </div>

          {editable && (
            <>
              {/* Edit button */}
              <button
                onClick={openEditModal}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                title="Edit account"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {/* Import CSV button (manual accounts only) */}
              {isManual && (
                <button
                  onClick={onImport}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                  title="Import transactions from CSV"
                >
                  <Upload className="h-4 w-4" />
                </button>
              )}

              {/* Delete button (manual or unlinked accounts) */}
              {(isManual || !account.is_linked) && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Delete account"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {/* Unlink button (Plaid accounts only) */}
              {account.is_linked && !isManual && (
                <button
                  onClick={() => setConfirmUnlink(true)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Unlink account"
                >
                  <Unlink className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmUnlink}
        title={`Unlink ${account.name}?`}
        description="This will disconnect the account from Plaid and zero out the balance. Your transaction history will be preserved. You can re-link this account later."
        confirmLabel="Unlink"
        destructive
        loading={unlinkMutation.isPending}
        onConfirm={() => unlinkMutation.mutate()}
        onCancel={() => setConfirmUnlink(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${account.name}?`}
        description="This will permanently delete this account and all its transactions. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setEditOpen(false); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-semibold">Edit Account</h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
                <select
                  value={editType}
                  onChange={(e) => {
                    const val = e.target.value as typeof editType;
                    setEditType(val);
                    const subs = SUBTYPES[val] ?? [];
                    setEditSubtype(subs[0] ?? "");
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
                >
                  {ACCOUNT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Subtype</label>
                <select
                  value={editSubtype}
                  onChange={(e) => setEditSubtype(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize outline-none focus:ring-1 focus:ring-accent"
                >
                  {editSubtypeOptions.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={editBalance}
                  onChange={(e) => setEditBalance(e.target.value)}
                  disabled={!isManual}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
                {!isManual && (
                  <p className="mt-1 text-xs text-muted-foreground">Balance is synced from your bank</p>
                )}
              </div>

              <div>
                <label htmlFor="edit-statement-day" className="mb-1 block text-xs font-medium text-muted-foreground">Statement day</label>
                <input
                  id="edit-statement-day"
                  type="number"
                  min={1}
                  max={31}
                  value={editStatementDay}
                  onChange={(e) => setEditStatementDay(e.target.value)}
                  placeholder="1-31"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Day of month your statement is available
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!editName.trim() || editMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {editMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
