import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PLAID_MODES } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getPlaidConfig: vi.fn(),
  getPlaidMode: vi.fn(),
  setPlaidMode: vi.fn(),
  getHousehold: vi.fn(),
  getMe: vi.fn(),
  getLLMConfig: vi.fn(),
  getLLMMode: vi.fn(),
  setLLMMode: vi.fn(),
  getSettings: vi.fn(),
  getProfile: vi.fn(),
  getSyncConfig: vi.fn(),
  getRules: vi.fn(),
  getPendingInvitations: vi.fn(),
  getPlaidItems: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("@/components/confirm-dialog", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/bulk-csv-import-dialog", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/balance-import-dialog", () => ({
  __esModule: true,
  default: () => null,
}));

import SettingsPage from "@/app/settings/page";
import { renderWithProviders, TEST_USER, TEST_HOUSEHOLD, TEST_SETTINGS, TEST_SYNC_CONFIG } from "./helpers";

const HOUSEHOLD_WITH_OWNER = {
  ...TEST_HOUSEHOLD,
  members: [{ id: 1, user_id: 1, name: "Alice", email: "alice@example.com", picture: null, role: "owner" }],
  pending_invitations: [],
};

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: TEST_USER,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSession: vi.fn(),
  }),
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: HOUSEHOLD_WITH_OWNER,
    refetch: vi.fn(),
  }),
}));

describe("Settings – Plaid mode switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getMe.mockResolvedValue(TEST_USER);
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getProfile.mockResolvedValue(TEST_USER);
    mockApi.getSyncConfig.mockResolvedValue(TEST_SYNC_CONFIG);
    mockApi.getRules.mockResolvedValue([]);
    mockApi.getHousehold.mockResolvedValue(HOUSEHOLD_WITH_OWNER);
    mockApi.getPendingInvitations.mockResolvedValue([]);
    mockApi.getPlaidItems.mockResolvedValue([]);
    mockApi.getLLMConfig.mockResolvedValue({ configured: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });
  });

  it("shows switch-to-BYOK button when in managed mode", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: true, plaid_env: "sandbox" });
    mockApi.getPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.MANAGED, managed_available: true,
      managed_plaid_env: "sandbox", has_linked_accounts: false,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch to.*your own/i })).toBeInTheDocument();
    });
  });

  it("shows switch-to-managed button when in BYOK mode and managed is available", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: false });
    mockApi.getPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: true,
      managed_plaid_env: "sandbox", has_linked_accounts: false,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch to managed/i })).toBeInTheDocument();
    });
  });

  it("disables switch button when accounts are linked", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: true, plaid_env: "sandbox" });
    mockApi.getPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.MANAGED, managed_available: true,
      managed_plaid_env: "sandbox", has_linked_accounts: true,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch to.*your own/i })).toBeDisabled();
    });
  });

  it("shows unlink-first message when accounts are linked", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({ configured: true, plaid_env: "sandbox" });
    mockApi.getPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.MANAGED, managed_available: true,
      managed_plaid_env: "sandbox", has_linked_accounts: true,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/unlink all.*accounts/i)).toBeInTheDocument();
    });
  });

  it("calls setPlaidMode when switch button is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidConfig.mockResolvedValue({ configured: true, plaid_env: "sandbox" });
    mockApi.getPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.MANAGED, managed_available: true,
      managed_plaid_env: "sandbox", has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: true,
      managed_plaid_env: "sandbox", has_linked_accounts: false,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch to.*your own/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /switch to.*your own/i }));

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.BYOK);
    });
  });
});
