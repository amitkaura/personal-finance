import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, TEST_USER, TEST_SETTINGS, TEST_SYNC_CONFIG } from "./helpers";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings",
}));

const mockApi = vi.hoisted(() => ({
  getMe: vi.fn(),
  getPlaidConfig: vi.fn(),
  getPlaidMode: vi.fn(),
  getAdminPlaidConfig: vi.fn(),
  updateAdminPlaidConfig: vi.fn(),
  deleteAdminPlaidConfig: vi.fn(),
  getSettings: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  getHousehold: vi.fn(),
  getPendingInvitations: vi.fn(),
  updatePlaidConfig: vi.fn(),
  deletePlaidConfig: vi.fn(),
  getLLMConfig: vi.fn(),
  updateLLMConfig: vi.fn(),
  deleteLLMConfig: vi.fn(),
  getSyncConfig: vi.fn(),
  updateSyncConfig: vi.fn(),
  deleteSyncConfig: vi.fn(),
  exportTransactions: vi.fn(),
  factoryReset: vi.fn(),
  deleteUserAccount: vi.fn(),
  getRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  getCategories: vi.fn(),
  updateSettings: vi.fn(),
  logout: vi.fn(),
  invitePartner: vi.fn(),
  cancelInvitation: vi.fn(),
  updateHouseholdName: vi.fn(),
  leaveHousehold: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: TEST_USER, loading: false }),
}));

const mockHousehold = vi.hoisted(() => ({
  household: {
    id: 1,
    name: "Test",
    members: [{ id: 1, user_id: 1, name: "Alice Smith", email: "alice@example.com", picture: null, role: "owner" }],
    pending_invitations: [],
  },
  loading: false,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockHousehold,
}));

vi.mock("@/components/bulk-csv-import-dialog", () => ({
  default: () => null,
}));

vi.mock("@/components/balance-import-dialog", () => ({
  default: () => null,
}));

vi.mock("@/components/confirm-dialog", () => ({
  default: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div data-testid="confirm-dialog">{title}</div> : null,
}));

import SettingsPage from "@/app/settings/page";

describe("AdminSection on Settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getProfile.mockResolvedValue(TEST_USER);
    mockApi.getPlaidConfig.mockResolvedValue({ configured: false, plaid_env: null, client_id_last4: null, secret_last4: null });
    mockApi.getPlaidMode.mockResolvedValue({ mode: "byok", managed_available: false });
    mockApi.getLLMConfig.mockResolvedValue({ configured: false, llm_base_url: null, llm_model: null, api_key_last4: null });
    mockApi.getSyncConfig.mockResolvedValue(TEST_SYNC_CONFIG);
    mockApi.getRules.mockResolvedValue([]);
    mockApi.getCategories.mockResolvedValue([]);
    mockApi.getHousehold.mockResolvedValue(null);
    mockApi.getPendingInvitations.mockResolvedValue([]);
  });

  it("shows Admin section when user is admin", async () => {
    mockApi.getMe.mockResolvedValue({ ...TEST_USER, is_admin: true });
    mockApi.getAdminPlaidConfig.mockResolvedValue({
      configured: false, enabled: false, plaid_env: null,
      client_id_last4: null, secret_last4: null, managed_household_count: 0,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Admin — Managed Plaid")).toBeInTheDocument();
    });
  });

  it("hides Admin section when user is not admin", async () => {
    mockApi.getMe.mockResolvedValue({ ...TEST_USER, is_admin: false });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Integrations")).toBeInTheDocument();
    });
    expect(screen.queryByText("Admin — Managed Plaid")).not.toBeInTheDocument();
  });

  it("shows managed household count", async () => {
    mockApi.getMe.mockResolvedValue({ ...TEST_USER, is_admin: true });
    mockApi.getAdminPlaidConfig.mockResolvedValue({
      configured: true, enabled: true, plaid_env: "production",
      client_id_last4: "1234", secret_last4: "5678", managed_household_count: 3,
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/3 households using managed/i)).toBeInTheDocument();
    });
  });
});
