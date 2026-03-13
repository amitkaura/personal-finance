import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPage from "@/app/reports/page";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getSpendingByCategory: vi.fn(),
  getMonthlyTrends: vi.fn(),
  getTopMerchants: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

vi.mock("@nivo/bar", () => ({
  ResponsiveBar: () => <div data-testid="nivo-bar">Chart</div>,
}));

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getSpendingByCategory.mockResolvedValue({
      categories: [], total_income: 0, total_expenses: 0,
    });
    mockApi.getMonthlyTrends.mockResolvedValue([]);
    mockApi.getTopMerchants.mockResolvedValue([]);
  });

  it("renders title", () => {
    renderWithProviders(<ReportsPage />);
    expect(screen.getByText("Reports")).toBeInTheDocument();
  });

  it("shows period selector buttons", () => {
    renderWithProviders(<ReportsPage />);
    expect(screen.getByText("1 month")).toBeInTheDocument();
    expect(screen.getByText("3 months")).toBeInTheDocument();
    expect(screen.getByText("6 months")).toBeInTheDocument();
    expect(screen.getByText("12 months")).toBeInTheDocument();
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.getSpendingByCategory.mockReturnValue(new Promise(() => {}));
    mockApi.getMonthlyTrends.mockReturnValue(new Promise(() => {}));
    mockApi.getTopMerchants.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ReportsPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows summary cards with data", async () => {
    mockApi.getSpendingByCategory.mockResolvedValue({
      categories: [{ category: "Food", amount: 300, percent: 15.0 }],
      total_income: 5000, total_expenses: 2000,
    });
    renderWithProviders(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("Total Income")).toBeInTheDocument();
      expect(screen.getByText("Total Expenses")).toBeInTheDocument();
      expect(screen.getByText("Net")).toBeInTheDocument();
    });
  });

  it("shows empty message for spending categories", async () => {
    renderWithProviders(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("No spending data for this period.")).toBeInTheDocument();
    });
  });

  it("shows empty message for trends", async () => {
    renderWithProviders(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("No trend data for this period.")).toBeInTheDocument();
    });
  });

  it("shows empty message for merchants", async () => {
    renderWithProviders(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("No merchant data for this period.")).toBeInTheDocument();
    });
  });

  it("renders top merchants when data exists", async () => {
    mockApi.getSpendingByCategory.mockResolvedValue({
      categories: [], total_income: 0, total_expenses: 0,
    });
    mockApi.getTopMerchants.mockResolvedValue([
      { merchant: "Loblaws", category: "Groceries", total: 450, count: 8 },
    ]);
    renderWithProviders(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("Loblaws")).toBeInTheDocument();
      expect(screen.getByText("Groceries")).toBeInTheDocument();
    });
  });
});
