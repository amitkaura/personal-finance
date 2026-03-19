"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { usePlaidLink } from "react-plaid-link";
import {
  AlertCircle,
  AlertTriangle,
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
  Loader2,
} from "lucide-react";
import { api, clearPlaidBrowserState } from "@/lib/api";
import { useFormatCurrencyPrecise, useScope } from "@/lib/hooks";
import type { PlaidConnection, PlaidConnectionAccount } from "@/lib/types";
import { PLAID_ITEM_STATUS } from "@/lib/types";
import LinkAccount from "@/components/link-account";
import SandboxBanner from "@/components/sandbox-banner";
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
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.status !== PLAID_ITEM_STATUS.HEALTHY)
        ? 30_000
        : false,
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

      {plaidConfig?.plaid_env === "sandbox" && <SandboxBanner />}

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

const STATUS_BANNER_CONFIG: Record<string, { message: string; className: string; actionLabel: string }> = {
  [PLAID_ITEM_STATUS.ERROR]: {
    message: "This connection needs re-authentication. Your bank requires you to log in again.",
    className: "bg-red-500/10 text-red-400",
    actionLabel: "Reconnect",
  },
  [PLAID_ITEM_STATUS.PENDING_DISCONNECT]: {
    message: "This connection will expire soon. Reconnect to renew access.",
    className: "bg-amber-500/10 text-amber-400",
    actionLabel: "Reconnect",
  },
  [PLAID_ITEM_STATUS.REVOKED]: {
    message: "Access to this institution was revoked. Reconnect to restore access.",
    className: "bg-red-500/10 text-red-400",
    actionLabel: "Reconnect",
  },
  [PLAID_ITEM_STATUS.NEW_ACCOUNTS]: {
    message: "New accounts are available at this institution. Review and add them to stay up to date.",
    className: "bg-blue-500/10 text-blue-400",
    actionLabel: "Review Accounts",
  },
};

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

  // ── Reconnect (update mode) flow ──
  const isUnhealthy = connection.status !== PLAID_ITEM_STATUS.HEALTHY;
  const [reconnectToken, setReconnectToken] = useState<string | null>(null);
  const [reconnectStatus, setReconnectStatus] = useState<
    "idle" | "fetching" | "linking" | "repairing" | "done"
  >("idle");

  const fetchUpdateToken = useMutation({
    mutationFn: () =>
      api.createUpdateLinkToken(
        connection.id,
        connection.status === PLAID_ITEM_STATUS.NEW_ACCOUNTS,
      ),
    onSuccess: (data) => {
      setReconnectToken(data.link_token);
      setReconnectStatus("linking");
    },
    onError: () => setReconnectStatus("idle"),
  });

  const repairMutation = useMutation({
    mutationFn: () => api.repairPlaidItem(connection.id),
    onSuccess: () => {
      setReconnectStatus("done");
      invalidate();
      setTimeout(() => {
        setReconnectStatus("idle");
        setReconnectToken(null);
      }, 3000);
    },
    onError: () => setReconnectStatus("idle"),
  });

  const onReconnectSuccess = useCallback(() => {
    setReconnectStatus("repairing");
    clearPlaidBrowserState();
    repairMutation.mutate();
  }, [repairMutation]);

  const onReconnectExit = useCallback(() => {
    if (reconnectStatus === "linking") {
      setReconnectStatus("idle");
      setReconnectToken(null);
    }
  }, [reconnectStatus]);

  const { open: openReconnect, ready: reconnectReady } = usePlaidLink({
    token: reconnectToken,
    onSuccess: onReconnectSuccess,
    onExit: onReconnectExit,
  });

  useEffect(() => {
    if (reconnectStatus === "linking" && reconnectToken && reconnectReady) {
      openReconnect();
    }
  }, [reconnectStatus, reconnectToken, reconnectReady, openReconnect]);

  const handleReconnect = () => {
    setReconnectStatus("fetching");
    fetchUpdateToken.mutate();
  };

  const bannerConfig = isUnhealthy ? STATUS_BANNER_CONFIG[connection.status] : null;

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

        {/* Status banner for unhealthy connections */}
        {bannerConfig && (
          <div className={`flex items-center justify-between px-6 py-3 ${bannerConfig.className}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-sm">{bannerConfig.message}</p>
            </div>
            {reconnectStatus === "done" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reconnected
              </span>
            ) : (
              <button
                onClick={handleReconnect}
                disabled={reconnectStatus !== "idle"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/20 disabled:opacity-50 shrink-0"
              >
                {reconnectStatus !== "idle" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {bannerConfig.actionLabel}
              </button>
            )}
          </div>
        )}

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
