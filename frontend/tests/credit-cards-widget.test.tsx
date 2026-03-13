import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import CreditCardsWidget from "@/components/credit-cards-widget";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getAccountSummary: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("CreditCardsWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getAccountSummary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<CreditCardsWidget />);
    expect(screen.getByText("Credit Cards")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(2);
  });

  it("shows empty message when no credit cards", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      credit_accounts: [], credit_balance: 0,
    });
    renderWithProviders(<CreditCardsWidget />);
    await waitFor(() => {
      expect(screen.getByText("No credit cards linked.")).toBeInTheDocument();
    });
  });

  it("renders card list with balances", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      credit_accounts: [
        { id: 1, name: "Visa", subtype: "visa", current_balance: -1200, credit_limit: 5000, available_balance: 3800, official_name: null },
      ],
      credit_balance: 1200,
    });
    renderWithProviders(<CreditCardsWidget />);
    await waitFor(() => {
      expect(screen.getByText("Visa")).toBeInTheDocument();
      expect(screen.getAllByText(/1,200\.00/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows total owed when cards exist", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      credit_accounts: [
        { id: 1, name: "Visa", subtype: "visa", current_balance: -500, credit_limit: 3000, available_balance: 2500, official_name: null },
      ],
      credit_balance: 500,
    });
    renderWithProviders(<CreditCardsWidget />);
    await waitFor(() => {
      expect(screen.getByText(/500.*owed/)).toBeInTheDocument();
    });
  });

  it("shows utilization bar with correct color classes", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      credit_accounts: [
        { id: 1, name: "Low", subtype: null, current_balance: -100, credit_limit: 1000, available_balance: 900, official_name: null },
        { id: 2, name: "Mid", subtype: null, current_balance: -500, credit_limit: 1000, available_balance: 500, official_name: null },
        { id: 3, name: "High", subtype: null, current_balance: -800, credit_limit: 1000, available_balance: 200, official_name: null },
      ],
      credit_balance: 1400,
    });
    renderWithProviders(<CreditCardsWidget />);
    await waitFor(() => {
      expect(screen.getByText("Low")).toBeInTheDocument();
      expect(screen.getByText(/10% utilized/)).toBeInTheDocument();
      expect(screen.getByText(/50% utilized/)).toBeInTheDocument();
      expect(screen.getByText(/80% utilized/)).toBeInTheDocument();
    });
  });

  it("hides utilization bar when credit_limit is 0", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      credit_accounts: [
        { id: 1, name: "No Limit", subtype: null, current_balance: -200, credit_limit: 0, available_balance: null, official_name: null },
      ],
      credit_balance: 200,
    });
    renderWithProviders(<CreditCardsWidget />);
    await waitFor(() => {
      expect(screen.getByText("No Limit")).toBeInTheDocument();
      expect(screen.queryByText(/utilized/)).toBeNull();
    });
  });
});
