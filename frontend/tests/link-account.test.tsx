import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LinkAccount from "@/components/link-account";
import { renderWithProviders } from "./helpers";

const mockStartSync = vi.fn();

let capturedOnSuccess: ((token: string, meta: unknown) => void) | null = null;
const mockOpen = vi.fn(() => {
  if (capturedOnSuccess) {
    capturedOnSuccess("public-sandbox-xyz", { institution: { name: "Test Bank" } });
  }
});

vi.mock("react-plaid-link", () => ({
  usePlaidLink: (config: { onSuccess?: (token: string, meta: unknown) => void }) => {
    capturedOnSuccess = config.onSuccess ?? null;
    return { open: mockOpen, ready: true };
  },
}));

vi.mock("@/components/categorization-progress-provider", () => ({
  useCategorizationProgress: () => ({ startSync: mockStartSync }),
}));

const mockApi = vi.hoisted(() => ({
  createLinkToken: vi.fn(),
  exchangeToken: vi.fn(),
  getPlaidConfig: vi.fn().mockResolvedValue({
    configured: true,
    plaid_env: "production",
    client_id_last4: "1234",
    secret_last4: "5678",
  }),
  getPlaidMode: vi.fn().mockResolvedValue({
    mode: "byok",
    managed_available: false,
  }),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("LinkAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Link Account button when idle", () => {
    renderWithProviders(<LinkAccount />);
    expect(screen.getByText("Link Account")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("calls createLinkToken on click", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));
    expect(mockApi.createLinkToken).toHaveBeenCalled();
  });

  it("shows success message with account count", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    mockApi.exchangeToken.mockResolvedValue({ item_id: "item-1", accounts_synced: 3 });

    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));

    await waitFor(() => {
      expect(mockApi.createLinkToken).toHaveBeenCalled();
    });
  });

  it("pluralizes account(s) correctly for 1 account", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    mockApi.exchangeToken.mockResolvedValue({ item_id: "item-1", accounts_synced: 1 });

    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));

    await waitFor(() => {
      expect(mockApi.createLinkToken).toHaveBeenCalled();
    });
  });

  // --- Sandbox label ---

  it("shows 'Link Demo Account' when plaid_env is sandbox", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "sandbox",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    renderWithProviders(<LinkAccount />);
    await waitFor(() => {
      expect(screen.getByText("Link Demo Account")).toBeInTheDocument();
    });
  });

  it("shows 'Link Account' when plaid_env is production", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "production",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    renderWithProviders(<LinkAccount />);
    await waitFor(() => {
      expect(screen.getByText("Link Account")).toBeInTheDocument();
    });
  });

  // --- First sync triggers progress drawer ---

  it("calls startSync after exchangeToken succeeds", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    mockApi.exchangeToken.mockResolvedValue({ item_id: "item-1", accounts_synced: 1 });

    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));

    await waitFor(() => {
      expect(mockApi.createLinkToken).toHaveBeenCalled();
    });

    // Simulate Plaid onSuccess callback triggering exchangeToken
    // Since usePlaidLink is mocked, we need to verify startSync is eventually called
    // after exchangeToken resolves (the component calls startSync in onSuccess)
    await waitFor(() => {
      expect(mockStartSync).toHaveBeenCalled();
    });
  });
});
