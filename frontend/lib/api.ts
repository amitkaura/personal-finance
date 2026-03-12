import type { Account, AccountSummary, CategoryRule, PlaidConnection, Transaction, User, UserSettings } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
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
  getAccounts: () => fetcher<Account[]>("/accounts"),

  getAccountSummary: () => fetcher<AccountSummary>("/accounts/summary"),

  updateAccount: (id: number, body: { type?: string; subtype?: string; name?: string }) =>
    fetcher<Account>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getTransactions: (params?: { needs_review?: boolean; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.needs_review !== undefined)
      query.set("needs_review", String(params.needs_review));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetcher<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },

  getCategories: () => fetcher<string[]>("/transactions/categories"),

  updateTransaction: (id: number, body: { needs_review?: boolean; category?: string }) =>
    fetcher<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

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

  getPlaidItems: () => fetcher<PlaidConnection[]>("/plaid/items"),

  unlinkPlaidItem: (plaidItemId: number) =>
    fetcher<{ status: string; institution_name: string; accounts_unlinked: number }>(
      `/plaid/items/${plaidItemId}/unlink`,
      { method: "POST" }
    ),

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

  exportTransactions: () => `${API_BASE}/settings/export`,

  clearTransactions: () =>
    fetchVoid("/settings/transactions", { method: "DELETE" }),
};
