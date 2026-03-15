import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountsPage from "@/app/accounts/page";
import { renderWithProviders, TEST_USER, TEST_SETTINGS } from "./helpers";
import type { Account } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getAccountSummary: vi.fn(),
  getSettings: vi.fn(),
  createAccount: vi.fn(),
  deleteAccount: vi.fn(),
  updateAccount: vi.fn(),
  unlinkAccount: vi.fn(),
  importTransactions: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: TEST_USER, isLoading: false }),
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null,
    partner: null,
    scope: "personal",
    setScope: vi.fn(),
    pendingInvitations: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/link-account", () => ({
  __esModule: true,
  default: () => <button>Link Account</button>,
}));

const mockRouterPush = vi.hoisted(() => vi.fn());
const mockSearchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/accounts",
  useSearchParams: () => mockSearchParams.value,
}));

const MANUAL_ACCOUNT: Account = {
  id: 1,
  user_id: 1,
  name: "Manual Checking",
  official_name: null,
  type: "depository",
  subtype: "checking",
  current_balance: 5000,
  available_balance: null,
  credit_limit: null,
  currency_code: "CAD",
  plaid_account_id: "manual-abc123",
  plaid_item_id: null,
  is_linked: true,
};

const PLAID_ACCOUNT: Account = {
  id: 2,
  user_id: 1,
  name: "TD Savings",
  official_name: "TD Every Day Savings",
  type: "depository",
  subtype: "savings",
  current_balance: 12000,
  available_balance: 12000,
  credit_limit: null,
  currency_code: "CAD",
  plaid_account_id: "plaid-xyz789",
  plaid_item_id: 10,
  is_linked: true,
};

describe("AccountsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.value = new URLSearchParams();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getAccounts.mockResolvedValue([]);
    mockApi.getAccountSummary.mockResolvedValue({
      net_worth: 0, total_balance: 0, depository_balance: 0,
      investment_balance: 0, credit_balance: 0, loan_balance: 0,
      credit_accounts: [], loan_accounts: [], account_count: 0,
    });
  });

  it("renders empty state when no accounts exist", async () => {
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No accounts yet|All accounts are hidden/)).toBeInTheDocument();
    });
  });

  it("shows Add Account button", async () => {
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
  });

  it("shows Link Account button", async () => {
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Link Account")).toBeInTheDocument();
    });
  });

  it("renders account rows when accounts exist", async () => {
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT, PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
      expect(screen.getByText("TD Savings")).toBeInTheDocument();
    });
  });

  it("shows friendly type label and subtype instead of raw type string", async () => {
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });
    expect(screen.getByText(/Cash · checking/)).toBeInTheDocument();
    expect(screen.queryByText("depository")).not.toBeInTheDocument();
  });

  it("shows official_name for Plaid accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("TD Savings")).toBeInTheDocument();
    });
    expect(screen.getByText("TD Every Day Savings")).toBeInTheDocument();
  });

  it("shows Import CSV button only on manual accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT, PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });
    const importButtons = screen.getAllByTitle("Import transactions from CSV");
    expect(importButtons).toHaveLength(1);
  });

  it("shows Delete button only on manual accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT, PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle("Delete account");
    expect(deleteButtons).toHaveLength(1);
  });

  it("shows Unlink button only on Plaid accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT, PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("TD Savings")).toBeInTheDocument();
    });
    const unlinkButtons = screen.getAllByTitle("Unlink account");
    expect(unlinkButtons).toHaveLength(1);
  });

  it("opens Add Account form when clicking Add Account", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    expect(screen.getByText("Add Manual Account")).toBeInTheDocument();
    expect(screen.getByText("Create Account")).toBeInTheDocument();
  });

  it("disables Create Account when name is empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    const createBtn = screen.getByText("Create Account");
    expect(createBtn).toBeDisabled();
  });

  it("shows explicit validation when account name is empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    const nameInput = screen.getByPlaceholderText("e.g. TD Chequing");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    const errorEl = screen.getByText("Account name is required.");
    expect(errorEl.className).toContain("opacity-100");
  });

  it("calls createAccount on form submission", async () => {
    const user = userEvent.setup();
    mockApi.createAccount.mockResolvedValue({ ...MANUAL_ACCOUNT });
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    const nameInput = screen.getByPlaceholderText("e.g. TD Chequing");
    await user.type(nameInput, "New Savings");

    await user.click(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockApi.createAccount).toHaveBeenCalledWith({
        name: "New Savings",
        type: "depository",
        subtype: "Cash Management",
        current_balance: 0,
      });
    });
  });

  it("shows create-account error message when API fails", async () => {
    const user = userEvent.setup();
    mockApi.createAccount.mockRejectedValue(new Error("Name already exists"));
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    const nameInput = screen.getByPlaceholderText("e.g. TD Chequing");
    await user.type(nameInput, "New Savings");
    await user.click(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(screen.getByText("Name already exists")).toBeInTheDocument();
    });
  });

  it("includes default subtype when creating an account", async () => {
    const user = userEvent.setup();
    mockApi.createAccount.mockResolvedValue({ ...MANUAL_ACCOUNT });
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    const nameInput = screen.getByPlaceholderText("e.g. TD Chequing");
    await user.type(nameInput, "My Checking");

    await user.click(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockApi.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ subtype: "Cash Management" }),
      );
    });
  });

  it("shows delete confirmation dialog when clicking delete", async () => {
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT]);
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete account"));

    await waitFor(() => {
      expect(screen.getByText("Delete Manual Checking?")).toBeInTheDocument();
      expect(screen.getByText(/permanently delete this account/)).toBeInTheDocument();
    });
  });

  it("navigates to transactions page filtered by account when clicking a row", async () => {
    mockRouterPush.mockClear();
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT]);
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Manual Checking"));

    expect(mockRouterPush).toHaveBeenCalledWith("/transactions?account=1");
  });

  // --- Edit account modal ---

  it("shows Edit button on each account row", async () => {
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT, PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });
    const editButtons = screen.getAllByTitle("Edit account");
    expect(editButtons).toHaveLength(2);
  });

  it("opens edit modal with pre-filled fields when clicking edit", async () => {
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Edit account"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Manual Checking")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5000")).toBeInTheDocument();
  });

  it("calls updateAccount with edited name on save", async () => {
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT]);
    mockApi.updateAccount.mockResolvedValue({ ...MANUAL_ACCOUNT, name: "Renamed" });
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Edit account"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("Manual Checking");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");

    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockApi.updateAccount).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Renamed" }),
      );
    });
  });

  it("disables balance input for Plaid accounts in the edit modal", async () => {
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("TD Savings")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Edit account"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const balanceInput = screen.getByDisplayValue("12000");
    expect(balanceInput).toBeDisabled();
    expect(screen.getByText(/synced from your bank/i)).toBeInTheDocument();
  });

  it("opens CSV import dialog when clicking import", async () => {
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([MANUAL_ACCOUNT]);
    renderWithProviders(<AccountsPage />);

    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Import transactions from CSV"));

    await waitFor(() => {
      expect(screen.getByText(/Import Transactions to Manual Checking/)).toBeInTheDocument();
      expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
    });
  });

  // --- Statement available day ---

  it("shows statement day field in add account form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    expect(screen.getByLabelText(/Statement day/)).toBeInTheDocument();
  });

  it("submits statement_available_day when creating account", async () => {
    const user = userEvent.setup();
    mockApi.createAccount.mockResolvedValue({ ...MANUAL_ACCOUNT });
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    const nameInput = screen.getByPlaceholderText("e.g. TD Chequing");
    await user.type(nameInput, "New Savings");

    const dayInput = screen.getByLabelText(/Statement day/);
    await user.type(dayInput, "15");

    await user.click(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockApi.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ statement_available_day: 15 }),
      );
    });
  });

  it("shows statement day in edit modal", async () => {
    const user = userEvent.setup();
    const accountWithDay: Account = { ...MANUAL_ACCOUNT, statement_available_day: 20 };
    mockApi.getAccounts.mockResolvedValue([accountWithDay]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Manual Checking")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Edit account"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
  });

  it("statement day is editable for Plaid accounts in edit modal", async () => {
    const user = userEvent.setup();
    mockApi.getAccounts.mockResolvedValue([PLAID_ACCOUNT]);
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("TD Savings")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Edit account"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dayInput = screen.getByLabelText(/Statement day/);
    expect(dayInput).not.toBeDisabled();
  });

  it("auto-opens the add account form when ?add=true is in the URL", async () => {
    mockSearchParams.value = new URLSearchParams("add=true");
    renderWithProviders(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText("Add Manual Account")).toBeInTheDocument();
      expect(screen.getByText("Create Account")).toBeInTheDocument();
    });
  });
});
