import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, type ReactElement } from "react";
import type {
  User,
  Household,
  HouseholdInvitation,
  HouseholdMember,
  UserSettings,
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
