"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Landmark,
  TrendingUp,
  CreditCard,
  Building2,
  ChevronDown,
  Check,
  Pencil,
  Unlink,
  LinkIcon,
  EyeOff,
  Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import { useAuth } from "@/components/auth-provider";
import type { Account } from "@/lib/types";
import LinkAccount from "@/components/link-account";
import ConfirmDialog from "@/components/confirm-dialog";

const ACCOUNT_TYPES = [
  { value: "depository", label: "Cash", icon: Landmark, color: "text-accent" },
  { value: "credit", label: "Credit Card", icon: CreditCard, color: "text-amber-400" },
  { value: "loan", label: "Loan", icon: Building2, color: "text-blue-400" },
  { value: "investment", label: "Investment", icon: TrendingUp, color: "text-accent" },
] as const;

const SUBTYPES: Record<string, string[]> = {
  depository: ["checking", "savings", "money market", "hsa", "cash management"],
  credit: ["credit card"],
  loan: ["mortgage", "student", "auto", "personal", "home equity", "line of credit"],
  investment: ["rrsp", "tfsa", "brokerage", "cd", "401k", "ira", "roth", "529"],
};

function typeConfig(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0];
}

export default function AccountsPage() {
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { user } = useAuth();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => api.getAccounts(scope),
  });
  const isViewingOwn = scope === "personal";
  const [hideUnlinked, setHideUnlinked] = useState(true);

  const unlinkedCount = useMemo(
    () => accounts?.filter((a) => !a.is_linked).length ?? 0,
    [accounts]
  );

  const visibleAccounts = useMemo(
    () =>
      hideUnlinked
        ? accounts?.filter((a) => a.is_linked) ?? []
        : accounts ?? [],
    [accounts, hideUnlinked]
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            All linked bank and investment accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              {hideUnlinked
                ? `${unlinkedCount} hidden`
                : "Hide unlinked"}
            </button>
          )}
          {isViewingOwn && <LinkAccount />}
        </div>
      </div>

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
              : 'No accounts linked yet. Click "Link Account" above to connect your bank.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {visibleAccounts.map((acct: Account) => (
            <AccountRow
              key={acct.id}
              account={acct}
              editable={acct.user_id === user?.id}
              showOwner={scope !== "personal"}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AccountRow({
  account,
  editable = true,
  showOwner = false,
}: {
  account: Account;
  editable?: boolean;
  showOwner?: boolean;
}) {
  const formatCurrency = useFormatCurrencyPrecise();
  const queryClient = useQueryClient();
  const [typeOpen, setTypeOpen] = useState(false);
  const [subtypeOpen, setSubtypeOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const config = typeConfig(account.type);
  const Icon = config.icon;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
    queryClient.invalidateQueries({ queryKey: ["plaidItems"] });
  };

  const typeMutation = useMutation({
    mutationFn: (newType: string) =>
      api.updateAccount(account.id, { type: newType }),
    onSuccess: () => {
      invalidate();
      setTypeOpen(false);
    },
  });

  const subtypeMutation = useMutation({
    mutationFn: (newSubtype: string) =>
      api.updateAccount(account.id, { subtype: newSubtype }),
    onSuccess: () => {
      invalidate();
      setSubtypeOpen(false);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api.unlinkAccount(account.id),
    onSuccess: () => {
      invalidate();
      setConfirmUnlink(false);
    },
  });

  const subtypeOptions = SUBTYPES[account.type] ?? [];

  return (
    <>
      <div
        className={`flex items-center justify-between rounded-2xl border px-6 py-4 ${
          account.is_linked
            ? "border-border bg-card"
            : "border-border/50 bg-card/50 opacity-70"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Icon className={`h-5 w-5 ${config.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{account.name}</p>
              {showOwner && account.owner_name && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  {account.owner_name}
                </span>
              )}
              {!account.is_linked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Unlink className="h-2.5 w-2.5" />
                  Unlinked
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {account.official_name || account.type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
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
              {/* Subtype dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setSubtypeOpen(!subtypeOpen);
                    setTypeOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground capitalize"
                >
                  {account.subtype || "subtype"}
                  <Pencil className="h-3 w-3" />
                </button>

                {subtypeOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-xl">
                    {subtypeOptions.map((sub) => {
                      const selected = sub === account.subtype;
                      return (
                        <button
                          key={sub}
                          onClick={() => subtypeMutation.mutate(sub)}
                          disabled={selected}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs capitalize hover:bg-muted disabled:opacity-50"
                        >
                          <span>{sub}</span>
                          {selected && <Check className="h-3 w-3 text-success" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Type dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setTypeOpen(!typeOpen);
                    setSubtypeOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {config.label}
                  <ChevronDown className="h-3 w-3" />
                </button>

                {typeOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-xl">
                    {ACCOUNT_TYPES.map((opt) => {
                      const OptIcon = opt.icon;
                      const selected = opt.value === account.type;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => typeMutation.mutate(opt.value)}
                          disabled={selected}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50"
                        >
                          <OptIcon className={`h-3.5 w-3.5 ${opt.color}`} />
                          <span className="flex-1">{opt.label}</span>
                          {selected && <Check className="h-3 w-3 text-success" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Unlink button */}
              {account.is_linked && (
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
    </>
  );
}
