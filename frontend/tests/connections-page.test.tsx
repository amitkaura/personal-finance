import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConnectionsPage from "@/app/connections/page";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getPlaidItems: vi.fn(),
  triggerSync: vi.fn(),
  unlinkPlaidItem: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

vi.mock("@/components/link-account", () => ({
  __esModule: true,
  default: () => <button>Link Account</button>,
}));

const CONNECTION = {
  id: 1, institution_name: "TD Bank", item_id: "item-123",
  accounts: [
    { id: 10, name: "Checking", type: "depository", subtype: "checking",
      current_balance: 5000, is_linked: true },
    { id: 11, name: "Credit Card", type: "credit", subtype: "visa",
      current_balance: -1200, is_linked: true },
  ],
};

describe("ConnectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getPlaidItems.mockResolvedValue([]);
  });

  it("renders title", () => {
    renderWithProviders(<ConnectionsPage />);
    expect(screen.getByText("Connections")).toBeInTheDocument();
  });

  it("shows empty state when no connections", async () => {
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No institutions connected/)).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.getPlaidItems.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ConnectionsPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders connection cards with accounts", async () => {
    mockApi.getPlaidItems.mockResolvedValue([CONNECTION]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("TD Bank")).toBeInTheDocument();
      expect(screen.getByText("Checking")).toBeInTheDocument();
      expect(screen.getByText("Credit Card")).toBeInTheDocument();
    });
  });

  it("shows Sync and Disconnect buttons", async () => {
    mockApi.getPlaidItems.mockResolvedValue([CONNECTION]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sync")).toBeInTheDocument();
      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });
  });

  it("Disconnect opens confirm dialog", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidItems.mockResolvedValue([CONNECTION]);
    renderWithProviders(<ConnectionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Disconnect"));
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText(/Disconnect TD Bank/)).toBeInTheDocument();
    });
  });

  it("shows Link Account button", async () => {
    renderWithProviders(<ConnectionsPage />);
    expect(screen.getByText("Link Account")).toBeInTheDocument();
  });
});
