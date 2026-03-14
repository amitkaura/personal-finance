import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import TopMovers from "@/components/top-movers";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("TopMovers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeletons", () => {
    mockApi.getAccounts.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<TopMovers />);
    expect(screen.getByText("Investments")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(2);
  });

  it("shows empty message when no investment accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Checking", type: "depository", is_linked: true, current_balance: 5000 },
    ]);
    renderWithProviders(<TopMovers />);
    await waitFor(() => {
      expect(screen.getByText("No investment accounts.")).toBeInTheDocument();
    });
  });

  it("filters to all investment accounts regardless of linked status", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Checking", type: "depository", is_linked: true, current_balance: 5000 },
      { id: 2, name: "RRSP", type: "investment", is_linked: true, current_balance: 15000, official_name: "Registered Retirement" },
      { id: 3, name: "Manual Fund", type: "investment", is_linked: false, current_balance: 8000 },
    ]);
    renderWithProviders(<TopMovers />);
    await waitFor(() => {
      expect(screen.getByText("RRSP")).toBeInTheDocument();
      expect(screen.getByText("Manual Fund")).toBeInTheDocument();
      expect(screen.queryByText("Checking")).toBeNull();
    });
  });

  it("shows TrendingUp for positive balance and TrendingDown for negative", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Growing Fund", type: "investment", is_linked: true, current_balance: 5000, official_name: null },
      { id: 2, name: "Losing Fund", type: "investment", is_linked: true, current_balance: -200, official_name: null },
    ]);
    renderWithProviders(<TopMovers />);
    await waitFor(() => {
      expect(screen.getByText("Growing Fund")).toBeInTheDocument();
      expect(screen.getByText("Losing Fund")).toBeInTheDocument();
    });
    const items = document.querySelectorAll("li");
    expect(items[0].querySelector(".text-success")).toBeTruthy();
    expect(items[1].querySelector(".text-danger")).toBeTruthy();
  });

  it("uses official_name or 'Investment' as subtype", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Fund A", type: "investment", is_linked: true, current_balance: 1000, official_name: "Custom Name" },
      { id: 2, name: "Fund B", type: "investment", is_linked: true, current_balance: 2000, official_name: null },
    ]);
    renderWithProviders(<TopMovers />);
    await waitFor(() => {
      expect(screen.getByText("Custom Name")).toBeInTheDocument();
      expect(screen.getByText("Investment")).toBeInTheDocument();
    });
  });
});
