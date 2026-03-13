import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, type ReactElement } from "react";
import type {
  User,
  Household,
  HouseholdInvitation,
  HouseholdMember,
  UserSettings,
  Transaction,
  Account,
} from "@/lib/types";

// ─── Fixtures ──────────────────────────────────────────────────────

export const TEST_USER: User = {
  id: 1,
  email: "alice@example.com",
  name: "Alice Smith",
  picture: "https://example.com/alice.jpg",
  display_name: null,
  avatar_url: null,
  bio: null,
  google_name: "Alice Smith",
  google_picture: "https://example.com/alice.jpg",
};

export const PARTNER_USER: User = {
  id: 2,
  email: "bob@example.com",
  name: "Bob Jones",
  picture: "https://example.com/bob.jpg",
  display_name: "Bobby",
  avatar_url: null,
  bio: null,
  google_name: "Bob Jones",
  google_picture: "https://example.com/bob.jpg",
};

export const PARTNER_MEMBER: HouseholdMember = {
  id: 2,
  user_id: 2,
  name: "Bob Jones",
  email: "bob@example.com",
  picture: "https://example.com/bob.jpg",
  role: "member",
};

export const SELF_MEMBER: HouseholdMember = {
  id: 1,
  user_id: 1,
  name: "Alice Smith",
  email: "alice@example.com",
  picture: "https://example.com/alice.jpg",
  role: "owner",
};

export const TEST_HOUSEHOLD: Household = {
  id: 1,
  name: "Smith-Jones",
  members: [SELF_MEMBER, PARTNER_MEMBER],
  pending_invitations: [],
};

export const TEST_INVITATION: HouseholdInvitation = {
  id: 10,
  token: "inv-token-123",
  household_name: "The Smiths",
  invited_by_name: "Bob Jones",
  invited_by_picture: "https://example.com/bob.jpg",
  status: "pending",
};

export const TEST_SETTINGS: UserSettings = {
  currency: "CAD",
  date_format: "YYYY-MM-DD",
  locale: "en-CA",
  sync_enabled: false,
  sync_hour: 6,
  sync_minute: 0,
  sync_timezone: "America/Toronto",
  llm_base_url: "",
  llm_api_key_set: false,
  llm_model: "",
};

export const TEST_ACCOUNT: Account = {
  id: 1,
  user_id: 1,
  name: "Checking",
  official_name: "Primary Checking",
  type: "depository",
  subtype: "checking",
  current_balance: 5000,
  available_balance: 4800,
  credit_limit: null,
  currency_code: "CAD",
  plaid_account_id: "plaid-1",
  plaid_item_id: 1,
  is_linked: true,
};

export const TEST_TRANSACTIONS: Transaction[] = [
  {
    id: 1,
    date: "2025-03-01",
    amount: 42.5,
    merchant_name: "Coffee Shop",
    category: "Food & Dining",
    pending_status: false,
    account_id: 1,
    plaid_transaction_id: "txn-1",
    is_manual: false,
    notes: null,
    tags: [],
  },
  {
    id: 2,
    date: "2025-03-02",
    amount: -1500,
    merchant_name: "Employer Inc",
    category: null,
    pending_status: false,
    account_id: 1,
    plaid_transaction_id: "txn-2",
    is_manual: false,
    notes: null,
    tags: [],
  },
  {
    id: 3,
    date: "2025-03-03",
    amount: 25.0,
    merchant_name: "Grocery Store",
    category: null,
    pending_status: false,
    account_id: 1,
    plaid_transaction_id: "",
    is_manual: true,
    notes: "Weekly groceries",
    tags: [{ id: 1, name: "essentials", color: "#4ade80" }],
  },
];

export const TEST_CATEGORIES = ["Food & Dining", "Groceries", "Transportation", "Entertainment"];

// ─── Mock API ──────────────────────────────────────────────────────

export function createMockApi(overrides: Record<string, unknown> = {}) {
  return {
    getMe: vi.fn().mockResolvedValue(TEST_USER),
    loginWithGoogle: vi.fn().mockResolvedValue(TEST_USER),
    logout: vi.fn().mockResolvedValue({ ok: true }),
    getHousehold: vi.fn().mockResolvedValue(null),
    getPendingInvitations: vi.fn().mockResolvedValue([]),
    acceptInvitation: vi.fn().mockResolvedValue({ status: "accepted", household_id: 1 }),
    declineInvitation: vi.fn().mockResolvedValue({ status: "declined" }),
    getSettings: vi.fn().mockResolvedValue(TEST_SETTINGS),
    invitePartner: vi.fn().mockResolvedValue({ id: 1, token: "t", invited_email: "x@x.com", status: "pending" }),
    cancelInvitation: vi.fn().mockResolvedValue({ status: "cancelled" }),
    updateHouseholdName: vi.fn().mockResolvedValue({ id: 1, name: "New Name" }),
    leaveHousehold: vi.fn().mockResolvedValue({ status: "left" }),
    getProfile: vi.fn().mockResolvedValue(TEST_USER),
    updateProfile: vi.fn().mockResolvedValue(TEST_USER),
    getAccounts: vi.fn().mockResolvedValue([]),
    getAccountSummary: vi.fn().mockResolvedValue({ net_worth: 0, total_balance: 0, depository_balance: 0, investment_balance: 0, credit_balance: 0, loan_balance: 0, credit_accounts: [], loan_accounts: [], account_count: 0 }),
    getTransactions: vi.fn().mockResolvedValue([]),
    getAllTransactions: vi.fn().mockResolvedValue([]),
    getCategories: vi.fn().mockResolvedValue([]),
    getBudgets: vi.fn().mockResolvedValue([]),
    getBudgetSummary: vi.fn().mockResolvedValue({ month: "2025-01", items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 }),
    getGoals: vi.fn().mockResolvedValue([]),
    getTags: vi.fn().mockResolvedValue([]),
    getRules: vi.fn().mockResolvedValue([]),
    updateTransaction: vi.fn().mockResolvedValue({}),
    createTransaction: vi.fn().mockResolvedValue({}),
    deleteTransaction: vi.fn().mockResolvedValue({ ok: true }),
    autoCategorize: vi.fn().mockResolvedValue({ updated: 0 }),
    getRecurring: vi.fn().mockResolvedValue([]),
    getSpendingByCategory: vi.fn().mockResolvedValue([]),
    getMonthlyTrends: vi.fn().mockResolvedValue([]),
    getTopMerchants: vi.fn().mockResolvedValue([]),
    getCategoryTrends: vi.fn().mockResolvedValue([]),
    getNetWorthHistory: vi.fn().mockResolvedValue([]),
    takeNetWorthSnapshot: vi.fn().mockResolvedValue({ ok: true }),
    triggerSyncAll: vi.fn().mockResolvedValue({ ok: true }),
    createLinkToken: vi.fn().mockResolvedValue({ link_token: "test-token" }),
    exchangeToken: vi.fn().mockResolvedValue({ item_id: "item-1", accounts_synced: 2 }),
    getPlaidItems: vi.fn().mockResolvedValue([]),
    unlinkPlaidItem: vi.fn().mockResolvedValue({ ok: true }),
    triggerSync: vi.fn().mockResolvedValue({ ok: true }),
    copyBudgets: vi.fn().mockResolvedValue({ copied: 0 }),
    createBudget: vi.fn().mockResolvedValue({}),
    updateBudget: vi.fn().mockResolvedValue({}),
    deleteBudget: vi.fn().mockResolvedValue({ ok: true }),
    getBudgetConflicts: vi.fn().mockResolvedValue([]),
    setSpendingPreference: vi.fn().mockResolvedValue({}),
    createGoal: vi.fn().mockResolvedValue({}),
    updateGoal: vi.fn().mockResolvedValue({}),
    deleteGoal: vi.fn().mockResolvedValue({ ok: true }),
    addGoalContribution: vi.fn().mockResolvedValue({}),
    getGoalContributions: vi.fn().mockResolvedValue([]),
    getUserCategories: vi.fn().mockResolvedValue([]),
    updateSettings: vi.fn().mockResolvedValue(TEST_SETTINGS),
    ...overrides,
  };
}

// ─── Query Client ──────────────────────────────────────────────────

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// ─── Wrapper ───────────────────────────────────────────────────────

export function createWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient },
) {
  const { queryClient, ...renderOptions } = options ?? {};
  const qc = queryClient ?? createTestQueryClient();
  return {
    ...render(ui, {
      wrapper: createWrapper(qc),
      ...renderOptions,
    }),
    queryClient: qc,
  };
}
