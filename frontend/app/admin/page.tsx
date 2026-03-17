"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Activity,
  Shield,
  ShieldOff,
  Trash2,
  Search,
  AlertTriangle,
  Database,
  TrendingUp,
  Landmark,
  ArrowLeftRight,
  Home,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import ConfirmDialog from "@/components/confirm-dialog";
import type {
  AdminOverview,
  AdminUser,
  AdminPlaidHealth,
  FeatureAdoption,
  StorageMetric,
} from "@/lib/types";

type Tab = "overview" | "users" | "plaid-health" | "analytics";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "plaid-health", label: "Plaid Health" },
  { id: "analytics", label: "Analytics" },
];

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (user && !user.is_admin) {
    router.push("/");
    return null;
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border mb-6" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "plaid-health" && <PlaidHealthTab />}
      {activeTab === "analytics" && <AnalyticsTab />}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────

function OverviewTab() {
  const { data: overview } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.getAdminOverview(),
  });

  if (!overview) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />)}</div>;
  }

  const kpis: { label: string; value: number | string; icon: React.ReactNode }[] = [
    { label: "Total Users", value: overview.total_users, icon: <Users className="h-5 w-5 text-blue-400" /> },
    { label: "Active (7d)", value: overview.active_7d, icon: <Activity className="h-5 w-5 text-green-400" /> },
    { label: "Total Accounts", value: overview.total_accounts, icon: <Landmark className="h-5 w-5 text-purple-400" /> },
    { label: "Linked Accounts", value: overview.linked_accounts, icon: <Landmark className="h-5 w-5 text-teal-400" /> },
    { label: "Manual Accounts", value: overview.manual_accounts, icon: <Landmark className="h-5 w-5 text-amber-400" /> },
    { label: "Total Transactions", value: overview.total_transactions.toLocaleString(), icon: <ArrowLeftRight className="h-5 w-5 text-indigo-400" /> },
    { label: "Households", value: overview.total_households, icon: <Home className="h-5 w-5 text-rose-400" /> },
    { label: "Errors (7d)", value: overview.recent_errors, icon: <AlertTriangle className="h-5 w-5 text-red-400" /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-2">
            {kpi.icon}
            <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
          </div>
          <p className="text-2xl font-bold">{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Users Tab ──────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const pageSize = 50;

  const { data } = useQuery({
    queryKey: ["admin", "users", search, page],
    queryFn: () => api.getAdminUsers({ limit: pageSize, offset: page * pageSize, search: search || undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: { is_admin?: boolean; is_disabled?: boolean } }) =>
      api.updateAdminUser(userId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.deleteAdminUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div>
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Accounts</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Transactions</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {u.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <span className="truncate">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">{u.account_count}</td>
                <td className="px-4 py-3">{u.transaction_count}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {u.is_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">
                        <Shield className="h-3 w-3" />Admin
                      </span>
                    )}
                    {u.is_disabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                        <Ban className="h-3 w-3" />Disabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
                        <CheckCircle2 className="h-3 w-3" />Active
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {u.is_disabled ? (
                      <button
                        onClick={() => updateMutation.mutate({ userId: u.id, body: { is_disabled: false } })}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors"
                        aria-label="Enable"
                      >
                        Enable
                      </button>
                    ) : (
                      <button
                        onClick={() => updateMutation.mutate({ userId: u.id, body: { is_disabled: true } })}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                        aria-label="Disable"
                      >
                        Disable
                      </button>
                    )}
                    {u.is_admin ? (
                      <button
                        onClick={() => updateMutation.mutate({ userId: u.id, body: { is_admin: false } })}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                        aria-label="Revoke admin"
                      >
                        <ShieldOff className="h-3.5 w-3.5 inline mr-1" />Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => updateMutation.mutate({ userId: u.id, body: { is_admin: true } })}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                        aria-label="Make admin"
                      >
                        <Shield className="h-3.5 w-3.5 inline mr-1" />Admin
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(u)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 inline mr-1" />Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded-lg border border-border disabled:opacity-50 hover:bg-muted transition-colors">Prev</button>
            <button disabled={(page + 1) * pageSize >= data.total} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded-lg border border-border disabled:opacity-50 hover:bg-muted transition-colors">Next</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete user"
        description={`Permanently delete ${deleteTarget?.name} (${deleteTarget?.email}) and all their data? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── Plaid Health Tab ──────────────────────────────────────────

function PlaidHealthTab() {
  const { data: health } = useQuery({
    queryKey: ["admin", "plaid-health"],
    queryFn: () => api.getAdminPlaidHealth(),
  });

  if (!health) {
    return <div className="h-48 rounded-xl bg-card border border-border animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <h3 className="font-semibold">Total Plaid Errors</h3>
        </div>
        <p className="text-3xl font-bold">{health.total_plaid_errors}</p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <h3 className="px-4 py-3 font-semibold border-b border-border">Recent Errors</h3>
        {health.recent_errors.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No recent errors</p>
        ) : (
          <div className="divide-y divide-border">
            {health.recent_errors.map((err) => (
              <div key={err.id} className="px-4 py-3 text-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-medium text-red-400">{err.detail}</span>
                  <span className="text-xs text-muted-foreground">{new Date(err.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {err.error_type} &middot; {err.endpoint} &middot; User #{err.user_id}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────

function AnalyticsTab() {
  const { data: adoption } = useQuery({
    queryKey: ["admin", "feature-adoption"],
    queryFn: () => api.getAdminFeatureAdoption(),
  });

  const { data: storage } = useQuery({
    queryKey: ["admin", "storage"],
    queryFn: () => api.getAdminStorage(),
  });

  return (
    <div className="space-y-6">
      {/* Feature Adoption */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-accent" />
          Feature Adoption
        </h3>
        {adoption ? (
          <div className="space-y-3">
            {adoption.map((f) => (
              <div key={f.feature}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm capitalize">{f.feature.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{f.user_count} users ({f.percentage}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${Math.min(f.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-32 animate-pulse bg-muted rounded-lg" />
        )}
      </div>

      {/* Storage Metrics */}
      <div className="rounded-xl border border-border bg-card">
        <h3 className="px-4 py-3 font-semibold border-b border-border flex items-center gap-2">
          <Database className="h-5 w-5 text-accent" />
          Storage Metrics
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Table</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Rows</th>
              </tr>
            </thead>
            <tbody>
              {storage?.map((m) => (
                <tr key={m.table_name} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{m.table_name}</td>
                  <td className="px-4 py-2 text-right">{m.row_count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
