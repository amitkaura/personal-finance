import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import RecurringWidget from "@/components/recurring-widget";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getAllTransactions: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("RecurringWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getAllTransactions.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RecurringWidget />);
    expect(screen.getByText("Recurring")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("shows empty message when no recurring merchants", async () => {
    mockApi.getAllTransactions.mockResolvedValue([
      { id: 1, merchant_name: "Unique Store", amount: -20, date: "2025-01-01" },
    ]);
    renderWithProviders(<RecurringWidget />);
    await waitFor(() => {
      expect(screen.getByText("No recurring transactions detected yet.")).toBeInTheDocument();
    });
  });

  it("detects recurring transactions (2+ same merchant)", async () => {
    mockApi.getAllTransactions.mockResolvedValue([
      { id: 1, merchant_name: "Netflix", amount: -15.99, date: "2025-01-01" },
      { id: 2, merchant_name: "Netflix", amount: -15.99, date: "2025-02-01" },
      { id: 3, merchant_name: "Spotify", amount: -9.99, date: "2025-01-05" },
      { id: 4, merchant_name: "Spotify", amount: -9.99, date: "2025-02-05" },
    ]);
    renderWithProviders(<RecurringWidget />);
    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeInTheDocument();
      expect(screen.getByText("Spotify")).toBeInTheDocument();
    });
  });

  it("limits display to 6 items", async () => {
    const txns = [];
    for (let i = 0; i < 8; i++) {
      txns.push(
        { id: i * 2, merchant_name: `Merchant ${i}`, amount: -(i + 1) * 10, date: "2025-01-01" },
        { id: i * 2 + 1, merchant_name: `Merchant ${i}`, amount: -(i + 1) * 10, date: "2025-02-01" },
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(txns);
    renderWithProviders(<RecurringWidget />);
    await waitFor(() => {
      const items = document.querySelectorAll("li");
      expect(items.length).toBe(6);
    });
  });

  it("ignores transactions without merchant_name", async () => {
    mockApi.getAllTransactions.mockResolvedValue([
      { id: 1, merchant_name: null, amount: -50, date: "2025-01-01" },
      { id: 2, merchant_name: null, amount: -50, date: "2025-02-01" },
    ]);
    renderWithProviders(<RecurringWidget />);
    await waitFor(() => {
      expect(screen.getByText("No recurring transactions detected yet.")).toBeInTheDocument();
    });
  });

  it("sorts by absolute amount descending", async () => {
    mockApi.getAllTransactions.mockResolvedValue([
      { id: 1, merchant_name: "Small", amount: -5, date: "2025-01-01" },
      { id: 2, merchant_name: "Small", amount: -5, date: "2025-02-01" },
      { id: 3, merchant_name: "Big", amount: -100, date: "2025-01-01" },
      { id: 4, merchant_name: "Big", amount: -100, date: "2025-02-01" },
    ]);
    renderWithProviders(<RecurringWidget />);
    await waitFor(() => {
      const items = document.querySelectorAll("li");
      expect(items[0].textContent).toContain("Big");
      expect(items[1].textContent).toContain("Small");
    });
  });
});
