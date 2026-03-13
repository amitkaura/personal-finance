import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ReviewSnippet from "@/components/review-snippet";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("ReviewSnippet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getTransactions.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ReviewSnippet />);
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("shows empty message when nothing to review", async () => {
    mockApi.getTransactions.mockResolvedValue([]);
    renderWithProviders(<ReviewSnippet />);
    await waitFor(() => {
      expect(screen.getByText(/All caught up/)).toBeInTheDocument();
    });
  });

  it("renders transaction list", async () => {
    mockApi.getTransactions.mockResolvedValue([
      { id: 1, merchant_name: "Amazon", amount: -49.99, date: "2025-01-15" },
      { id: 2, merchant_name: null, amount: -15.00, date: "2025-01-14" },
    ]);
    renderWithProviders(<ReviewSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Amazon")).toBeInTheDocument();
      expect(screen.getByText("Unknown")).toBeInTheDocument();
    });
  });

  it("has View all link to /transactions", async () => {
    mockApi.getTransactions.mockResolvedValue([]);
    renderWithProviders(<ReviewSnippet />);
    await waitFor(() => {
      const link = screen.getByText("View all");
      expect(link.closest("a")).toHaveAttribute("href", "/transactions");
    });
  });
});
