import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import LoansWidget from "@/components/loans-widget";
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

describe("LoansWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getAccountSummary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<LoansWidget />);
    expect(screen.getByText("Loans")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(2);
  });

  it("shows empty message when no loans", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      loan_accounts: [], loan_balance: 0,
    });
    renderWithProviders(<LoansWidget />);
    await waitFor(() => {
      expect(screen.getByText("No loans.")).toBeInTheDocument();
    });
  });

  it("renders loan list with name and balance", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      loan_accounts: [
        { id: 1, name: "Car Loan", subtype: "auto", current_balance: -15000, official_name: null },
        { id: 2, name: "Student Loan", subtype: "student", current_balance: -25000, official_name: null },
      ],
      loan_balance: 40000,
    });
    renderWithProviders(<LoansWidget />);
    await waitFor(() => {
      expect(screen.getByText("Car Loan")).toBeInTheDocument();
      expect(screen.getByText("Student Loan")).toBeInTheDocument();
    });
  });

  it("shows total remaining when loans exist", async () => {
    mockApi.getAccountSummary.mockResolvedValue({
      loan_accounts: [
        { id: 1, name: "Mortgage", subtype: "mortgage", current_balance: -200000, official_name: null },
      ],
      loan_balance: 200000,
    });
    renderWithProviders(<LoansWidget />);
    await waitFor(() => {
      expect(screen.getByText(/200,000.*remaining/)).toBeInTheDocument();
    });
  });
});
