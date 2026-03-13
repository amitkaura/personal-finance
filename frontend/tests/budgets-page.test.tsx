import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BudgetsPage from "@/app/budgets/page";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getBudgetSummary: vi.fn(),
  getBudgets: vi.fn(),
  getCategories: vi.fn(),
  getBudgetConflicts: vi.fn(),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  copyBudgets: vi.fn(),
  setSpendingPreference: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

const EMPTY_SUMMARY = {
  month: "2025-01", items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0,
};

const SUMMARY_WITH_DATA = {
  month: "2025-01",
  items: [
    { id: 1, category: "Food & Dining", amount: 500, spent: 300, remaining: 200, percent_used: 60 },
    { id: 2, category: "Entertainment", amount: 200, spent: 180, remaining: 20, percent_used: 90 },
  ],
  total_budgeted: 700, total_spent: 480, total_remaining: 220,
};

describe("BudgetsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getBudgetSummary.mockResolvedValue(EMPTY_SUMMARY);
    mockApi.getBudgets.mockResolvedValue([]);
    mockApi.getCategories.mockResolvedValue(["Food & Dining", "Entertainment", "Groceries"]);
    mockApi.getBudgetConflicts.mockResolvedValue([]);
  });

  it("renders title and subtitle", () => {
    renderWithProviders(<BudgetsPage />);
    expect(screen.getByText("Budgets")).toBeInTheDocument();
    expect(screen.getByText(/Plan and track spending/)).toBeInTheDocument();
  });

  it("shows month navigation", () => {
    renderWithProviders(<BudgetsPage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows Copy from last month in personal scope", () => {
    renderWithProviders(<BudgetsPage />);
    expect(screen.getByText("Copy from last month")).toBeInTheDocument();
  });

  it("shows empty state when no budgets", async () => {
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No budgets for this month/)).toBeInTheDocument();
    });
  });

  it("renders budget rows with data", async () => {
    mockApi.getBudgetSummary.mockResolvedValue(SUMMARY_WITH_DATA);
    mockApi.getBudgets.mockResolvedValue([
      { id: 1, rollover: false },
      { id: 2, rollover: false },
    ]);
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
      expect(screen.getByText("Entertainment")).toBeInTheDocument();
    });
  });

  it("shows totals when data exists", async () => {
    mockApi.getBudgetSummary.mockResolvedValue(SUMMARY_WITH_DATA);
    mockApi.getBudgets.mockResolvedValue([]);
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Total Budgeted")).toBeInTheDocument();
      expect(screen.getByText("Total Spent")).toBeInTheDocument();
      expect(screen.getByText("Remaining")).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.getBudgetSummary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<BudgetsPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows Add Budget form heading", async () => {
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Add Budget").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("Copy from last month calls API", async () => {
    const user = userEvent.setup();
    mockApi.copyBudgets.mockResolvedValue({ copied: 3 });
    renderWithProviders(<BudgetsPage />);
    await user.click(screen.getByText("Copy from last month"));
    expect(mockApi.copyBudgets).toHaveBeenCalled();
  });

  it("month navigation buttons change displayed month", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />);
    const prevBtn = screen.getAllByRole("button")[0];
    await user.click(prevBtn);
    expect(mockApi.getBudgetSummary).toHaveBeenCalledTimes(2);
  });
});
