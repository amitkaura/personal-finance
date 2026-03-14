import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import BudgetSnippet from "@/components/budget-snippet";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getBudgetSummary: vi.fn(),
  getSettings: vi.fn(),
}));
const mockState = vi.hoisted(() => ({
  scope: "personal" as "personal" | "partner" | "household",
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: mockState.scope,
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("BudgetSnippet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockState.scope = "personal";
    mockApi.getBudgetSummary.mockImplementation(async (month?: string, scope?: "personal" | "partner" | "household") => {
      if (scope === "household") {
        return {
          items: [],
          total_budgeted: 0,
          total_spent: 0,
          total_remaining: 0,
          sections: {
            personal: { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 },
            partner: { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 },
            shared: { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 },
          },
        };
      }
      return { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 };
    });
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

  it("expands shared categories in personal scope", async () => {
    mockApi.getBudgetSummary.mockImplementation(async (month?: string, scope?: "personal" | "partner" | "household") => {
      if (scope === "household") {
        return {
          items: [],
          total_budgeted: 0,
          total_spent: 0,
          total_remaining: 0,
          shared_summary: {
            items: [
              {
                id: 11,
                category: "Shared Groceries",
                budgeted: 400,
                rollover: 0,
                effective_budget: 400,
                spent: 260,
                remaining: 140,
                percent_used: 65,
              },
            ],
            total_budgeted: 400,
            total_spent: 260,
            total_remaining: 140,
          },
        };
      }
      return {
        items: [{ id: 1, category: "Food", percent_used: 60 }],
        total_budgeted: 500,
        total_spent: 300,
        total_remaining: 200,
      };
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Shared Categories")).toBeInTheDocument();
      expect(screen.getByText("Shared Groceries")).toBeInTheDocument();
    });
  });

  it("expands shared categories in partner scope", async () => {
    mockState.scope = "partner";
    mockApi.getBudgetSummary.mockImplementation(async (month?: string, scope?: "personal" | "partner" | "household") => {
      if (scope === "household") {
        return {
          items: [],
          total_budgeted: 0,
          total_spent: 0,
          total_remaining: 0,
          shared_summary: {
            items: [
              {
                id: 31,
                category: "Shared Utilities",
                budgeted: 300,
                rollover: 0,
                effective_budget: 300,
                spent: 150,
                remaining: 150,
                percent_used: 50,
              },
            ],
            total_budgeted: 300,
            total_spent: 150,
            total_remaining: 150,
          },
        };
      }
      if (scope === "partner") {
        return {
          items: [{ id: 3, category: "Partner Food", percent_used: 40 }],
          total_budgeted: 250,
          total_spent: 100,
          total_remaining: 150,
        };
      }
      return { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 };
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Your Categories")).toBeInTheDocument();
      expect(screen.getByText("Partner Food")).toBeInTheDocument();
      expect(screen.getByText("Shared Categories")).toBeInTheDocument();
      expect(screen.getByText("Shared Utilities")).toBeInTheDocument();
    });
  });

  it("expands shared categories in household scope", async () => {
    mockState.scope = "household";
    mockApi.getBudgetSummary.mockImplementation(async (month?: string, scope?: "personal" | "partner" | "household") => {
      if (scope === "household") {
        return {
          items: [],
          total_budgeted: 0,
          total_spent: 0,
          total_remaining: 0,
          sections: {
            personal: { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 },
            partner: { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 },
            shared: {
              items: [
                {
                  id: 41,
                  category: "Shared Rent",
                  budgeted: 1200,
                  rollover: 0,
                  effective_budget: 1200,
                  spent: 1200,
                  remaining: 0,
                  percent_used: 100,
                },
              ],
              total_budgeted: 1200,
              total_spent: 1200,
              total_remaining: 0,
            },
          },
        };
      }
      return { items: [], total_budgeted: 0, total_spent: 0, total_remaining: 0 };
    });
    renderWithProviders(<BudgetSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Shared Categories")).toBeInTheDocument();
      expect(screen.getByText("Shared Rent")).toBeInTheDocument();
    });
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
