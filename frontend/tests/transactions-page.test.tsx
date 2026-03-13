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
  autoCategorize: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

const mockScope = vi.hoisted(() => ({ value: "personal" as ViewScope }));

vi.mock("@/lib/hooks", () => ({
  useFormatCurrencyPrecise: () => (n: number) =>
    `$${Math.abs(n).toFixed(2)}`,
  useScope: () => mockScope.value,
}));

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScope.value = "personal";
    mockApi.getTransactions.mockResolvedValue(TEST_TRANSACTIONS);
    mockApi.getCategories.mockResolvedValue(TEST_CATEGORIES);
    mockApi.autoCategorize.mockResolvedValue({
      total: 5,
      categorized: 3,
      skipped: 2,
    });
    mockApi.updateTransaction.mockResolvedValue({});
    mockApi.deleteTransaction.mockResolvedValue(undefined);
    mockApi.createTransaction.mockResolvedValue({});
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
});
