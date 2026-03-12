import type { Account, AccountSummary, PlaidConnection, Transaction } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export const api = {
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
};
