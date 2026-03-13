import type {
  Account, AccountSummary, Budget, BudgetConflict, BudgetSummary,
  CategoryRule, Goal, GoalContribution, GoalsResponse,
  Household, HouseholdInvitation, MonthlyTrend, NetWorthSnapshot,
  PlaidConnection, RecurringTransaction, SpendingByCategory, SpendingPreference,
  Tag, TopMerchant, Transaction, User, UserProfile, UserSettings, ViewScope,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
}

async function fetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
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

export interface BulkImportPayload {
  accounts: { name: string; type: string }[];
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
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;

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
        onProgress(event as ImportProgressEvent);
      } else if (event.type === "complete") {
        result = event as T;
      }
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer);
    if (event.type === "complete") result = event as T;
  }

  if (!result) throw new Error("Import stream ended without completion event");
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

  createAccount: (body: { name: string; type: string; current_balance?: number }) =>
    fetcher<Account>("/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteAccount: (accountId: number) =>
    fetcher<{ ok: boolean }>(`/accounts/${accountId}`, { method: "DELETE" }),

  updateAccount: (id: number, body: { type?: string; subtype?: string; name?: string }) =>
    fetcher<Account>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getTransactions: (params?: { needs_review?: boolean; limit?: number; scope?: ViewScope }) => {
    const query = new URLSearchParams();
    if (params?.needs_review !== undefined)
      query.set("needs_review", String(params.needs_review));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.scope && params.scope !== "personal")
      query.set("scope", params.scope);
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

  getCategories: () => fetcher<string[]>("/transactions/categories"),

  createTransaction: (body: {
    date: string; amount: number; merchant_name: string;
    category?: string; notes?: string; account_id?: number;
  }) =>
    fetcher<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTransaction: (id: number, body: {
    needs_review?: boolean; category?: string; merchant_name?: string;
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

  createLinkToken: () => fetcher<{ link_token: string }>("/plaid/link-token", { method: "POST" }),

  exchangeToken: (publicToken: string, institutionName?: string) =>
    fetcher<{ item_id: string; accounts_synced: number }>("/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({
        public_token: publicToken,
        institution_name: institutionName,
      }),
    }),

  autoCategorize: () =>
    fetcher<{ total: number; categorized: number; skipped: number }>(
      "/transactions/auto-categorize",
      { method: "POST" }
    ),

  unlinkAccount: (accountId: number) =>
    fetcher<Account>(`/accounts/${accountId}/unlink`, { method: "POST" }),

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

  updateSettings: (body: Partial<UserSettings> & { llm_api_key?: string }) =>
    fetcher<UserSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

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
  getUserCategories: () =>
    fetcher<{ id: number; name: string }[]>("/categories"),
};
