"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  Eye,
  EyeOff,
  Save,
  Loader2,
  Settings,
  Brain,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import ConfirmDialog from "@/components/confirm-dialog";
import type {
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminLLMConfig,
  AdminPlaidConfig,
  AdminPlaidHealth,
  ActiveUsersPoint,
  TransactionVolumePoint,
  FeatureAdoption,
  StorageMetric,
} from "@/lib/types";

type Tab = "overview" | "users" | "plaid-health" | "analytics" | "plaid-config" | "llm-config";

interface UserFilters {
  active_days?: number;
  has_linked?: boolean;
  has_manual?: boolean;
  sort?: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "plaid-health", label: "Plaid Health" },
  { id: "analytics", label: "Analytics" },
  { id: "plaid-config", label: "Plaid Config" },
  { id: "llm-config", label: "LLM Config" },
];

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [userFilters, setUserFilters] = useState<UserFilters>({});

  const handleKpiClick = (tab: Tab, filters: UserFilters = {}) => {
    setActiveTab(tab);
    setUserFilters(filters);
  };

  useEffect(() => {
    if (user && !user.is_admin) {
      router.push("/");
    }
  }, [user, router]);

  if (user && !user.is_admin) {
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
            onClick={() => { setActiveTab(tab.id); setUserFilters({}); }}
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

      {activeTab === "overview" && <OverviewTab onKpiClick={handleKpiClick} />}
      {activeTab === "users" && <UsersTab filters={userFilters} onClearFilters={() => setUserFilters({})} />}
      {activeTab === "plaid-health" && <PlaidHealthTab />}
      {activeTab === "analytics" && <AnalyticsTab />}
      {activeTab === "plaid-config" && <PlaidConfigTab />}
      {activeTab === "llm-config" && <LLMConfigTab />}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────

function OverviewTab({ onKpiClick }: { onKpiClick: (tab: Tab, filters?: UserFilters) => void }) {
  const { data: overview } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.getAdminOverview(),
  });

  if (!overview) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />)}</div>;
  }

  const kpis: { id: string; label: string; value: number | string; icon: React.ReactNode; onClick: () => void }[] = [
    { id: "kpi-total-users", label: "Total Users", value: overview.total_users, icon: <Users className="h-5 w-5 text-blue-400" />, onClick: () => onKpiClick("users") },
    { id: "kpi-active-7d", label: "Active (7d)", value: overview.active_7d, icon: <Activity className="h-5 w-5 text-green-400" />, onClick: () => onKpiClick("users", { active_days: 7 }) },
    { id: "kpi-total-accounts", label: "Total Accounts", value: overview.total_accounts, icon: <Landmark className="h-5 w-5 text-purple-400" />, onClick: () => onKpiClick("users", { sort: "account_count_desc" }) },
    { id: "kpi-linked-accounts", label: "Linked Accounts", value: overview.linked_accounts, icon: <Landmark className="h-5 w-5 text-teal-400" />, onClick: () => onKpiClick("users", { has_linked: true }) },
    { id: "kpi-manual-accounts", label: "Manual Accounts", value: overview.manual_accounts, icon: <Landmark className="h-5 w-5 text-amber-400" />, onClick: () => onKpiClick("users", { has_manual: true }) },
    { id: "kpi-total-transactions", label: "Total Transactions", value: overview.total_transactions.toLocaleString(), icon: <ArrowLeftRight className="h-5 w-5 text-indigo-400" />, onClick: () => onKpiClick("analytics") },
    { id: "kpi-households", label: "Households", value: overview.total_households, icon: <Home className="h-5 w-5 text-rose-400" />, onClick: () => onKpiClick("users") },
    { id: "kpi-errors-7d", label: "Errors (7d)", value: overview.recent_errors, icon: <AlertTriangle className="h-5 w-5 text-red-400" />, onClick: () => onKpiClick("plaid-health") },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          data-testid={kpi.id}
          onClick={kpi.onClick}
          className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-accent transition-colors"
        >
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

function UsersTab({ filters, onClearFilters }: { filters: UserFilters; onClearFilters: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const pageSize = 50;

  const hasFilters = filters.active_days != null || filters.has_linked != null || filters.has_manual != null || filters.sort != null;

  const filterLabel = filters.active_days != null
    ? `Active in last ${filters.active_days}d`
    : filters.has_linked
      ? "Has linked accounts"
      : filters.has_manual
        ? "Has manual accounts"
        : filters.sort === "account_count_desc"
          ? "Sorted by account count"
          : null;

  const { data } = useQuery({
    queryKey: ["admin", "users", search, page, filters],
    queryFn: () => api.getAdminUsers({ limit: pageSize, offset: page * pageSize, search: search || undefined, ...filters }),
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        {hasFilters && filterLabel && (
          <span data-testid="filter-badge" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent/15 text-accent">
            {filterLabel}
            <button data-testid="clear-filter" onClick={onClearFilters} className="hover:text-foreground">&times;</button>
          </span>
        )}
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
              <UserRow
                key={u.id}
                u={u}
                expanded={expandedUserId === u.id}
                onToggle={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                onUpdate={(body) => updateMutation.mutate({ userId: u.id, body })}
                onDelete={() => setDeleteTarget(u)}
              />
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

// ── User Row ──────────────────────────────────────────────────

function UserRow({ u, expanded, onToggle, onUpdate, onDelete }: {
  u: AdminUser;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (body: { is_admin?: boolean; is_disabled?: boolean }) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        data-testid={`user-row-${u.id}`}
        onClick={onToggle}
        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
      >
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
          <div className="flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {u.is_protected ? (
              <span className="text-xs text-muted-foreground italic">Protected</span>
            ) : (
              <>
                {u.is_disabled ? (
                  <button
                    onClick={() => onUpdate({ is_disabled: false })}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors"
                    aria-label="Enable"
                  >
                    Enable
                  </button>
                ) : (
                  <button
                    onClick={() => onUpdate({ is_disabled: true })}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                    aria-label="Disable"
                  >
                    Disable
                  </button>
                )}
                {u.is_admin ? (
                  <button
                    onClick={() => onUpdate({ is_admin: false })}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Revoke admin"
                  >
                    <ShieldOff className="h-3.5 w-3.5 inline mr-1" />Revoke
                  </button>
                ) : (
                  <button
                    onClick={() => onUpdate({ is_admin: true })}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                    aria-label="Make admin"
                  >
                    <Shield className="h-3.5 w-3.5 inline mr-1" />Admin
                  </button>
                )}
                <button
                  onClick={onDelete}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 inline mr-1" />Delete
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="p-0">
            <UserDetailPanel userId={u.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function UserDetailPanel({ userId }: { userId: number }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["admin", "user-detail", userId],
    queryFn: () => api.getAdminUserDetail(userId),
  });

  if (isLoading || !detail) {
    return (
      <div data-testid={`user-detail-${userId}`} className="px-6 py-4 bg-muted/20 border-b border-border">
        <div className="h-32 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div data-testid={`user-detail-${userId}`} className="px-6 py-4 bg-muted/20 border-b border-border">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Transactions</p>
          <p className="text-lg font-bold">{detail.stats.total_transactions.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Categories Used</p>
          <p className="text-lg font-bold">{detail.stats.categories_used}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Rules Created</p>
          <p className="text-lg font-bold">{detail.stats.rules_created}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Tags Created</p>
          <p className="text-lg font-bold">{detail.stats.tags_created}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <h4 className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border">Accounts ({detail.accounts.length})</h4>
          <div className="divide-y divide-border max-h-48 overflow-y-auto">
            {detail.accounts.map((a) => (
              <div key={a.id} className="px-4 py-2 text-sm flex items-center justify-between">
                <span>{a.name}</span>
                <span className="text-muted-foreground text-xs">{a.type} &middot; ${a.current_balance.toLocaleString()}</span>
              </div>
            ))}
            {detail.accounts.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">No accounts</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <h4 className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border">Recent Transactions</h4>
          <div className="divide-y divide-border max-h-48 overflow-y-auto">
            {detail.recent_transactions.map((t) => (
              <div key={t.id} className="px-4 py-2 text-sm flex items-center justify-between">
                <div>
                  <span>{t.merchant_name || "—"}</span>
                  <span className="text-xs text-muted-foreground ml-2">{t.category}</span>
                </div>
                <span className="font-mono text-xs">${Math.abs(t.amount).toFixed(2)}</span>
              </div>
            ))}
            {detail.recent_transactions.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">No transactions</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden lg:col-span-2">
          <h4 className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border">Recent Activity</h4>
          <div className="divide-y divide-border max-h-48 overflow-y-auto">
            {detail.recent_activity.map((a, i) => (
              <div key={i} className="px-4 py-2 text-sm flex items-center justify-between">
                <span className="capitalize">{a.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</span>
              </div>
            ))}
            {detail.recent_activity.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">No activity</p>}
          </div>
        </div>
      </div>
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

  const { data: activeUsers } = useQuery({
    queryKey: ["admin", "active-users"],
    queryFn: () => api.getAdminActiveUsers(30),
  });

  const { data: txnVolume } = useQuery({
    queryKey: ["admin", "transaction-volume"],
    queryFn: () => api.getAdminTransactionVolume(30),
  });

  return (
    <div className="space-y-6">
      {/* Active Users Chart */}
      <div data-testid="active-users-chart" className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-green-400" />
          Active Users (30 days)
        </h3>
        {activeUsers && activeUsers.length > 0 ? (
          <div className="flex items-end gap-1 h-32">
            {activeUsers.map((d) => {
              const maxDau = Math.max(...activeUsers.map((p) => p.dau), 1);
              const height = (d.dau / maxDau) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-green-400/80 rounded-t" style={{ height: `${height}%` }} />
                  <div className="hidden group-hover:block absolute -top-8 bg-card border border-border rounded px-2 py-1 text-xs shadow-lg z-10 whitespace-nowrap">
                    {d.date}: {d.dau} DAU
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active user data yet</p>
        )}
      </div>

      {/* Transaction Volume Chart */}
      <div data-testid="transaction-volume-chart" className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-indigo-400" />
          Transaction Volume (30 days)
        </h3>
        {txnVolume && txnVolume.length > 0 ? (
          <div className="flex items-end gap-1 h-32">
            {txnVolume.map((d) => {
              const maxCount = Math.max(...txnVolume.map((p) => p.count), 1);
              const height = (d.count / maxCount) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-indigo-400/80 rounded-t" style={{ height: `${height}%` }} />
                  <div className="hidden group-hover:block absolute -top-8 bg-card border border-border rounded px-2 py-1 text-xs shadow-lg z-10 whitespace-nowrap">
                    {d.date}: {d.count} txns
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No transaction volume data yet</p>
        )}
      </div>

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

// ── Plaid Config Tab ─────────────────────────────────────────

function PlaidConfigTab() {
  const queryClient = useQueryClient();

  const { data: adminConfig } = useQuery({
    queryKey: ["admin-plaid-config"],
    queryFn: api.getAdminPlaidConfig,
  });

  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [plaidEnv, setPlaidEnv] = useState("sandbox");
  const [enabled, setEnabled] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (adminConfig?.configured) {
      setPlaidEnv(adminConfig.plaid_env ?? "sandbox");
      setEnabled(adminConfig.enabled);
    }
  }, [adminConfig]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateAdminPlaidConfig({
        client_id: clientId,
        secret,
        plaid_env: plaidEnv,
        enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plaid-config"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-mode"] });
      setClientId("");
      setSecret("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () =>
      api.updateAdminPlaidConfig({
        client_id: clientId || "unchanged",
        secret: secret || "unchanged",
        plaid_env: plaidEnv,
        enabled: !enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plaid-config"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-mode"] });
      setEnabled(!enabled);
    },
  });

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.deleteAdminPlaidConfig();
      queryClient.invalidateQueries({ queryKey: ["admin-plaid-config"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-mode"] });
      setConfirmRemove(false);
    } finally {
      setRemoving(false);
    }
  }

  if (!adminConfig) {
    return <div className="h-48 rounded-xl bg-card border border-border animate-pulse" />;
  }

  const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";
  const inputClass = "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";
  const selectClass = "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent" />
          <h3 className="text-base font-semibold">Managed Plaid Credentials</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure app-level Plaid credentials so users can connect without their own keys.
        </p>

        {adminConfig.configured && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-green-400">
                Configured ({adminConfig.plaid_env})
              </span>
              <span className="text-xs text-muted-foreground">
                &middot; {adminConfig.managed_household_count} household{adminConfig.managed_household_count !== 1 ? "s" : ""} using managed
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => {
                  if (adminConfig.configured) {
                    toggleMutation.mutate();
                  }
                }}
                className="h-4 w-4 rounded border-border bg-muted accent-accent"
              />
              <span className="text-xs">Allow households to use managed Plaid</span>
            </label>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Client ID</label>
              <div className="relative">
                <input
                  type={showClientId ? "text" : "password"}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={adminConfig.configured ? `••••${adminConfig.client_id_last4}` : "App-level Plaid Client ID"}
                  className={`${inputClass} w-full pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowClientId(!showClientId)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={adminConfig.configured ? `••••${adminConfig.secret_last4}` : "App-level Plaid Secret"}
                  className={`${inputClass} w-full pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-xs">
            <label className={labelClass} htmlFor="plaid-env-select">Environment</label>
            <select
              id="plaid-env-select"
              value={plaidEnv}
              onChange={(e) => setPlaidEnv(e.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="sandbox">Sandbox (testing)</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {saved && <span className="text-xs text-green-400">Admin Plaid config saved</span>}
              {saveMutation.isError && (
                <span className="text-xs text-red-400">
                  {(saveMutation.error as Error).message}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {adminConfig.configured && (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!clientId.trim() || !secret.trim() || saveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
                aria-label="Save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {adminConfig.configured ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={confirmRemove}
          title="Remove managed Plaid credentials?"
          description="This will remove the app-level Plaid credentials. Households using managed Plaid will no longer be able to link new accounts."
          confirmLabel="Remove"
          destructive
          loading={removing}
          onConfirm={handleRemove}
          onCancel={() => setConfirmRemove(false)}
        />
      </div>
    </div>
  );
}


// ── LLM Config Tab ──────────────────────────────────────────

function LLMConfigTab() {
  const queryClient = useQueryClient();

  const { data: adminConfig } = useQuery({
    queryKey: ["admin-llm-config"],
    queryFn: api.getAdminLLMConfig,
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (adminConfig?.configured) {
      setBaseUrl(adminConfig.llm_base_url ?? "");
      setModel(adminConfig.llm_model ?? "");
      setEnabled(adminConfig.enabled);
    }
  }, [adminConfig]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateAdminLLMConfig({
        llm_base_url: baseUrl,
        llm_api_key: apiKey || "unchanged",
        llm_model: model,
        enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-llm-config"] });
      queryClient.invalidateQueries({ queryKey: ["llm-mode"] });
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () =>
      api.updateAdminLLMConfig({
        llm_base_url: baseUrl || adminConfig?.llm_base_url || "",
        llm_api_key: "unchanged",
        llm_model: model || adminConfig?.llm_model || "",
        enabled: !enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-llm-config"] });
      queryClient.invalidateQueries({ queryKey: ["llm-mode"] });
      setEnabled(!enabled);
    },
  });

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.deleteAdminLLMConfig();
      queryClient.invalidateQueries({ queryKey: ["admin-llm-config"] });
      queryClient.invalidateQueries({ queryKey: ["llm-mode"] });
      setConfirmRemove(false);
    } finally {
      setRemoving(false);
    }
  }

  if (!adminConfig) {
    return <div className="h-48 rounded-xl bg-card border border-border animate-pulse" />;
  }

  const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";
  const inputClass = "rounded-md bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-accent" />
          <h3 className="text-base font-semibold">Managed LLM Credentials</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure app-level LLM credentials so users can use AI categorization without their own API key.
        </p>

        {adminConfig.configured && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-green-400">
                Configured ({adminConfig.llm_model})
              </span>
              <span className="text-xs text-muted-foreground">
                &middot; {adminConfig.managed_household_count} household{adminConfig.managed_household_count !== 1 ? "s" : ""} using managed
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm" data-testid="llm-enabled-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => {
                  if (adminConfig.configured) {
                    toggleMutation.mutate();
                  }
                }}
                className="h-4 w-4 rounded border-border bg-muted accent-accent"
              />
              <span className="text-xs">Allow households to use managed AI</span>
            </label>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={adminConfig.configured ? adminConfig.llm_base_url ?? "" : "https://api.openai.com/v1"}
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label className={labelClass}>API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={adminConfig.configured ? `••••${adminConfig.api_key_last4}` : "LLM API Key"}
                  className={`${inputClass} w-full pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-xs">
            <label className={labelClass}>Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={adminConfig.configured ? adminConfig.llm_model ?? "" : "gpt-4o-mini"}
              className={`${inputClass} w-full`}
            />
          </div>

          {!adminConfig.configured && (
            <label className="flex cursor-pointer items-center gap-2 text-sm" data-testid="llm-enabled-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => setEnabled(!enabled)}
                className="h-4 w-4 rounded border-border bg-muted accent-accent"
              />
              <span className="text-xs">Enable managed AI for households</span>
            </label>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {saved && <span className="text-xs text-green-400">Admin LLM config saved</span>}
              {saveMutation.isError && (
                <span className="text-xs text-red-400">
                  {(saveMutation.error as Error).message}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {adminConfig.configured && (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={(!adminConfig.configured && !apiKey.trim()) || !baseUrl.trim() || !model.trim() || saveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:opacity-50"
                aria-label="Save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {adminConfig.configured ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={confirmRemove}
          title="Remove managed LLM credentials?"
          description="This will remove the app-level LLM credentials. Households using managed AI will fall back to their own API keys or lose AI categorization."
          confirmLabel="Remove"
          destructive
          loading={removing}
          onConfirm={handleRemove}
          onCancel={() => setConfirmRemove(false)}
        />
      </div>
    </div>
  );
}
