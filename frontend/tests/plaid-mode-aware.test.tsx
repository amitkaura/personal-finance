import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./helpers";
import { PLAID_MODES } from "@/lib/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

const mockApi = vi.hoisted(() => ({
  getPlaidConfig: vi.fn(),
  getPlaidMode: vi.fn(),
  createLinkToken: vi.fn(),
  exchangeToken: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

const mockHousehold = vi.hoisted(() => ({
  household: {
    id: 1,
    name: "Test",
    members: [{ id: 1, user_id: 1, name: "Alice", email: "alice@test.com", picture: null, role: "owner" }],
    pending_invitations: [],
  },
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockHousehold,
}));

const mockOpen = vi.fn();
vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: mockOpen, ready: true }),
}));

import PlaidSetupBanner from "@/components/plaid-setup-banner";
import LinkAccount from "@/components/link-account";

describe("PlaidSetupBanner (mode-aware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
  });

  it("hides banner when household uses managed mode", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: false, plaid_env: null, client_id_last4: null, secret_last4: null });
    mockApi.getPlaidMode.mockResolvedValue({ mode: PLAID_MODES.MANAGED, managed_available: true });

    const { container } = renderWithProviders(<PlaidSetupBanner />);

    await waitFor(() => {
      expect(mockApi.getPlaidMode).toHaveBeenCalled();
    });

    expect(container.innerHTML).toBe("");
  });

  it("shows banner when household uses BYOK and not configured", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: false, plaid_env: null, client_id_last4: null, secret_last4: null });
    mockApi.getPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });

    renderWithProviders(<PlaidSetupBanner />);

    await waitFor(() => {
      expect(screen.getByText(/connect your bank accounts/i)).toBeInTheDocument();
    });
  });
});

describe("LinkAccount (mode-aware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches link token directly for managed mode (skips config redirect)", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidConfig.mockResolvedValue({ configured: false, plaid_env: null, client_id_last4: null, secret_last4: null });
    mockApi.getPlaidMode.mockResolvedValue({ mode: PLAID_MODES.MANAGED, managed_available: true });
    mockApi.createLinkToken.mockResolvedValue({ link_token: "test-token" });

    renderWithProviders(<LinkAccount />);

    await waitFor(() => {
      expect(screen.getByText("Link Account")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Link Account"));

    await waitFor(() => {
      expect(mockApi.createLinkToken).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalledWith("/settings?section=integrations");
  });

  it("shows unavailable message when managed but disabled", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: false });
    mockApi.getPlaidMode.mockResolvedValue({ mode: PLAID_MODES.MANAGED, managed_available: false });

    renderWithProviders(<LinkAccount />);

    await waitFor(() => {
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    });
  });
});
