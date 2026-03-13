import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import BudgetSnippet from "@/components/budget-snippet";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getBudgetSummary: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("BudgetSnippet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getBudgetSummary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<BudgetSnippet />);
    expect(screen.getByText("Budget Overview")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("shows empty state with Create one link", async () => {
    mockApi.getBudgetSummary.mockResolvedValue({
      items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0,
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      expect(screen.getByText(/No budgets set/)).toBeInTheDocument();
      const link = screen.getByText("Create one");
      expect(link.closest("a")).toHaveAttribute("href", "/budgets");
    });
  });

  it("shows personal BudgetMini when personal items exist", async () => {
    mockApi.getBudgetSummary.mockResolvedValue({
      items: [{ id: 1, category: "Food", percent_used: 60 }],
      total_budgeted: 500, total_spent: 300, total_remaining: 200,
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Personal")).toBeInTheDocument();
      expect(screen.getByText("Food")).toBeInTheDocument();
    });
  });

  it("sorts top 3 categories by percent_used descending", async () => {
    mockApi.getBudgetSummary.mockResolvedValue({
      items: [
        { id: 1, category: "Low", percent_used: 20 },
        { id: 2, category: "High", percent_used: 95 },
        { id: 3, category: "Mid", percent_used: 50 },
        { id: 4, category: "Hidden", percent_used: 10 },
      ],
      total_budgeted: 1000, total_spent: 400, total_remaining: 600,
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      expect(screen.getByText("High")).toBeInTheDocument();
      expect(screen.getByText("Mid")).toBeInTheDocument();
      expect(screen.getByText("Low")).toBeInTheDocument();
      expect(screen.queryByText("Hidden")).toBeNull();
    });
    const items = document.querySelectorAll("li");
    expect(items[0].textContent).toContain("High");
    expect(items[1].textContent).toContain("Mid");
    expect(items[2].textContent).toContain("Low");
  });

  it("has View all link to /budgets", async () => {
    mockApi.getBudgetSummary.mockResolvedValue({
      items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0,
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      const link = screen.getByText("View all");
      expect(link.closest("a")).toHaveAttribute("href", "/budgets");
    });
  });
});
