import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import CashAccountsWidget from "@/components/cash-accounts-widget";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("CashAccountsWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getAccounts.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<CashAccountsWidget />);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(2);
  });

  it("shows empty message when no depository accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "RRSP", type: "investment", is_linked: true, current_balance: 15000 },
    ]);
    renderWithProviders(<CashAccountsWidget />);
    await waitFor(() => {
      expect(screen.getByText("No cash accounts.")).toBeInTheDocument();
    });
  });

  it("renders depository accounts with balances", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Checking", type: "depository", subtype: "checking", is_linked: true, current_balance: 5000 },
      { id: 2, name: "Savings", type: "depository", subtype: "savings", is_linked: true, current_balance: 12000 },
      { id: 3, name: "RRSP", type: "investment", is_linked: true, current_balance: 15000 },
    ]);
    renderWithProviders(<CashAccountsWidget />);
    await waitFor(() => {
      expect(screen.getByText("Checking")).toBeInTheDocument();
      expect(screen.getByText("Savings")).toBeInTheDocument();
      expect(screen.queryByText("RRSP")).toBeNull();
    });
  });

  it("shows total cash balance", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Checking", type: "depository", subtype: "checking", is_linked: true, current_balance: 5000 },
      { id: 2, name: "Savings", type: "depository", subtype: "savings", is_linked: true, current_balance: 12000 },
    ]);
    renderWithProviders(<CashAccountsWidget />);
    await waitFor(() => {
      expect(screen.getByText("$17,000.00")).toBeInTheDocument();
    });
  });

  it("shows subtype or 'Depository' as fallback", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Main Account", type: "depository", subtype: "checking", is_linked: true, current_balance: 1000 },
      { id: 2, name: "Other Account", type: "depository", subtype: null, is_linked: true, current_balance: 2000 },
    ]);
    renderWithProviders(<CashAccountsWidget />);
    await waitFor(() => {
      expect(screen.getByText("checking")).toBeInTheDocument();
      expect(screen.getByText("Depository")).toBeInTheDocument();
    });
  });
});
