import type {
  Account, AccountSummary, AdminLLMConfig, AdminPlaidConfig, AdminOverview, AdminUser, AdminUserDetail, AdminUsersResponse,
  AdminPlaidHealth, AdminErrorsResponse, ActiveUsersPoint, FeatureAdoption,
  TransactionVolumePoint, StorageMetric, WebhookEventsResponse,
  Budget, BudgetConflict, BudgetSummary,
  CategoryRule, Goal, GoalContribution, GoalsResponse,
  Household, HouseholdInvitation, MonthlyTrend, NetWorthSnapshot,
  LLMConfig, LLMModeResponse, PlaidConfig, PlaidConnection, PlaidModeResponse, RecurringTransaction, SpendingByCategory, SyncConfig,
  SpendingPreference, Tag, TopMerchant, Transaction, User, UserProfile,
  UserSettings, ViewScope,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const STREAM_BASE = "/stream";

type ValidationErrorItem = {
  field?: string;
  message?: string;
  loc?: (string | number)[];
  msg?: string;
};

function formatApiError(status: number, rawBody: string): string {
  if (!rawBody) return `Request failed (${status}).`;
  try {
    const parsed = JSON.parse(rawBody) as {
      detail?: string | ValidationErrorItem[];
      message?: string;
      field_errors?: ValidationErrorItem[];
    };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
    if (parsed.message && parsed.message.trim()) {
      return parsed.message;
    }
    const errors: ValidationErrorItem[] = parsed.field_errors?.length
      ? parsed.field_errors
      : Array.isArray(parsed.detail)
        ? parsed.detail
        : [];
    if (errors.length > 0) {
      const first = errors[0];
      const locPath = first.field
        ?? (Array.isArray(first.loc) ? first.loc.filter((p) => p !== "body").join(".") : "");
      const msg = first.message ?? first.msg ?? "Invalid value.";
      return locPath ? `${locPath}: ${msg}` : msg;
    }
  } catch {
    // Fallback to raw body string below.
  }
  return rawBody;
}

async function fetcher<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      ...init,
    });
    if (!res.ok) {
      if (res.status >= 500 && !retried) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetcher<T>(path, init, true);
      }
      throw new Error(formatApiError(res.status, await res.text()));
    }
    return res.json();
  } catch (err) {
    if (!retried && err instanceof TypeError) {
      await new Promise((r) => setTimeout(r, 1000));
      return fetcher<T>(path, init, true);
    }
    throw err;
  }
}

async function fetchVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
}

async function fetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
  return res.blob();
}

export interface ImportProgressEvent {
  type: "progress";
  current: number;
  total: number;
  merchant: string;
  status: string;
  category: string | null;
}

export interface ImportCompleteEvent {
  type: "complete";
  imported: number;
  skipped: number;
  categorized: number;
  errors: string[];
}

export interface AutoCatProgressEvent {
  status: string;
  current: number;
  total: number;
  merchant_name: string;
  category: string | null;
}

export interface AutoCatCompleteEvent {
  status: "complete";
  total: number;
  categorized: number;
  skipped: number;
}

export interface SyncProgressEvent {
  status: "syncing";
  institution: string;
  current: number;
  total: number;
}

export interface AccountDiscoveredEvent {
  status: "account_discovered";
  accounts: string[];
}

export interface SyncCompleteEvent {
  status: "complete";
  synced: number;
  categorized: number;
  skipped: number;
  discoveredAccounts?: string[];
}

export interface BulkImportPayload {
  accounts: { name: string; type: string; subtype?: string; current_balance?: number }[];
  transactions: {
    date: string;
    amount: number;
    merchant_name: string;
    category?: string;
    notes?: string;
    account_name?: string;
    owner_name?: string;
  }[];
  new_categories?: string[];
}

async function streamNdjson<T>(
  path: string,
  body: unknown,
  onProgress: (event: ImportProgressEvent) => void,
): Promise<T> {
  const res = await fetch(`${STREAM_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;
  let lastProgressTime = 0;
  let pendingProgress: ImportProgressEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "progress") {
        const now = Date.now();
        if (now - lastProgressTime >= 100) {
          onProgress(event as ImportProgressEvent);
          lastProgressTime = now;
          pendingProgress = null;
        } else {
          pendingProgress = event as ImportProgressEvent;
        }
      } else if (event.type === "complete") {
        result = event as T;
      }
    }
  }
  if (pendingProgress) {
    onProgress(pendingProgress);
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer);
    if (event.type === "complete") result = event as T;
  }

  if (!result) throw new Error("Import stream ended without completion event");
  return result;
}

async function streamAutoCategorize(
  path: string,
  onProgress?: (event: AutoCatProgressEvent) => void,
): Promise<AutoCatCompleteEvent> {
  const res = await fetch(`${STREAM_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AutoCatCompleteEvent | null = null;
  let lastProgressTime = 0;
  let pendingProgress: AutoCatProgressEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.status === "complete") {
        result = event as AutoCatCompleteEvent;
      } else if (onProgress) {
        const now = Date.now();
        if (now - lastProgressTime >= 100) {
          onProgress(event as AutoCatProgressEvent);
          lastProgressTime = now;
          pendingProgress = null;
        } else {
          pendingProgress = event as AutoCatProgressEvent;
        }
      }
    }
  }
  if (pendingProgress && onProgress) {
    onProgress(pendingProgress);
  }
  if (buffer.trim()) {
    const event = JSON.parse(buffer);
    if (event.status === "complete") result = event as AutoCatCompleteEvent;
  }
  if (!result) throw new Error("Auto-categorize stream ended without completion event");
  return result;
}

async function streamSyncAll(
  path: string,
  onEvent?: (event: SyncProgressEvent | AutoCatProgressEvent | AccountDiscoveredEvent) => void,
): Promise<SyncCompleteEvent> {
  const res = await fetch(`${STREAM_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(formatApiError(res.status, await res.text()));
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: SyncCompleteEvent | null = null;
  let lastProgressTime = 0;
  let pendingEvent: (SyncProgressEvent | AutoCatProgressEvent) | null = null;
  const discoveredAccounts: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.status === "complete") {
        result = event as SyncCompleteEvent;
      } else if (event.status === "account_discovered") {
        discoveredAccounts.push(...(event as AccountDiscoveredEvent).accounts);
        if (onEvent) onEvent(event as AccountDiscoveredEvent);
      } else if (onEvent) {
        const now = Date.now();
        if (now - lastProgressTime >= 100) {
          onEvent(event);
          lastProgressTime = now;
          pendingEvent = null;
        } else {
          pendingEvent = event;
        }
      }
    }
  }
  if (pendingEvent && onEvent) {
    onEvent(pendingEvent);
  }
  if (buffer.trim()) {
    const event = JSON.parse(buffer);
    if (event.status === "complete") result = event as SyncCompleteEvent;
  }
  if (!result) throw new Error("Sync stream ended without completion event");
  if (discoveredAccounts.length > 0) {
    result.discoveredAccounts = discoveredAccounts;
  }
  return result;
}

export const api = {
  // Auth
  loginWithGoogle: (idToken: string) =>
    fetcher<User>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    }),

  getMe: () => fetcher<User>("/auth/me"),

  logout: () =>
    fetcher<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // Accounts
  getAccounts: (scope?: ViewScope) =>
    fetcher<Account[]>(`/accounts${scope && scope !== "personal" ? `?scope=${scope}` : ""}`),

  getAccountSummary: (scope?: ViewScope) =>
    fetcher<AccountSummary>(`/accounts/summary${scope && scope !== "personal" ? `?scope=${scope}` : ""}`),

  createAccount: (body: { name: string; type: string; subtype?: string; current_balance?: number; statement_available_day?: number | null }) =>
    fetcher<Account>("/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteAccount: (accountId: number) =>
    fetcher<{ ok: boolean }>(`/accounts/${accountId}`, { method: "DELETE" }),

  updateAccount: (id: number, body: { type?: string; subtype?: string; name?: string; current_balance?: number; statement_available_day?: number | null }) =>
    fetcher<Account>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getTransactions: (params?: { limit?: number; offset?: number; scope?: ViewScope; uncategorized?: boolean; category?: string; account_id?: number }) => {
    const query = new URLSearchParams();
    if (params?.uncategorized)
      query.set("uncategorized", "true");
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    if (params?.scope && params.scope !== "personal")
      query.set("scope", params.scope);
    if (params?.category) query.set("category", params.category);
    if (params?.account_id) query.set("account_id", String(params.account_id));
    const qs = query.toString();
    return fetcher<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },

  getAllTransactions: async (scope?: ViewScope): Promise<Transaction[]> => {
    const pageSize = 200;
    let offset = 0;
    const all: Transaction[] = [];
    for (;;) {
      const page = await api.getTransactions({ limit: pageSize, offset, scope });
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  },

  getCategories: async () => {
    const cats = await fetcher<string[]>("/transactions/categories");
    return cats.sort((a, b) => a.localeCompare(b));
  },

  createTransaction: (body: {
    date: string; amount: number; merchant_name: string;
    category?: string; notes?: string; account_id?: number;
  }) =>
    fetcher<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTransaction: (id: number, body: {
    category?: string; merchant_name?: string;
    amount?: number; date?: string; notes?: string;
  }) =>
    fetcher<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteTransaction: (id: number) =>
    fetchVoid(`/transactions/${id}`, { method: "DELETE" }),

  getRecurring: (params?: { months?: number; scope?: ViewScope }) => {
    const query = new URLSearchParams();
    if (params?.months) query.set("months", String(params.months));
    if (params?.scope && params.scope !== "personal")
      query.set("scope", params.scope);
    const qs = query.toString();
    return fetcher<RecurringTransaction[]>(`/transactions/recurring${qs ? `?${qs}` : ""}`);
  },

  triggerSync: (plaidItemId: number) =>
    fetcher<{ status: string }>(`/plaid/sync/${plaidItemId}`, { method: "POST" }),

  triggerSyncAll: () =>
    fetcher<{ status: string; items_queued: number }>("/plaid/sync-all", { method: "POST" }),

  syncAllStream: (
    onEvent?: (event: SyncProgressEvent | AutoCatProgressEvent | AccountDiscoveredEvent) => void,
  ): Promise<SyncCompleteEvent> => {
    return streamSyncAll("/plaid/sync-all-stream", onEvent);
  },

  createLinkToken: () => fetcher<{ link_token: string }>("/plaid/link-token", { method: "POST" }),

  createUpdateLinkToken: (plaidItemId: number, accountSelection?: boolean) =>
    fetcher<{ link_token: string }>(
      `/plaid/link-token/update/${plaidItemId}${accountSelection ? "?account_selection=true" : ""}`,
      { method: "POST" },
    ),

  repairPlaidItem: (plaidItemId: number) =>
    fetcher<{ status: string }>(`/plaid/items/${plaidItemId}/repair`, { method: "POST" }),

  exchangeToken: (publicToken: string, institutionName?: string) =>
    fetcher<{ item_id: string; accounts_synced: number }>("/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({
        public_token: publicToken,
        institution_name: institutionName,
      }),
    }),

  autoCategorize: (
    onProgress?: (event: AutoCatProgressEvent) => void,
  ): Promise<AutoCatCompleteEvent> =>
    streamAutoCategorize("/transactions/auto-categorize", onProgress),

  unlinkAccount: (accountId: number) =>
    fetcher<Account>(`/accounts/${accountId}/unlink`, { method: "POST" }),

  getStatementReminders: () =>
    fetcher<{ id: number; name: string; statement_available_day: number }[]>("/accounts/statement-reminders"),

  getPlaidItems: (scope?: ViewScope) =>
    fetcher<PlaidConnection[]>(`/plaid/items${scope && scope !== "personal" ? `?scope=${scope}` : ""}`),

  unlinkPlaidItem: (plaidItemId: number) =>
    fetcher<{ status: string; institution_name: string; accounts_unlinked: number }>(
      `/plaid/items/${plaidItemId}/unlink`,
      { method: "POST" }
    ),

  // Profile
  getProfile: () => fetcher<UserProfile>("/settings/profile"),

  updateProfile: (body: { display_name?: string; avatar_url?: string; bio?: string }) =>
    fetcher<UserProfile>("/settings/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // Settings
  getSettings: () => fetcher<UserSettings>("/settings"),

  updateSettings: (body: Partial<UserSettings>) =>
    fetcher<UserSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // Plaid config
  getPlaidConfig: () => fetcher<PlaidConfig>("/settings/plaid-config"),

  updatePlaidConfig: (body: { client_id: string; secret: string; plaid_env: string }) =>
    fetcher<PlaidConfig>("/settings/plaid-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deletePlaidConfig: () =>
    fetchVoid("/settings/plaid-config", { method: "DELETE" }),

  // Plaid mode (managed vs BYOK)
  getPlaidMode: () => fetcher<PlaidModeResponse>("/settings/plaid-mode"),

  setPlaidMode: (mode: string) =>
    fetcher<PlaidModeResponse>("/settings/plaid-mode", {
      method: "PUT",
      body: JSON.stringify({ mode }),
    }),

  // Admin Plaid config (app-level)
  getAdminPlaidConfig: () => fetcher<AdminPlaidConfig>("/settings/admin/plaid-config"),

  updateAdminPlaidConfig: (body: {
    client_id: string;
    secret: string;
    plaid_env: string;
    enabled: boolean;
  }) =>
    fetcher<AdminPlaidConfig>("/settings/admin/plaid-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteAdminPlaidConfig: () =>
    fetchVoid("/settings/admin/plaid-config", { method: "DELETE" }),

  // Admin LLM config (app-level)
  getAdminLLMConfig: () => fetcher<AdminLLMConfig>("/settings/admin/llm-config"),

  updateAdminLLMConfig: (body: {
    llm_base_url: string;
    llm_api_key: string;
    llm_model: string;
    enabled: boolean;
    batch_size?: number;
  }) =>
    fetcher<AdminLLMConfig>("/settings/admin/llm-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteAdminLLMConfig: () =>
    fetchVoid("/settings/admin/llm-config", { method: "DELETE" }),

  // LLM mode (managed vs BYOK)
  getLLMMode: () => fetcher<LLMModeResponse>("/settings/llm-mode"),

  setLLMMode: (mode: string) =>
    fetcher<LLMModeResponse>("/settings/llm-mode", {
      method: "PUT",
      body: JSON.stringify({ mode }),
    }),

  // LLM config (per-household BYOK)
  getLLMConfig: () => fetcher<LLMConfig>("/settings/llm-config"),

  updateLLMConfig: (body: { llm_base_url: string; llm_api_key: string; llm_model: string; batch_size?: number }) =>
    fetcher<LLMConfig>("/settings/llm-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteLLMConfig: () =>
    fetchVoid("/settings/llm-config", { method: "DELETE" }),

  // Sync config
  getSyncConfig: () => fetcher<SyncConfig>("/settings/sync-config"),

  updateSyncConfig: (body: Partial<SyncConfig>) =>
    fetcher<SyncConfig>("/settings/sync-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteSyncConfig: () =>
    fetchVoid("/settings/sync-config", { method: "DELETE" }),

  // Category rules
  getRules: () => fetcher<CategoryRule[]>("/settings/rules"),

  createRule: (body: { keyword: string; category: string; case_sensitive?: boolean }) =>
    fetcher<CategoryRule>("/settings/rules", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateRule: (id: number, body: Partial<CategoryRule>) =>
    fetcher<CategoryRule>(`/settings/rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteRule: (id: number) =>
    fetchVoid(`/settings/rules/${id}`, { method: "DELETE" }),

  exportTransactions: async () => {
    const blob = await fetchBlob("/settings/export");
    return URL.createObjectURL(blob);
  },

  clearTransactions: () =>
    fetchVoid("/settings/transactions", { method: "DELETE" }),

  factoryReset: () =>
    fetchVoid("/settings/all-data", { method: "DELETE" }),

  deleteUserAccount: () =>
    fetchVoid("/settings/account", { method: "DELETE" }),

  // Household
  getHousehold: () => fetcher<Household | null>("/household"),

  updateHouseholdName: (name: string) =>
    fetcher<{ id: number; name: string }>("/household", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  invitePartner: (email: string) =>
    fetcher<{ id: number; token: string; invited_email: string; status: string }>(
      "/household/invite",
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  cancelInvitation: (token: string) =>
    fetcher<{ status: string }>(
      `/household/invitations/${token}`,
      { method: "DELETE" }
    ),

  getPendingInvitations: () =>
    fetcher<HouseholdInvitation[]>("/household/invitations/pending"),

  acceptInvitation: (token: string) =>
    fetcher<{ status: string; household_id: number }>(
      `/household/invitations/${token}/accept`,
      { method: "POST" }
    ),

  declineInvitation: (token: string) =>
    fetcher<{ status: string }>(
      `/household/invitations/${token}/decline`,
      { method: "POST" }
    ),

  leaveHousehold: () =>
    fetcher<{ status: string }>("/household/leave", { method: "DELETE" }),

  // Budgets
  getBudgets: (month?: string, scope?: ViewScope) => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (scope && scope !== "personal") params.set("scope", scope);
    const qs = params.toString();
    return fetcher<Budget[]>(`/budgets${qs ? `?${qs}` : ""}`);
  },

  getBudgetSummary: (month?: string, scope?: ViewScope) => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (scope && scope !== "personal") params.set("scope", scope);
    const qs = params.toString();
    return fetcher<BudgetSummary>(`/budgets/summary${qs ? `?${qs}` : ""}`);
  },

  createBudget: (body: {
    category: string; amount: number; month?: string;
    rollover?: boolean; household_id?: number;
  }) =>
    fetcher<Budget>("/budgets", { method: "POST", body: JSON.stringify(body) }),

  updateBudget: (id: number, body: { amount?: number; rollover?: boolean }) =>
    fetcher<Budget>(`/budgets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteBudget: (id: number) =>
    fetchVoid(`/budgets/${id}`, { method: "DELETE" }),

  copyBudgets: (sourceMonth: string, targetMonth: string) =>
    fetcher<{ copied: number }>(`/budgets/copy?source_month=${sourceMonth}&target_month=${targetMonth}`, { method: "POST" }),

  getSpendingPreferences: () =>
    fetcher<SpendingPreference[]>("/budgets/preferences"),

  setSpendingPreference: (category: string, target: "personal" | "shared") =>
    fetcher<SpendingPreference>("/budgets/preferences", {
      method: "PUT",
      body: JSON.stringify({ category, target }),
    }),

  getBudgetConflicts: (month?: string) => {
    const qs = month ? `?month=${month}` : "";
    return fetcher<BudgetConflict[]>(`/budgets/conflicts${qs}`);
  },

  // Goals
  getGoals: (scope?: ViewScope) =>
    fetcher<GoalsResponse>(`/goals${scope && scope !== "personal" ? `?scope=${scope}` : ""}`),

  createGoal: (body: {
    name: string; target_amount: number; current_amount?: number;
    target_date?: string; icon?: string; color?: string;
    household_id?: number; linked_account_ids?: number[];
  }) =>
    fetcher<Goal>("/goals", { method: "POST", body: JSON.stringify(body) }),

  updateGoal: (id: number, body: Partial<Goal>) =>
    fetcher<Goal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteGoal: (id: number) =>
    fetchVoid(`/goals/${id}`, { method: "DELETE" }),

  addGoalContribution: (goalId: number, amount: number, note?: string) =>
    fetcher<{ goal: Goal } & GoalContribution>(
      `/goals/${goalId}/contributions`,
      { method: "POST", body: JSON.stringify({ amount, note }) }
    ),

  getGoalContributions: (goalId: number) =>
    fetcher<GoalContribution[]>(`/goals/${goalId}/contributions`),

  // Reports
  getSpendingByCategory: (months?: number, scope?: ViewScope) => {
    const params = new URLSearchParams();
    if (months) params.set("months", String(months));
    if (scope && scope !== "personal") params.set("scope", scope);
    const qs = params.toString();
    return fetcher<SpendingByCategory>(`/reports/spending-by-category${qs ? `?${qs}` : ""}`);
  },

  getMonthlyTrends: (months?: number, scope?: ViewScope) => {
    const params = new URLSearchParams();
    if (months) params.set("months", String(months));
    if (scope && scope !== "personal") params.set("scope", scope);
    const qs = params.toString();
    return fetcher<MonthlyTrend[]>(`/reports/monthly-trends${qs ? `?${qs}` : ""}`);
  },

  getTopMerchants: (months?: number, limit?: number, scope?: ViewScope) => {
    const params = new URLSearchParams();
    if (months) params.set("months", String(months));
    if (limit) params.set("limit", String(limit));
    if (scope && scope !== "personal") params.set("scope", scope);
    const qs = params.toString();
    return fetcher<TopMerchant[]>(`/reports/top-merchants${qs ? `?${qs}` : ""}`);
  },

  // Net Worth
  getNetWorthHistory: (months?: number, scope?: ViewScope) => {
    const params = new URLSearchParams();
    if (months) params.set("months", String(months));
    if (scope && scope !== "personal") params.set("scope", scope);
    const qs = params.toString();
    return fetcher<NetWorthSnapshot[]>(`/net-worth/history${qs ? `?${qs}` : ""}`);
  },

  takeNetWorthSnapshot: () =>
    fetcher<NetWorthSnapshot>("/net-worth/snapshot", { method: "POST" }),

  // Tags
  getTags: () => fetcher<Tag[]>("/tags"),

  createTag: (body: { name: string; color?: string }) =>
    fetcher<Tag>("/tags", { method: "POST", body: JSON.stringify(body) }),

  updateTag: (id: number, body: { name?: string; color?: string }) =>
    fetcher<Tag>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteTag: (id: number) =>
    fetchVoid(`/tags/${id}`, { method: "DELETE" }),

  addTagToTransaction: (transactionId: number, tagId: number) =>
    fetcher<{ status: string }>(`/tags/transactions/${transactionId}/tags/${tagId}`, { method: "POST" }),

  removeTagFromTransaction: (transactionId: number, tagId: number) =>
    fetchVoid(`/tags/transactions/${transactionId}/tags/${tagId}`, { method: "DELETE" }),

  // CSV Import
  streamImportTransactions: (
    accountId: number,
    rows: { date: string; amount: number; merchant_name: string; category?: string }[],
    onProgress: (event: ImportProgressEvent) => void,
  ): Promise<ImportCompleteEvent> =>
    streamNdjson(`/settings/import/${accountId}`, { transactions: rows }, onProgress),

  bulkImportTransactions: (
    payload: BulkImportPayload,
    onProgress: (event: ImportProgressEvent) => void,
  ): Promise<ImportCompleteEvent> =>
    streamNdjson("/settings/bulk-import", payload, onProgress),

  // Categories (user-specific)
  getCategoryObjects: () =>
    fetcher<{ id: number; name: string }[]>("/categories"),

  createCategory: (name: string) =>
    fetcher<{ id: number; name: string }>("/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  updateCategory: (id: number, name: string) =>
    fetcher<{ id: number; name: string }>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (id: number, reassignTo?: number) =>
    fetchVoid(`/categories/${id}${reassignTo != null ? `?reassign_to=${reassignTo}` : ""}`, {
      method: "DELETE",
    }),

  importBalances: (payload: {
    rows: { date: string; balance: number; account_name: string }[];
    account_mapping: {
      csv_name: string;
      account_id: number | null;
      create: { name: string; type: string; subtype?: string } | null;
    }[];
  }) =>
    fetcher<{ imported: number; accounts_created: number; snapshots_updated: number }>(
      "/settings/import-balances",
      { method: "POST", body: JSON.stringify(payload) },
    ),

  // Admin
  getAdminOverview: () => fetcher<AdminOverview>("/admin/overview"),

  getAdminUsers: (params?: { limit?: number; offset?: number; search?: string; active_days?: number; has_linked?: boolean; has_manual?: boolean; sort?: string }) => {
    const p = new URLSearchParams();
    if (params?.limit != null) p.set("limit", String(params.limit));
    if (params?.offset != null) p.set("offset", String(params.offset));
    if (params?.search) p.set("search", params.search);
    if (params?.active_days != null) p.set("active_days", String(params.active_days));
    if (params?.has_linked != null) p.set("has_linked", String(params.has_linked));
    if (params?.has_manual != null) p.set("has_manual", String(params.has_manual));
    if (params?.sort) p.set("sort", params.sort);
    const qs = p.toString();
    return fetcher<AdminUsersResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
  },

  updateAdminUser: (userId: number, body: { is_admin?: boolean; is_disabled?: boolean }) =>
    fetcher<AdminUser>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteAdminUser: (userId: number) =>
    fetchVoid(`/admin/users/${userId}`, { method: "DELETE" }),

  getAdminUserDetail: (userId: number) =>
    fetcher<AdminUserDetail>(`/admin/users/${userId}/detail`),

  getAdminPlaidHealth: () => fetcher<AdminPlaidHealth>("/admin/plaid-health"),

  getAdminErrors: (params?: { limit?: number; offset?: number; error_type?: string }) => {
    const p = new URLSearchParams();
    if (params?.limit != null) p.set("limit", String(params.limit));
    if (params?.offset != null) p.set("offset", String(params.offset));
    if (params?.error_type) p.set("error_type", params.error_type);
    const qs = p.toString();
    return fetcher<AdminErrorsResponse>(`/admin/errors${qs ? `?${qs}` : ""}`);
  },

  getAdminActiveUsers: (days?: number) =>
    fetcher<ActiveUsersPoint[]>(`/admin/analytics/active-users${days ? `?days=${days}` : ""}`),

  getAdminFeatureAdoption: () =>
    fetcher<FeatureAdoption[]>("/admin/analytics/feature-adoption"),

  getAdminTransactionVolume: (days?: number) =>
    fetcher<TransactionVolumePoint[]>(`/admin/analytics/transaction-volume${days ? `?days=${days}` : ""}`),

  getAdminStorage: () =>
    fetcher<StorageMetric[]>("/admin/analytics/storage"),

  getAdminWebhookEvents: (params?: { limit?: number; offset?: number; webhook_type?: string; webhook_code?: string }) => {
    const p = new URLSearchParams();
    if (params?.limit != null) p.set("limit", String(params.limit));
    if (params?.offset != null) p.set("offset", String(params.offset));
    if (params?.webhook_type) p.set("webhook_type", params.webhook_type);
    if (params?.webhook_code) p.set("webhook_code", params.webhook_code);
    const qs = p.toString();
    return fetcher<WebhookEventsResponse>(`/admin/webhook-events${qs ? `?${qs}` : ""}`);
  },
};
