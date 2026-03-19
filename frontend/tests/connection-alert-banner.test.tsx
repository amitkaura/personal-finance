import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ConnectionAlertBanner from "@/components/connection-alert-banner";
import { renderWithProviders } from "./helpers";
import { PLAID_ITEM_STATUS } from "@/lib/types";
import type { PlaidConnection } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getPlaidItems: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

vi.mock("@/lib/hooks", () => ({
  useScope: () => "personal",
}));

const HEALTHY_CONNECTION: PlaidConnection = {
  id: 1,
  item_id: "item-1",
  institution_name: "Good Bank",
  status: PLAID_ITEM_STATUS.HEALTHY,
  plaid_error_code: null,
  plaid_error_message: null,
  accounts: [],
};

const ERROR_CONNECTION: PlaidConnection = {
  id: 2,
  item_id: "item-2",
  institution_name: "Broken Bank",
  status: PLAID_ITEM_STATUS.ERROR,
  plaid_error_code: "ITEM_LOGIN_REQUIRED",
  plaid_error_message: "login changed",
  accounts: [],
};

describe("ConnectionAlertBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows alert when unhealthy connections exist", async () => {
    mockApi.getPlaidItems.mockResolvedValue([HEALTHY_CONNECTION, ERROR_CONNECTION]);
    renderWithProviders(<ConnectionAlertBanner />);
    await waitFor(() => {
      expect(screen.getByText(/need(s)? attention/i)).toBeInTheDocument();
    });
  });

  it("does not render when all connections are healthy", async () => {
    mockApi.getPlaidItems.mockResolvedValue([HEALTHY_CONNECTION]);
    const { container } = renderWithProviders(<ConnectionAlertBanner />);
    await waitFor(() => {
      expect(mockApi.getPlaidItems).toHaveBeenCalled();
    });
    expect(screen.queryByText(/need(s)? attention/i)).not.toBeInTheDocument();
  });

  it("does not render when no connections exist", async () => {
    mockApi.getPlaidItems.mockResolvedValue([]);
    const { container } = renderWithProviders(<ConnectionAlertBanner />);
    await waitFor(() => {
      expect(mockApi.getPlaidItems).toHaveBeenCalled();
    });
    expect(screen.queryByText(/need(s)? attention/i)).not.toBeInTheDocument();
  });

  it("links to connections page", async () => {
    mockApi.getPlaidItems.mockResolvedValue([ERROR_CONNECTION]);
    renderWithProviders(<ConnectionAlertBanner />);
    await waitFor(() => {
      expect(screen.getByText(/need(s)? attention/i)).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /view connections/i });
    expect(link).toHaveAttribute("href", "/connections");
  });
});
