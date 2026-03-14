"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  Building2,
  Landmark,
  TrendingUp,
  CreditCard,
  Unlink,
  LinkIcon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Link2,
  Settings,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
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
  const router = useRouter();
  const formatCurrency = useFormatCurrencyPrecise();
  const scope = useScope();
  const { data: connections, isLoading, isError, refetch } = useQuery({
    queryKey: ["plaidItems", scope],
    queryFn: () => api.getPlaidItems(scope),
  });
  const { data: plaidConfig } = useQuery({
    queryKey: ["plaid-config"],
    queryFn: api.getPlaidConfig,
    staleTime: 30_000,
  });

  const hasConnections = connections && connections.length > 0;
  const plaidNotConfigured = plaidConfig && !plaidConfig.configured;

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

      {isError ? (
        <div className="mt-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
          <p className="mt-3 text-muted-foreground">Something went wrong loading data.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="mt-8 space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-card"
            />
          ))}
        </div>
      ) : plaidNotConfigured && !hasConnections ? (
        <div className="mt-12 text-center">
          <Link2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            Plaid integration is not set up.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Go to Settings to configure your Plaid credentials and start linking
            bank accounts.
          </p>
          <button
            onClick={() => router.push("/settings?section=integrations")}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            <Settings className="h-4 w-4" />
            Configure Plaid
          </button>
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
            <ConnectionCard
              key={conn.id}
              connection={conn}
              showOwner={scope !== "personal"}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ConnectionCard({
  connection,
  showOwner = false,
}: {
  connection: PlaidConnection;
  showOwner?: boolean;
}) {
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

  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const syncStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncMutation = useMutation({
    mutationFn: () => api.triggerSync(connection.id),
    onMutate: () => {
      setSyncStatus("syncing");
    },
    onSuccess: () => {
      setSyncStatus("success");
      setTimeout(() => invalidate(), 3000);
    },
    onError: () => {
      setSyncStatus("error");
    },
  });

  useEffect(() => {
    if (syncStatus === "success" || syncStatus === "error") {
      if (syncStatusTimerRef.current) {
        clearTimeout(syncStatusTimerRef.current);
      }
      syncStatusTimerRef.current = setTimeout(() => setSyncStatus("idle"), 5000);
    }
    return () => {
      if (syncStatusTimerRef.current) {
        clearTimeout(syncStatusTimerRef.current);
        syncStatusTimerRef.current = null;
      }
    };
  }, [syncStatus]);

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
              <div className="flex items-center gap-2">
                <p className="font-semibold">
                  {connection.institution_name || "Unknown Institution"}
                </p>
                {showOwner && connection.owner_name && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                    {connection.owner_picture ? (
                      <Image
                        src={connection.owner_picture}
                        alt={connection.owner_name}
                        width={14}
                        height={14}
                        className="rounded-full"
                      />
                    ) : null}
                    {connection.owner_name.split(" ")[0]}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {linkedCount} account{linkedCount !== 1 ? "s" : ""} linked
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {syncStatus === "success" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Synced
              </span>
            ) : syncStatus === "error" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Sync failed
              </span>
            ) : (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncStatus === "syncing"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    syncStatus === "syncing" ? "animate-spin" : ""
                  }`}
                />
                {syncStatus === "syncing" ? "Syncing..." : "Sync"}
              </button>
            )}
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
  const formatCurrency = useFormatCurrencyPrecise();
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
