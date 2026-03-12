"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Landmark,
  TrendingUp,
  CreditCard,
  Building2,
  ChevronDown,
  Check,
  Pencil,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Account } from "@/lib/types";
import LinkAccount from "@/components/link-account";

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

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(n);
}

function typeConfig(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0];
}

export default function AccountsPage() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            All linked bank and investment accounts.
          </p>
        </div>
        <LinkAccount />
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
      ) : !accounts?.length ? (
        <div className="mt-12 text-center">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            No accounts linked yet. Click &quot;Link Account&quot; above to
            connect your bank.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {accounts.map((acct: Account) => (
            <AccountRow key={acct.id} account={acct} />
          ))}
        </div>
      )}
    </>
  );
}

function AccountRow({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const [typeOpen, setTypeOpen] = useState(false);
  const [subtypeOpen, setSubtypeOpen] = useState(false);
  const config = typeConfig(account.type);
  const Icon = config.icon;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
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

  const subtypeOptions = SUBTYPES[account.type] ?? [];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Icon className={`h-5 w-5 ${config.color}`} />
        </div>
        <div>
          <p className="font-medium">{account.name}</p>
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
      </div>
    </div>
  );
}
