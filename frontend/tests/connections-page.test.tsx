import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConnectionsPage from "@/app/connections/page";
import { renderWithProviders } from "./helpers";
import type { ViewScope, PlaidConnection } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getPlaidItems: vi.fn(),
  getPlaidConfig: vi.fn(),
  triggerSync: vi.fn(),
  unlinkPlaidItem: vi.fn(),
  createLinkToken: vi.fn(),
  exchangeToken: vi.fn(),
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
});
