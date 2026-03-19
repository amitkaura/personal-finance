import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConnectionsPage from "@/app/connections/page";
import { renderWithProviders } from "./helpers";
import type { ViewScope, PlaidConnection } from "@/lib/types";
import { PLAID_ITEM_STATUS } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getPlaidItems: vi.fn(),
  getPlaidConfig: vi.fn(),
  triggerSync: vi.fn(),
  unlinkPlaidItem: vi.fn(),
  createLinkToken: vi.fn(),
  exchangeToken: vi.fn(),
  createUpdateLinkToken: vi.fn(),
  repairPlaidItem: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

const mockScope = vi.hoisted(() => ({ value: "personal" as ViewScope }));

vi.mock("@/lib/hooks", () => ({
  useFormatCurrencyPrecise: () => (n: number) =>
    `$${Math.abs(n).toFixed(2)}`,
  useScope: () => mockScope.value,
}));

vi.mock("@/components/link-account", () => ({
  __esModule: true,
  default: () => <button>Link Account</button>,
}));

const TEST_CONNECTION: PlaidConnection = {
  id: 1,
  item_id: "item-1",
  institution_name: "Test Bank",
  status: PLAID_ITEM_STATUS.HEALTHY,
  plaid_error_code: null,
  plaid_error_message: null,
  accounts: [
    {
      id: 1,
      name: "Checking",
      type: "depository",
      subtype: "checking",
      current_balance: 5000,
      is_linked: true,
    },
  ],
};

describe("ConnectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScope.value = "personal";
    mockApi.getPlaidItems.mockResolvedValue([TEST_CONNECTION]);
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "production",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    mockApi.triggerSync.mockResolvedValue({ status: "synced" });
    mockApi.unlinkPlaidItem.mockResolvedValue({
      status: "unlinked",
      institution_name: "Test Bank",
      accounts_unlinked: 1,
    });
  });

  it("renders the page title", async () => {
    renderWithProviders(<ConnectionsPage />);
    expect(screen.getByText("Connections")).toBeInTheDocument();
  });

  it("renders connection cards", async () => {
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
  });

  it("shows empty state when no connections", async () => {
    mockApi.getPlaidItems.mockResolvedValue([]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no institutions connected/i)).toBeInTheDocument();
    });
  });

  // --- Enhancement: Sync feedback ---

  it("shows success feedback after sync", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Sync"));

    await waitFor(() => {
      expect(screen.getByText(/synced/i)).toBeInTheDocument();
    });
  });

  it("shows error feedback when sync fails", async () => {
    mockApi.triggerSync.mockRejectedValue(new Error("Sync failed"));
    const user = userEvent.setup();
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Sync"));

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });
  });

  it("disables sync button and shows spinner while syncing", async () => {
    mockApi.triggerSync.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Sync"));

    const syncBtn = screen.getByText("Syncing...").closest("button")!;
    expect(syncBtn).toBeDisabled();
  });

  // --- Sandbox banner ---

  it("shows sandbox banner when plaid_env is sandbox", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "sandbox",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("sandbox-banner")).toBeInTheDocument();
    });
  });

  it("does not show sandbox banner when plaid_env is production", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "production",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("sandbox-banner")).not.toBeInTheDocument();
  });

  it("does not show sandbox banner when plaid is not configured", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: false,
      plaid_env: null,
      client_id_last4: null,
      secret_last4: null,
    });
    mockApi.getPlaidItems.mockResolvedValue([]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/plaid integration is not set up/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("sandbox-banner")).not.toBeInTheDocument();
  });

  // --- Connection status banners ---

  it("shows error banner with Reconnect button for error-status connection", async () => {
    const errorConnection: PlaidConnection = {
      ...TEST_CONNECTION,
      status: PLAID_ITEM_STATUS.ERROR,
      plaid_error_code: "ITEM_LOGIN_REQUIRED",
      plaid_error_message: "the login details have changed",
    };
    mockApi.getPlaidItems.mockResolvedValue([errorConnection]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
    expect(screen.getByText(/needs re-authentication/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("shows warning banner for pending_disconnect connection", async () => {
    const pendingConnection: PlaidConnection = {
      ...TEST_CONNECTION,
      status: PLAID_ITEM_STATUS.PENDING_DISCONNECT,
    };
    mockApi.getPlaidItems.mockResolvedValue([pendingConnection]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
    expect(screen.getByText(/will expire soon/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("shows revoked banner for revoked connection", async () => {
    const revokedConnection: PlaidConnection = {
      ...TEST_CONNECTION,
      status: PLAID_ITEM_STATUS.REVOKED,
    };
    mockApi.getPlaidItems.mockResolvedValue([revokedConnection]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
    expect(screen.getByText(/was revoked/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("shows new accounts banner with Review Accounts button", async () => {
    const newAccountsConnection: PlaidConnection = {
      ...TEST_CONNECTION,
      status: PLAID_ITEM_STATUS.NEW_ACCOUNTS,
    };
    mockApi.getPlaidItems.mockResolvedValue([newAccountsConnection]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
    expect(screen.getByText(/new accounts are available/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review accounts/i })).toBeInTheDocument();
  });

  it("does not show status banner for healthy connections", async () => {
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeInTheDocument();
    });
    expect(screen.queryByText(/needs re-authentication/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/will expire soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/was revoked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new accounts are available/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reconnect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review accounts/i })).not.toBeInTheDocument();
  });
});
