import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, TEST_USER } from "./helpers";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));

const mockApi = vi.hoisted(() => ({
  getMe: vi.fn(),
  getAdminOverview: vi.fn(),
  getAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  getAdminPlaidHealth: vi.fn(),
  getAdminErrors: vi.fn(),
  getAdminActiveUsers: vi.fn(),
  getAdminFeatureAdoption: vi.fn(),
  getAdminTransactionVolume: vi.fn(),
  getAdminStorage: vi.fn(),
  getAdminUserDetail: vi.fn(),
  getAdminPlaidConfig: vi.fn(),
  updateAdminPlaidConfig: vi.fn(),
  deleteAdminPlaidConfig: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: { ...TEST_USER, is_admin: true }, loading: false }),
}));

vi.mock("@/components/confirm-dialog", () => ({
  default: ({ open, title, onConfirm }: { open: boolean; title: string; onConfirm: () => void }) =>
    open ? (
      <div data-testid="confirm-dialog">
        {title}
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

import AdminPage from "@/app/admin/page";

const MOCK_OVERVIEW = {
  total_users: 42, active_7d: 15, active_30d: 30, total_accounts: 88,
  linked_accounts: 60, manual_accounts: 28, total_transactions: 1500,
  total_households: 20, recent_errors: 3,
};

describe("Plaid Config on Admin panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getMe.mockResolvedValue({ ...TEST_USER, is_admin: true });
    mockApi.getAdminOverview.mockResolvedValue(MOCK_OVERVIEW);
    mockApi.getAdminUsers.mockResolvedValue({ items: [], total: 0 });
    mockApi.getAdminPlaidHealth.mockResolvedValue({ total_plaid_errors: 0, recent_errors: [] });
    mockApi.getAdminErrors.mockResolvedValue({ items: [], total: 0 });
    mockApi.getAdminActiveUsers.mockResolvedValue([]);
    mockApi.getAdminFeatureAdoption.mockResolvedValue([]);
    mockApi.getAdminTransactionVolume.mockResolvedValue([]);
    mockApi.getAdminStorage.mockResolvedValue([]);
  });

  it("shows Plaid Config tab in admin panel", async () => {
    mockApi.getAdminPlaidConfig.mockResolvedValue({
      configured: false, enabled: false, plaid_env: null,
      client_id_last4: null, secret_last4: null, managed_household_count: 0,
    });

    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /plaid config/i })).toBeInTheDocument();
    });
  });

  it("shows managed household count on plaid config tab", async () => {
    mockApi.getAdminPlaidConfig.mockResolvedValue({
      configured: true, enabled: true, plaid_env: "production",
      client_id_last4: "1234", secret_last4: "5678", managed_household_count: 3,
    });

    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /plaid config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /plaid config/i }));

    await waitFor(() => {
      expect(screen.getByText(/3 households using managed/i)).toBeInTheDocument();
    });
  });

  it("shows environment selector on plaid config tab", async () => {
    mockApi.getAdminPlaidConfig.mockResolvedValue({
      configured: false, enabled: false, plaid_env: null,
      client_id_last4: null, secret_last4: null, managed_household_count: 0,
    });

    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /plaid config/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: /plaid config/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/environment/i)).toBeInTheDocument();
    });
  });
});
