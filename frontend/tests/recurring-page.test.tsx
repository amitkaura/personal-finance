import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecurringPage from "@/app/recurring/page";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getRecurring: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

const RECURRING_ITEM = {
  merchant_name: "Netflix", frequency: "monthly", average_amount: -15.99,
  transaction_count: 6, is_consistent_amount: true, category: "Subscriptions",
  next_expected: "2025-02-15", last_date: "2025-01-15",
};

const RECURRING_ITEM_2 = {
  merchant_name: "Gym", frequency: "bi-weekly", average_amount: -40.00,
  transaction_count: 12, is_consistent_amount: false, category: "Health",
  next_expected: null, last_date: "2025-01-20",
};

describe("RecurringPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getRecurring.mockResolvedValue([]);
  });

  it("renders title", () => {
    renderWithProviders(<RecurringPage />);
    expect(screen.getByText("Recurring & Bills")).toBeInTheDocument();
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.getRecurring.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RecurringPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows empty state when no recurring items", async () => {
    renderWithProviders(<RecurringPage />);
    await waitFor(() => {
      expect(screen.getByText("No recurring transactions")).toBeInTheDocument();
    });
  });

  it("renders recurring cards when data exists", async () => {
    mockApi.getRecurring.mockResolvedValue([RECURRING_ITEM, RECURRING_ITEM_2]);
    renderWithProviders(<RecurringPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Netflix").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Gym").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows summary cards with data", async () => {
    mockApi.getRecurring.mockResolvedValue([RECURRING_ITEM]);
    renderWithProviders(<RecurringPage />);
    await waitFor(() => {
      expect(screen.getByText("Total monthly")).toBeInTheDocument();
    });
  });

  it("shows consistent/varies badge", async () => {
    mockApi.getRecurring.mockResolvedValue([RECURRING_ITEM, RECURRING_ITEM_2]);
    renderWithProviders(<RecurringPage />);
    await waitFor(() => {
      expect(screen.getByText("Consistent")).toBeInTheDocument();
      expect(screen.getByText("Varies")).toBeInTheDocument();
    });
  });

  it("has sort dropdown", async () => {
    mockApi.getRecurring.mockResolvedValue([RECURRING_ITEM]);
    renderWithProviders(<RecurringPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Sort by amount")).toBeInTheDocument();
    });
  });
});
