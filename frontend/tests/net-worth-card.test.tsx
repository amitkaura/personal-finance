import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import NetWorthCard from "@/components/net-worth-card";
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

describe("NetWorthCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeleton while fetching", () => {
    mockApi.getAccountSummary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<NetWorthCard />);
    expect(screen.getByText("Net Worth")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("displays net worth when data loads", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      net_worth: 25000, depository_balance: 15000, investment_balance: 12000,
      credit_balance: 1500, loan_balance: 500, account_count: 4,
    });
    renderWithProviders(<NetWorthCard />);
    await waitFor(() => {
      expect(screen.getByText(/25,000/)).toBeInTheDocument();
    });
  });

  it("shows asset breakdown", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      net_worth: 20000, depository_balance: 10000, investment_balance: 12000,
      credit_balance: 2000, loan_balance: 0, account_count: 3,
    });
    renderWithProviders(<NetWorthCard />);
    await waitFor(() => {
      expect(screen.getByText("Assets")).toBeInTheDocument();
      expect(screen.getByText("Cash")).toBeInTheDocument();
      expect(screen.getByText("Investments")).toBeInTheDocument();
    });
  });

  it("shows liability breakdown", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      net_worth: 5000, depository_balance: 10000, investment_balance: 0,
      credit_balance: 3000, loan_balance: 2000, account_count: 3,
    });
    renderWithProviders(<NetWorthCard />);
    await waitFor(() => {
      expect(screen.getByText("Liabilities")).toBeInTheDocument();
      expect(screen.getByText("Credit Cards")).toBeInTheDocument();
      expect(screen.getByText("Loans")).toBeInTheDocument();
    });
  });

  it("shows account count with correct pluralization", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      net_worth: 1000, depository_balance: 1000, investment_balance: 0,
      credit_balance: 0, loan_balance: 0, account_count: 1,
    });
    renderWithProviders(<NetWorthCard />);
    await waitFor(() => {
      expect(screen.getByText(/1 linked account$/)).toBeInTheDocument();
    });

    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getAccountSummary.mockResolvedValue({
      net_worth: 1000, depository_balance: 1000, investment_balance: 0,
      credit_balance: 0, loan_balance: 0, account_count: 3,
    });
    renderWithProviders(<NetWorthCard />);
    await waitFor(() => {
      expect(screen.getByText(/3 linked accounts/)).toBeInTheDocument();
    });
  });
});
