import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BudgetsPage from "@/app/budgets/page";
import { renderWithProviders } from "./helpers";
import type { ViewScope, BudgetSummary } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getBudgetSummary: vi.fn(),
  getBudgets: vi.fn(),
  getCategories: vi.fn(),
  getBudgetConflicts: vi.fn(),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  copyBudgets: vi.fn(),
  getSpendingPreferences: vi.fn(),
  setSpendingPreference: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

const mockScope = vi.hoisted(() => ({ value: "personal" as ViewScope }));

vi.mock("@/lib/hooks", () => ({
  useFormatCurrency: () => (n: number) => `$${Math.abs(n).toFixed(0)}`,
  useScope: () => mockScope.value,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null,
    partner: null,
    scope: "personal",
    setScope: vi.fn(),
    pendingInvitations: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

const mockRouterPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/budgets",
  useSearchParams: () => new URLSearchParams(),
}));

const TEST_SUMMARY: BudgetSummary = {
  month: "2025-03",
  items: [
    {
      id: 1,
      category: "Food & Dining",
      budgeted: 500,
      rollover: 0,
      effective_budget: 500,
      spent: 350,
      remaining: 150,
      percent_used: 70,
    },
    {
      id: 2,
      category: "Transportation",
      budgeted: 200,
      rollover: 0,
      effective_budget: 200,
      spent: 180,
      remaining: 20,
      percent_used: 90,
    },
  ],
  total_budgeted: 700,
  total_spent: 530,
  total_remaining: 170,
};

const TEST_BUDGETS = [
  { id: 1, category: "Food & Dining", amount: 500, month: "2025-03", rollover: true, household_id: null },
  { id: 2, category: "Transportation", amount: 200, month: "2025-03", rollover: false, household_id: null },
];

describe("BudgetsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScope.value = "personal";
    mockApi.getBudgetSummary.mockResolvedValue(TEST_SUMMARY);
    mockApi.getBudgets.mockResolvedValue(TEST_BUDGETS);
    mockApi.getCategories.mockResolvedValue(["Food & Dining", "Transportation", "Entertainment"]);
    mockApi.getBudgetConflicts.mockResolvedValue([]);
    mockApi.updateBudget.mockResolvedValue({});
  });

  // --- Enhancement 1: Rollover tooltip ---

  it("rollover checkbox has a descriptive tooltip", async () => {
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    });

    const rolloverLabels = screen.getAllByText("Rollover");
    const firstLabel = rolloverLabels[0].closest("label")!;
    expect(firstLabel).toHaveAttribute("title");
    expect(firstLabel.getAttribute("title")).toMatch(/carry.*unspent.*budget.*forward/i);
  });

  // --- Enhancement 2: Inline amount editing ---

  it("clicking a budget amount opens an inline edit input", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    });

    const amountText = screen.getByText("$500");
    await user.click(amountText);

    const input = screen.getByDisplayValue("500");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("pressing Enter on inline edit calls updateBudget", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$500"));
    const input = screen.getByDisplayValue("500");
    await user.clear(input);
    await user.type(input, "600");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mockApi.updateBudget).toHaveBeenCalledWith(1, { amount: 600 });
    });
  });

  it("pressing Escape on inline edit reverts without saving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$500"));
    const input = screen.getByDisplayValue("500");
    await user.clear(input);
    await user.type(input, "999");
    await user.keyboard("{Escape}");

    expect(mockApi.updateBudget).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("999")).not.toBeInTheDocument();
  });

  // --- Enhancement 3: Progress bar ARIA ---

  it("progress bars have ARIA progressbar attributes", async () => {
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    });

    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars.length).toBeGreaterThanOrEqual(2);

    const first = progressBars[0];
    expect(first).toHaveAttribute("aria-valuenow");
    expect(first).toHaveAttribute("aria-valuemin", "0");
    expect(first).toHaveAttribute("aria-valuemax");
  });

  // --- Budget row click to filtered transactions ---

  it("navigates to transactions page filtered by category and month when clicking a budget row", async () => {
    mockRouterPush.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />);

    await waitFor(() => {
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Food & Dining"));

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining("/transactions?")
    );
    const url = mockRouterPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("category")).toBe("Food & Dining");
    expect(params.get("from")).toMatch(/^\d{4}-\d{2}-01$/);
    expect(params.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // --- Basic functionality ---

  it("renders the page title", async () => {
    renderWithProviders(<BudgetsPage />);
    expect(screen.getByText("Budgets")).toBeInTheDocument();
  });

  it("shows loading skeleton initially", async () => {
    mockApi.getBudgetSummary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<BudgetsPage />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows budget totals", async () => {
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByText("$700")).toBeInTheDocument();
    });
    expect(screen.getByText("$530")).toBeInTheDocument();
    expect(screen.getByText("$170")).toBeInTheDocument();
  });

  it("shows explicit validation when add budget amount is zero", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BudgetsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Category")).toBeInTheDocument();
    });

    const amountInput = screen.getByLabelText("Amount");
    await user.type(amountInput, "0");

    expect(amountInput).toHaveAttribute("aria-invalid", "true");
    const errorEl = screen.getByText("Amount must be greater than 0.");
    expect(errorEl.className).toContain("opacity-100");
  });
});
