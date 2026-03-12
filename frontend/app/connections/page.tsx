"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Building2,
  Landmark,
  TrendingUp,
  CreditCard,
  Unlink,
  LinkIcon,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise } from "@/lib/hooks";
import type { PlaidConnection, PlaidConnectionAccount } from "@/lib/types";
import LinkAccount from "@/components/link-account";
import ConfirmDialog from "@/components/confirm-dialog";

const TYPE_ICONS: Record<string, typeof Landmark> = {
  depository: Landmark,
  investment: TrendingUp,
  credit: CreditCard,
  loan: Building2,
};

const TYPE_COLORS: Record<string, string> = {
  depository: "text-accent",
  investment: "text-accent",
  credit: "text-amber-400",
  loan: "text-blue-400",
};

export default function ConnectionsPage() {
  const formatCurrency = useFormatCurrencyPrecise();
  const { data: connections, isLoading } = useQuery({
    queryKey: ["plaidItems"],
    queryFn: api.getPlaidItems,
  });

  const hasConnections = connections && connections.length > 0;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage your linked financial institutions.
          </p>
        </div>
        <LinkAccount />
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-card"
            />
          ))}
        </div>
      ) : !hasConnections ? (
        <div className="mt-12 text-center">
          <LinkIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            No institutions connected. Click &quot;Link Account&quot; above to
            get started.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {connections.map((conn) => (
            <ConnectionCard key={conn.id} connection={conn} />
          ))}
        </div>
      )}
    </>
  );
}

function ConnectionCard({ connection }: { connection: PlaidConnection }) {
  const queryClient = useQueryClient();
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const linkedCount = connection.accounts.filter((a) => a.is_linked).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["plaidItems"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["accountSummary"] });
  };

  const unlinkMutation = useMutation({
    mutationFn: () => api.unlinkPlaidItem(connection.id),
    onSuccess: () => {
      invalidate();
      setConfirmUnlink(false);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.triggerSync(connection.id),
    onSuccess: () => {
      setTimeout(() => invalidate(), 3000);
    },
  });

  return (
    <>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Institution header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="font-semibold">
                {connection.institution_name || "Unknown Institution"}
              </p>
              <p className="text-xs text-muted-foreground">
                {linkedCount} account{linkedCount !== 1 ? "s" : ""} linked
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  syncMutation.isPending ? "animate-spin" : ""
                }`}
              />
              Sync
            </button>
            <button
              onClick={() => setConfirmUnlink(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Unlink className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        </div>

        {/* Accounts list */}
        <div className="divide-y divide-border/50">
          {connection.accounts.map((acct) => (
            <ConnectionAccountRow key={acct.id} account={acct} />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmUnlink}
        title={`Disconnect ${connection.institution_name || "this institution"}?`}
        description={`This will unlink all ${connection.accounts.length} account(s), zero out their balances, and revoke the connection with the bank. Transaction history will be preserved. You can re-link later.`}
        confirmLabel="Disconnect"
        destructive
        loading={unlinkMutation.isPending}
        onConfirm={() => unlinkMutation.mutate()}
        onCancel={() => setConfirmUnlink(false)}
      />
    </>
  );
}

function ConnectionAccountRow({ account }: { account: PlaidConnectionAccount }) {
  const Icon = TYPE_ICONS[account.type] ?? Landmark;
  const color = TYPE_COLORS[account.type] ?? "text-accent";

  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <div>
          <p className="text-sm font-medium">{account.name}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {account.subtype || account.type}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold">
          {formatCurrency(account.current_balance)}
        </p>
        {account.is_linked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <LinkIcon className="h-2.5 w-2.5" />
            Linked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Unlink className="h-2.5 w-2.5" />
            Unlinked
          </span>
        )}
      </div>
    </div>
  );
}
