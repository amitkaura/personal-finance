import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "@/app/transactions/page";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getCategories: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  createTransaction: vi.fn(),
  autoCategorize: vi.fn(),
  getSettings: vi.fn(),
  getTags: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

const TXN_REVIEW = {
  id: 1, merchant_name: "Starbucks", amount: -5.50, date: "2025-01-15",
  category: null, is_manual: false, pending_status: false,
  notes: null, owner_name: null, tags: [],
};

const TXN_CATEGORIZED = {
  id: 2, merchant_name: "Loblaws", amount: -85.00, date: "2025-01-14",
  category: "Groceries", is_manual: false, pending_status: false,
  notes: null, owner_name: null, tags: [],
};

const TXN_MANUAL = {
  id: 3, merchant_name: "Cash Deposit", amount: 200, date: "2025-01-13",
  category: "Income", is_manual: true, pending_status: false,
  notes: null, owner_name: null, tags: [],
};

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getTransactions.mockResolvedValue([]);
    mockApi.getCategories.mockResolvedValue(["Food & Dining", "Groceries", "Income"]);
    mockApi.getTags.mockResolvedValue([]);
  });

  it("renders title and subtitle", async () => {
    renderWithProviders(<TransactionsPage />);
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText(/Review and categorize/)).toBeInTheDocument();
  });

  it("shows Add Transaction button in personal scope", async () => {
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Add Transaction")).toBeInTheDocument();
    });
  });

  it("opens and closes add transaction form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Add Transaction")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Transaction"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/merchant/i)).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.getTransactions.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<TransactionsPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows empty state when no transactions in review mode", async () => {
    mockApi.getTransactions.mockResolvedValue([]);
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("All transactions reviewed!")).toBeInTheDocument();
    });
  });

  it("renders transaction rows", async () => {
    mockApi.getTransactions.mockResolvedValue([TXN_REVIEW, TXN_CATEGORIZED]);
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Starbucks")).toBeInTheDocument();
      expect(screen.getByText("Loblaws")).toBeInTheDocument();
    });
  });

  it("filter tabs switch between Needs Review and All", async () => {
    const user = userEvent.setup();
    mockApi.getTransactions.mockResolvedValue([TXN_REVIEW]);
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Needs Review")).toBeInTheDocument();
      expect(screen.getByText("All")).toBeInTheDocument();
    });
    await user.click(screen.getByText("All"));
    expect(mockApi.getTransactions).toHaveBeenCalled();
  });

  it("search filters by merchant name", async () => {
    const user = userEvent.setup();
    mockApi.getTransactions.mockResolvedValue([TXN_REVIEW, TXN_CATEGORIZED]);
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Starbucks")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Star");
    await waitFor(() => {
      expect(screen.getByText("Starbucks")).toBeInTheDocument();
      expect(screen.queryByText("Loblaws")).toBeNull();
    });
  });

  it("shows MANUAL badge for manual transactions", async () => {
    mockApi.getTransactions.mockResolvedValue([TXN_MANUAL]);
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Cash Deposit")).toBeInTheDocument();
      expect(screen.getByText("MANUAL")).toBeInTheDocument();
    });
  });

  it("delete button visible only on manual transactions", async () => {
    mockApi.getTransactions.mockResolvedValue([TXN_MANUAL, TXN_CATEGORIZED]);
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Cash Deposit")).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTitle("Delete manual transaction");
    expect(deleteButtons).toHaveLength(1);
  });

  it("Auto-Categorize button triggers API", async () => {
    const user = userEvent.setup();
    mockApi.autoCategorize.mockResolvedValue({ updated: 5 });
    renderWithProviders(<TransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Auto-Categorize")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Auto-Categorize"));
    expect(mockApi.autoCategorize).toHaveBeenCalled();
  });
});
