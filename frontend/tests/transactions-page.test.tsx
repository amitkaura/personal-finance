import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "@/app/transactions/page";
import {
  renderWithProviders,
  TEST_TRANSACTIONS,
  TEST_CATEGORIES,
} from "./helpers";
import type { ViewScope } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getCategories: vi.fn(),
  getAccounts: vi.fn(),
  autoCategorize: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  createTransaction: vi.fn(),
  getRules: vi.fn(),
  createRule: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

const mockScope = vi.hoisted(() => ({ value: "personal" as ViewScope }));
const mockSearchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/transactions",
  useSearchParams: () => mockSearchParams.value,
}));

vi.mock("@/lib/hooks", () => ({
  useFormatCurrencyPrecise: () => (n: number) =>
    `$${Math.abs(n).toFixed(2)}`,
  useScope: () => mockScope.value,
}));

vi.mock("@/components/categorization-progress-provider", () => ({
  useCategorizationProgress: () => ({
    startAutoCategorize: vi.fn(),
    state: "idle",
  }),
}));

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScope.value = "personal";
    mockApi.getTransactions.mockResolvedValue(TEST_TRANSACTIONS);
    mockApi.getCategories.mockResolvedValue(TEST_CATEGORIES);
    mockApi.getAccounts.mockResolvedValue([]);
    mockApi.autoCategorize.mockResolvedValue({
      total: 5,
      categorized: 3,
      skipped: 2,
    });
    mockApi.updateTransaction.mockResolvedValue({});
    mockApi.deleteTransaction.mockResolvedValue(undefined);
    mockApi.createTransaction.mockResolvedValue({});
    mockApi.getRules.mockResolvedValue([]);
    mockApi.createRule.mockResolvedValue({ id: 1, keyword: "Employer", category: "Income", case_sensitive: false });
  });

  // --- Enhancement 1: "Uncategorized" tab label ---

  it('shows "Uncategorized" tab instead of "Needs Review"', async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.queryByText("Needs Review")).not.toBeInTheDocument();
  });

  // --- Enhancement 2: Filter popover ---

  it("renders a Filters button with SlidersHorizontal icon", async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
  });

  it("opens filter popover when Filters button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /filters/i }));

    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("shows active filter count badge on Filters button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /filters/i }));

    const typeSelect = screen.getByDisplayValue("All Types");
    await user.selectOptions(typeSelect, "income");

    const badge = screen.getByTestId("filter-badge");
    expect(badge).toHaveTextContent("1");
  });

  it("closes filter popover on click-outside", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /filters/i }));
    expect(screen.getByLabelText("From date")).toBeInTheDocument();

    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();
    });
  });

  // --- Enhancement 3: Delete confirmation dialog ---

  it("shows a confirmation dialog before deleting a manual transaction", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTitle("Delete manual transaction");
    await user.click(deleteBtn);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Delete transaction?")).toBeInTheDocument();
  });

  it("does not delete when cancel is clicked in the confirm dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete manual transaction"));
    await user.click(screen.getByText("Cancel"));

    expect(mockApi.deleteTransaction).not.toHaveBeenCalled();
  });

  it("deletes when confirmed in the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete manual transaction"));
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(mockApi.deleteTransaction).toHaveBeenCalledWith(3);
    });
  });

  // --- Enhancement 4: Click-outside closes categorize dropdown ---

  it("closes the categorize dropdown when clicking outside", async () => {
    mockApi.getTransactions.mockResolvedValue([TEST_TRANSACTIONS[1]]);
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Categorize"));

    const dropdown = document.querySelector("[class*='absolute'][class*='z-20']");
    expect(dropdown).not.toBeNull();

    await user.click(document.body);
    await waitFor(() => {
      const closedDropdown = document.querySelector("[class*='absolute'][class*='z-20'][class*='max-h']");
      expect(closedDropdown).toBeNull();
    });
  });

  // --- Enhancement 5: Auto-categorize tooltip ---

  it("auto-categorize button has a descriptive tooltip", async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /auto-categorize/i });
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toMatch(/rules|ai|categoriz/i);
  });

  // --- Account filter from URL param ---

  it("pre-selects account filter when ?account query param is present", async () => {
    const testAccount = { id: 1, name: "Checking", type: "depository" };
    mockApi.getAccounts.mockResolvedValue([testAccount]);
    mockSearchParams.value = new URLSearchParams("account=1");

    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /filters/i }));

    await waitFor(() => {
      const select = screen.getByDisplayValue("Checking");
      expect(select).toBeInTheDocument();
    });

    mockSearchParams.value = new URLSearchParams();
  });

  // --- Category and date filter from URL params ---

  it("pre-selects category and date filters when query params are present", async () => {
    mockSearchParams.value = new URLSearchParams(
      "category=Food+%26+Dining&from=2025-03-01&to=2025-03-31"
    );

    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /filters/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Food & Dining")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("From date")).toHaveValue("2025-03-01");
    expect(screen.getByLabelText("To date")).toHaveValue("2025-03-31");

    mockSearchParams.value = new URLSearchParams();
  });

  // --- Basic functionality ---

  it("renders the page title", async () => {
    renderWithProviders(<TransactionsPage />);
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });

  it("renders transactions list", async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });
    expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
  });

  it("shows loading skeleton initially", async () => {
    mockApi.getTransactions.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<TransactionsPage />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // --- Rule suggestion on categorize ---

  it("shows rule suggestion after categorizing a transaction", async () => {
    const user = userEvent.setup();
    mockApi.updateTransaction.mockResolvedValue({
      ...TEST_TRANSACTIONS[1],
      category: "Transportation",
    });
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    });

    const categorizeButtons = screen.getAllByText("Categorize");
    await user.click(categorizeButtons[0]);
    await user.click(screen.getByText("Transportation"));

    await waitFor(() => {
      expect(screen.getByText(/always categorize/i)).toBeInTheDocument();
    });
  });

  it("calls createRule when Create Rule is clicked", async () => {
    const user = userEvent.setup();
    mockApi.updateTransaction.mockResolvedValue({
      ...TEST_TRANSACTIONS[1],
      category: "Transportation",
    });
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    });

    const categorizeButtons = screen.getAllByText("Categorize");
    await user.click(categorizeButtons[0]);
    await user.click(screen.getByText("Transportation"));

    await waitFor(() => {
      expect(screen.getByText(/always categorize/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /create rule/i }));

    await waitFor(() => {
      expect(mockApi.createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "Transportation",
          keyword: expect.any(String),
        }),
      );
    });
  });

  it("dismiss button hides the rule suggestion", async () => {
    const user = userEvent.setup();
    mockApi.updateTransaction.mockResolvedValue({
      ...TEST_TRANSACTIONS[1],
      category: "Transportation",
    });
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    });

    const categorizeButtons = screen.getAllByText("Categorize");
    await user.click(categorizeButtons[0]);
    await user.click(screen.getByText("Transportation"));

    await waitFor(() => {
      expect(screen.getByText(/always categorize/i)).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Dismiss rule suggestion"));

    await waitFor(() => {
      expect(screen.queryByText(/always categorize/i)).not.toBeInTheDocument();
    });
  });

  // --- Inline transaction editing ---

  it("renders an edit button on every transaction row", async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    expect(editButtons.length).toBe(TEST_TRANSACTIONS.length);
  });

  it("shows inline edit form with pre-filled values when edit button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    await user.click(editButtons[0]);

    expect(screen.getByDisplayValue("Coffee Shop")).toBeInTheDocument();
    expect(screen.getByDisplayValue("42.50")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2025-03-01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("pre-fills notes field for transactions that have notes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    await user.click(editButtons[2]);

    expect(screen.getByDisplayValue("Weekly groceries")).toBeInTheDocument();
  });

  it("calls updateTransaction with changed fields on Save", async () => {
    const user = userEvent.setup();
    mockApi.updateTransaction.mockResolvedValue({
      ...TEST_TRANSACTIONS[0],
      merchant_name: "Updated Coffee",
    });
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    await user.click(editButtons[0]);

    const merchantInput = screen.getByDisplayValue("Coffee Shop");
    await user.clear(merchantInput);
    await user.type(merchantInput, "Updated Coffee");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockApi.updateTransaction).toHaveBeenCalledWith(1, expect.objectContaining({
        merchant_name: "Updated Coffee",
      }));
    });
  });

  it("closes the edit form on Cancel without saving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    await user.click(editButtons[0]);
    expect(screen.getByDisplayValue("Coffee Shop")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Coffee Shop")).not.toBeInTheDocument();
    });
    expect(mockApi.updateTransaction).not.toHaveBeenCalled();
  });

  it("only allows one edit form open at a time", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    await user.click(editButtons[0]);
    expect(screen.getByDisplayValue("Coffee Shop")).toBeInTheDocument();

    await user.click(editButtons[2]);
    expect(screen.queryByDisplayValue("Coffee Shop")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Grocery Store")).toBeInTheDocument();
  });

  it("triggers rule suggestion when category is changed from null via edit form", async () => {
    const user = userEvent.setup();
    mockApi.updateTransaction.mockResolvedValue({
      ...TEST_TRANSACTIONS[1],
      category: "Transportation",
    });
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle("Edit transaction");
    await user.click(editButtons[1]);

    const catLabel = screen.getByText("Category");
    const catSelect = catLabel.parentElement!.querySelector("select")!;
    await user.selectOptions(catSelect, "Transportation");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockApi.updateTransaction).toHaveBeenCalledWith(2, expect.objectContaining({
        category: "Transportation",
      }));
    });

    await waitFor(() => {
      expect(screen.getByText(/always categorize/i)).toBeInTheDocument();
    });
  });

  it("does not show rule suggestion when matching rule already exists", async () => {
    mockApi.getRules.mockResolvedValue([
      { id: 1, keyword: "Employer", category: "Transportation", case_sensitive: false },
    ]);
    mockApi.updateTransaction.mockResolvedValue({
      ...TEST_TRANSACTIONS[1],
      category: "Transportation",
    });
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Employer Inc")).toBeInTheDocument();
    });

    const categorizeButtons = screen.getAllByText("Categorize");
    await user.click(categorizeButtons[0]);
    await user.click(screen.getByText("Transportation"));

    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText(/always categorize/i)).not.toBeInTheDocument();
  });
});
