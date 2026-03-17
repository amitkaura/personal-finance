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
  });

  it("renders all four tabs", async () => {
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /plaid health/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /analytics/i })).toBeInTheDocument();
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
});
