import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NetWorthHistory from "@/components/net-worth-history";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getNetWorthHistory: vi.fn(),
  takeNetWorthSnapshot: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("NetWorthHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
  });

  it("shows loading skeleton while fetching", () => {
    mockApi.getNetWorthHistory.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<NetWorthHistory />);
    expect(screen.getByText("Net Worth History")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows empty state with Snapshot button when no data", async () => {
    mockApi.getNetWorthHistory.mockResolvedValue([]);
    renderWithProviders(<NetWorthHistory />);
    await waitFor(() => {
      expect(screen.getByText(/No historical data/)).toBeInTheDocument();
      expect(screen.getByText("Snapshot")).toBeInTheDocument();
    });
  });

  it("Snapshot button calls takeNetWorthSnapshot", async () => {
    const user = userEvent.setup();
    mockApi.getNetWorthHistory.mockResolvedValue([]);
    mockApi.takeNetWorthSnapshot.mockResolvedValue({ ok: true });
    renderWithProviders(<NetWorthHistory />);

    await waitFor(() => {
      expect(screen.getByText("Snapshot")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Snapshot"));
    expect(mockApi.takeNetWorthSnapshot).toHaveBeenCalled();
  });

  it("renders SVG line chart with date range labels", async () => {
    mockApi.getNetWorthHistory.mockResolvedValue([
      { date: "2025-01", net_worth: 10000, assets: 15000, liabilities: 5000 },
      { date: "2025-02", net_worth: 12000, assets: 16000, liabilities: 4000 },
    ]);
    renderWithProviders(<NetWorthHistory />);
    await waitFor(() => {
      expect(screen.getByTestId("nw-chart")).toBeTruthy();
      expect(screen.getAllByText("2025-01").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("2025-02").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders SVG with polyline for multiple data points", async () => {
    mockApi.getNetWorthHistory.mockResolvedValue([
      { date: "2025-01", net_worth: 10000, assets: 15000, liabilities: 5000 },
      { date: "2025-02", net_worth: 12000, assets: 16000, liabilities: 4000 },
      { date: "2025-03", net_worth: 14000, assets: 18000, liabilities: 4000 },
    ]);
    renderWithProviders(<NetWorthHistory />);
    await waitFor(() => {
      const chart = screen.getByTestId("nw-chart");
      expect(chart.innerHTML).toContain("polyline");
    });
  });

  it("shows change indicator with correct sign", async () => {
    mockApi.getNetWorthHistory.mockResolvedValue([
      { date: "2025-01", net_worth: 10000, assets: 15000, liabilities: 5000 },
      { date: "2025-02", net_worth: 12000, assets: 16000, liabilities: 4000 },
    ]);
    renderWithProviders(<NetWorthHistory />);
    await waitFor(() => {
      expect(screen.getByText(/\+.*2,000/)).toBeInTheDocument();
      expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
    });
  });

  it("renders horizontal gridlines with labels", async () => {
    mockApi.getNetWorthHistory.mockResolvedValue([
      { date: "2025-01", net_worth: 10000, assets: 15000, liabilities: 5000 },
      { date: "2025-02", net_worth: 50000, assets: 55000, liabilities: 5000 },
    ]);
    renderWithProviders(<NetWorthHistory />);
    await waitFor(() => {
      const chart = screen.getByTestId("nw-chart");
      expect(chart.innerHTML).toContain("<line");
      expect(chart.innerHTML).toContain("<text");
    });
  });

  it("has period selector dropdown", async () => {
    mockApi.getNetWorthHistory.mockResolvedValue([
      { date: "2025-01", net_worth: 10000, assets: 10000, liabilities: 0 },
      { date: "2025-02", net_worth: 11000, assets: 11000, liabilities: 0 },
    ]);
    renderWithProviders(<NetWorthHistory />);
    await waitFor(() => {
      expect(screen.getByText("Snapshot")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("1 year")).toBeInTheDocument();
  });
});
