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
  getAdminLLMConfig: vi.fn(),
  updateAdminLLMConfig: vi.fn(),
  deleteAdminLLMConfig: vi.fn(),
  getAdminWebhookEvents: vi.fn(),
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
  total_users: 42,
  active_7d: 15,
  active_30d: 30,
  total_accounts: 88,
  linked_accounts: 60,
  manual_accounts: 28,
  total_transactions: 1500,
  total_households: 20,
  recent_errors: 3,
};

const MOCK_WEBHOOK_EVENTS = {
  total: 3,
  events: [
    {
      id: 1,
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "item_abc",
      error_code: null,
      error_message: null,
      processed: true,
      created_at: "2026-03-18T12:00:00",
    },
    {
      id: 2,
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: "item_def",
      error_code: "ITEM_LOGIN_REQUIRED",
      error_message: "Login required",
      processed: false,
      created_at: "2026-03-18T11:00:00",
    },
    {
      id: 3,
      webhook_type: "TRANSACTIONS",
      webhook_code: "DEFAULT_UPDATE",
      item_id: "item_abc",
      error_code: null,
      error_message: null,
      processed: true,
      created_at: "2026-03-18T10:00:00",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getAdminOverview.mockResolvedValue(MOCK_OVERVIEW);
  mockApi.getAdminWebhookEvents.mockResolvedValue(MOCK_WEBHOOK_EVENTS);
});

describe("Admin Webhooks Tab", () => {
  it("renders webhook events when Webhooks tab is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /webhooks/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /webhooks/i }));

    await waitFor(() => {
      expect(mockApi.getAdminWebhookEvents).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("SYNC_UPDATES_AVAILABLE")).toBeInTheDocument();
      expect(screen.getByText("DEFAULT_UPDATE")).toBeInTheDocument();
    });
  });

  it("shows empty state when no webhook events", async () => {
    mockApi.getAdminWebhookEvents.mockResolvedValue({ total: 0, events: [] });
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /webhooks/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /webhooks/i }));

    await waitFor(() => {
      expect(screen.getByText(/no webhook events/i)).toBeInTheDocument();
    });
  });

  it("displays error details for ITEM.ERROR events", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /webhooks/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /webhooks/i }));

    await waitFor(() => {
      expect(screen.getByText("ITEM_LOGIN_REQUIRED")).toBeInTheDocument();
    });
  });
});
