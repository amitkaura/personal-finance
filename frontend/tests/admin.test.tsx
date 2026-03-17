import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, TEST_USER } from "./helpers";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));

const mockApi = vi.hoisted(() => ({
  getMe: vi.fn(),
  getAdminOverview: vi.fn(),
  getAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  getAdminPlaidHealth: vi.fn(),
  getAdminErrors: vi.fn(),
  getAdminActiveUsers: vi.fn(),
  getAdminFeatureAdoption: vi.fn(),
  getAdminTransactionVolume: vi.fn(),
  getAdminStorage: vi.fn(),
  getAdminUserDetail: vi.fn(),
  getAdminPlaidConfig: vi.fn(),
  updateAdminPlaidConfig: vi.fn(),
  deleteAdminPlaidConfig: vi.fn(),
  getAdminLLMConfig: vi.fn(),
  updateAdminLLMConfig: vi.fn(),
  deleteAdminLLMConfig: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: { ...TEST_USER, is_admin: true }, loading: false }),
}));

vi.mock("@/components/confirm-dialog", () => ({
  default: ({ open, title, onConfirm }: { open: boolean; title: string; onConfirm: () => void }) =>
    open ? (
      <div data-testid="confirm-dialog">
        {title}
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

import AdminPage from "@/app/admin/page";

const MOCK_OVERVIEW = {
  total_users: 42,
  active_7d: 15,
  active_30d: 30,
  total_accounts: 88,
  linked_accounts: 60,
  manual_accounts: 28,
  total_transactions: 1500,
  total_households: 20,
  recent_errors: 3,
};

const MOCK_USERS = {
  items: [
    {
      id: 2,
      email: "user@example.com",
      name: "Regular User",
      picture: null,
      is_admin: false,
      is_disabled: false,
      created_at: "2025-01-15T10:00:00",
      account_count: 3,
      transaction_count: 150,
      last_active: "2025-03-10T14:00:00",
    },
    {
      id: 3,
      email: "disabled@example.com",
      name: "Disabled User",
      picture: null,
      is_admin: false,
      is_disabled: true,
      created_at: "2025-02-01T10:00:00",
      account_count: 1,
      transaction_count: 10,
      last_active: null,
    },
  ],
  total: 2,
};

const MOCK_PLAID_HEALTH = {
  total_plaid_errors: 5,
  recent_errors: [
    {
      id: 1,
      user_id: 2,
      error_type: "plaid_sync",
      endpoint: "/api/v1/plaid/sync/1",
      status_code: 500,
      detail: "ITEM_LOGIN_REQUIRED",
      created_at: "2025-03-10T14:00:00",
    },
  ],
};

const MOCK_FEATURE_ADOPTION = [
  { feature: "budgets", user_count: 10, percentage: 25.0 },
  { feature: "goals", user_count: 8, percentage: 20.0 },
  { feature: "tags", user_count: 5, percentage: 12.5 },
  { feature: "categories", user_count: 30, percentage: 75.0 },
];

const MOCK_STORAGE = [
  { table_name: "users", row_count: 42 },
  { table_name: "transactions", row_count: 1500 },
  { table_name: "accounts", row_count: 88 },
];

const MOCK_ADMIN_PLAID_CONFIG = {
  configured: true,
  enabled: true,
  plaid_env: "sandbox",
  client_id_last4: "1234",
  secret_last4: "5678",
  managed_household_count: 3,
};

const MOCK_ADMIN_LLM_CONFIG = {
  configured: true,
  enabled: true,
  llm_base_url: "https://api.openai.com/v1",
  llm_model: "gpt-4o",
  api_key_last4: "5678",
  managed_household_count: 2,
};

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getMe.mockResolvedValue({ ...TEST_USER, is_admin: true });
    mockApi.getAdminOverview.mockResolvedValue(MOCK_OVERVIEW);
    mockApi.getAdminUsers.mockResolvedValue(MOCK_USERS);
    mockApi.getAdminPlaidHealth.mockResolvedValue(MOCK_PLAID_HEALTH);
    mockApi.getAdminErrors.mockResolvedValue({ items: [], total: 0 });
    mockApi.getAdminActiveUsers.mockResolvedValue([]);
    mockApi.getAdminFeatureAdoption.mockResolvedValue(MOCK_FEATURE_ADOPTION);
    mockApi.getAdminTransactionVolume.mockResolvedValue([]);
    mockApi.getAdminStorage.mockResolvedValue(MOCK_STORAGE);
    mockApi.getAdminPlaidConfig.mockResolvedValue(MOCK_ADMIN_PLAID_CONFIG);
    mockApi.getAdminLLMConfig.mockResolvedValue(MOCK_ADMIN_LLM_CONFIG);
  });

  it("renders all six tabs", async () => {
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /plaid health/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /plaid config/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /llm config/i })).toBeInTheDocument();
  });

  it("shows overview KPI cards with correct data", async () => {
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("switches to users tab and shows user list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /users/i }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });
    expect(screen.getByText("disabled@example.com")).toBeInTheDocument();
  });

  it("can disable a user via the users tab", async () => {
    const user = userEvent.setup();
    mockApi.updateAdminUser.mockResolvedValue({ ...MOCK_USERS.items[0], is_disabled: true });

    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /users/i }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    const disableButtons = screen.getAllByRole("button", { name: /disable/i });
    await user.click(disableButtons[0]);

    await waitFor(() => {
      expect(mockApi.updateAdminUser).toHaveBeenCalledWith(2, { is_disabled: true });
    });
  });

  it("can delete a user with confirmation dialog", async () => {
    const user = userEvent.setup();
    mockApi.deleteAdminUser.mockResolvedValue(undefined);

    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /users/i }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(mockApi.deleteAdminUser).toHaveBeenCalledWith(2);
    });
  });

  it("switches to plaid health tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /plaid health/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /plaid health/i }));

    await waitFor(() => {
      expect(screen.getByText("ITEM_LOGIN_REQUIRED")).toBeInTheDocument();
    });
  });

  it("switches to analytics tab and shows feature adoption", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /analytics/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /analytics/i }));

    await waitFor(() => {
      expect(screen.getByText(/budgets/i)).toBeInTheDocument();
    });
  });

  it("shows search input on users tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /users/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  // ── KPI Drill-Down Tests ──────────────────────────────────────

  it("clicking Active (7d) KPI switches to users tab with active filter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    const kpiCard = screen.getByTestId("kpi-active-7d");
    await user.click(kpiCard);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toHaveAttribute("aria-selected", "true");
    });

    expect(mockApi.getAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ active_days: 7 })
    );
  });

  it("clicking Linked Accounts KPI switches to users tab with has_linked filter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const kpiCard = screen.getByTestId("kpi-linked-accounts");
    await user.click(kpiCard);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toHaveAttribute("aria-selected", "true");
    });

    expect(mockApi.getAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ has_linked: true })
    );
  });

  it("clicking Manual Accounts KPI switches to users tab with has_manual filter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const kpiCard = screen.getByTestId("kpi-manual-accounts");
    await user.click(kpiCard);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toHaveAttribute("aria-selected", "true");
    });

    expect(mockApi.getAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ has_manual: true })
    );
  });

  it("shows filter badge on users tab when filter is active and can clear it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-active-7d")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("kpi-active-7d"));

    await waitFor(() => {
      expect(screen.getByTestId("filter-badge")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("clear-filter"));

    await waitFor(() => {
      expect(screen.queryByTestId("filter-badge")).not.toBeInTheDocument();
    });
  });

  // ── User Detail Expandable Row Tests ──────────────────────────

  it("clicking a user row expands detail panel", async () => {
    const mockDetail = {
      user: MOCK_USERS.items[0],
      accounts: [{ id: 1, name: "Checking", type: "depository", subtype: "checking", current_balance: 5000, is_linked: true, created_at: "2025-01-01T00:00:00" }],
      recent_transactions: [{ id: 1, date: "2025-03-10", merchant_name: "Amazon", amount: 42.5, category: "Shopping", account_name: "Checking" }],
      recent_activity: [{ action: "login", detail: null, created_at: "2025-03-10T14:00:00" }],
      stats: { total_transactions: 150, first_transaction_date: "2025-01-01", categories_used: 8, rules_created: 3, tags_created: 2 },
    };
    mockApi.getAdminUserDetail.mockResolvedValue(mockDetail);

    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /users/i }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("user-row-2"));

    await waitFor(() => {
      expect(screen.getByTestId("user-detail-2")).toBeInTheDocument();
    });
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Amazon")).toBeInTheDocument();
  });

  // ── Analytics Tab Chart Tests ─────────────────────────────────

  it("analytics tab shows active users and transaction volume sections", async () => {
    mockApi.getAdminActiveUsers.mockResolvedValue([
      { date: "2025-03-10", dau: 10, wau: 30, mau: 50 },
      { date: "2025-03-11", dau: 12, wau: 32, mau: 52 },
    ]);
    mockApi.getAdminTransactionVolume.mockResolvedValue([
      { date: "2025-03-10", count: 100 },
      { date: "2025-03-11", count: 120 },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /analytics/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /analytics/i }));

    await waitFor(() => {
      expect(screen.getByTestId("active-users-chart")).toBeInTheDocument();
    });
    expect(screen.getByTestId("transaction-volume-chart")).toBeInTheDocument();
  });

  // ── Plaid Config Tab Tests ──────────────────────────────────

  it("switches to plaid config tab and shows config status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /plaid config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /plaid config/i }));

    await waitFor(() => {
      expect(screen.getByText(/3 household/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/configured/i)).toBeInTheDocument();
  });

  it("plaid config tab shows save button and environment selector", async () => {
    const user = userEvent.setup();
    mockApi.getAdminPlaidConfig.mockResolvedValue({
      configured: false, enabled: false, plaid_env: null,
      client_id_last4: null, secret_last4: null, managed_household_count: 0,
    });

    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /plaid config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /plaid config/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });
  });

  // ── LLM Config Tab Tests ─────────────────────────────────────

  it("switches to LLM Config tab and shows config status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /llm config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /llm config/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 household/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/configured/i)).toBeInTheDocument();
  });

  it("LLM Config tab shows model and base URL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /llm config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /llm config/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("gpt-4o")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("https://api.openai.com/v1")).toBeInTheDocument();
  });

  it("LLM Config tab shows save button", async () => {
    const user = userEvent.setup();
    mockApi.getAdminLLMConfig.mockResolvedValue({
      configured: false, enabled: false, llm_base_url: null,
      llm_model: null, api_key_last4: null, managed_household_count: 0,
    });

    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /llm config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /llm config/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });
  });

  it("LLM Config tab shows enabled toggle", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /llm config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /llm config/i }));

    await waitFor(() => {
      expect(screen.getByTestId("llm-enabled-toggle")).toBeInTheDocument();
    });
  });
});
