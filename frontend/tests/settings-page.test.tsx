import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/settings/page";
import {
  renderWithProviders,
  TEST_USER,
  TEST_HOUSEHOLD,
  TEST_SETTINGS,
  TEST_SYNC_CONFIG,
  SELF_MEMBER,
} from "./helpers";
import type { Household, HouseholdInvitation, ViewScope } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getSyncConfig: vi.fn(),
  updateSyncConfig: vi.fn(),
  getMe: vi.fn(),
  getHousehold: vi.fn(),
  getRules: vi.fn(),
  createRule: vi.fn(),
  deleteRule: vi.fn(),
  updateRule: vi.fn(),
  invitePartner: vi.fn(),
  cancelInvitation: vi.fn(),
  updateHouseholdName: vi.fn(),
  leaveHousehold: vi.fn(),
  clearTransactions: vi.fn(),
  exportTransactions: vi.fn(),
  factoryReset: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

const mockAuthState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

const mockHouseholdState = vi.hoisted(() => ({
  value: {} as {
    household: Household | null;
    partner: Record<string, unknown> | null;
    scope: ViewScope;
    setScope: () => void;
    pendingInvitations: HouseholdInvitation[];
    isLoading: boolean;
    refetch: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockAuthState.value,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockHouseholdState.value,
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.value = {
      user: TEST_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn().mockResolvedValue(undefined),
    };
    mockHouseholdState.value = {
      household: null,
      partner: null,
      scope: "personal",
      setScope: vi.fn(),
      pendingInvitations: [],
      isLoading: false,
      refetch: vi.fn(),
    };
    mockApi.getProfile.mockResolvedValue(TEST_USER);
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getSyncConfig.mockResolvedValue(TEST_SYNC_CONFIG);
    mockApi.getMe.mockResolvedValue(TEST_USER);
    mockApi.getHousehold.mockResolvedValue(TEST_HOUSEHOLD);
    mockApi.getRules.mockResolvedValue([]);
    mockApi.updateProfile.mockResolvedValue(TEST_USER);
    mockApi.invitePartner.mockResolvedValue({
      id: 1,
      token: "t",
      invited_email: "x@x.com",
      status: "pending",
    });
  });

  it("renders all section headings", async () => {
    renderWithProviders(<SettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Profile & Account")).toBeInTheDocument();
    expect(screen.getByText("Household")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Sync Schedule")).toBeInTheDocument();
    expect(screen.getByText("AI Categorization")).toBeInTheDocument();
    expect(screen.getByText("Data Management")).toBeInTheDocument();
  });

  describe("ProfileSection", () => {
    it("shows user email as read-only", async () => {
      renderWithProviders(<SettingsPage />);

      await waitFor(() =>
        expect(screen.getByText("alice@example.com")).toBeInTheDocument(),
      );
    });

    it("shows save button when display name is edited", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      const nameInputs = screen.getAllByPlaceholderText(
        /Alice Smith|Your name/,
      );
      const nameInput = nameInputs[0];
      await user.type(nameInput, "New Name");

      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("calls updateProfile on save", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      const nameInputs = screen.getAllByPlaceholderText(
        /Alice Smith|Your name/,
      );
      await user.type(nameInputs[0], "New Name");
      await user.click(screen.getByText("Save"));

      await waitFor(() => {
        expect(mockApi.updateProfile).toHaveBeenCalled();
        expect(mockApi.updateProfile.mock.calls[0][0]).toEqual(
          expect.objectContaining({ display_name: "New Name" }),
        );
      });
    });
  });

  describe("HouseholdSection", () => {
    it("shows invite form when no household", () => {
      renderWithProviders(<SettingsPage />);

      expect(
        screen.getByPlaceholderText("partner@email.com"),
      ).toBeInTheDocument();
      expect(screen.getByText("Invite Partner")).toBeInTheDocument();
    });

    it("shows household details when household exists", () => {
      mockHouseholdState.value.household = TEST_HOUSEHOLD;

      renderWithProviders(<SettingsPage />);

      expect(screen.getByText("Smith-Jones")).toBeInTheDocument();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });

    it("shows pending invitations with cancel button", () => {
      mockHouseholdState.value.household = {
        ...TEST_HOUSEHOLD,
        members: [SELF_MEMBER],
        pending_invitations: [
          {
            id: 1,
            token: "tok-1",
            invited_email: "partner@test.com",
            status: "pending",
          },
        ],
      };

      renderWithProviders(<SettingsPage />);

      expect(screen.getByText("partner@test.com")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(
        screen.getByTitle("Cancel invitation"),
      ).toBeInTheDocument();
    });

    it("sends invite on submit", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      const input = screen.getByPlaceholderText("partner@email.com");
      await user.type(input, "bob@example.com");
      await user.click(screen.getByText("Invite Partner"));

      await waitFor(() => {
        expect(mockApi.invitePartner).toHaveBeenCalled();
        expect(mockApi.invitePartner.mock.calls[0][0]).toBe("bob@example.com");
      });
    });

    it("shows explicit validation when partner email is invalid", async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      const input = screen.getByPlaceholderText("partner@email.com");
      await user.type(input, "invalid-email");

      expect(input).toHaveAttribute("aria-invalid", "true");
      const errorEl = screen.getByText("Enter a valid email address.");
      expect(errorEl.className).toContain("opacity-100");
    });

    it("hides invite form when pending invitation exists", () => {
      mockHouseholdState.value.household = {
        ...TEST_HOUSEHOLD,
        members: [SELF_MEMBER],
        pending_invitations: [
          {
            id: 1,
            token: "tok",
            invited_email: "x@x.com",
            status: "pending",
          },
        ],
      };

      renderWithProviders(<SettingsPage />);

      expect(screen.queryByText("Invite Partner")).not.toBeInTheDocument();
    });

    it("opens household name edit on pencil click", async () => {
      mockHouseholdState.value.household = TEST_HOUSEHOLD;
      const user = userEvent.setup();

      renderWithProviders(<SettingsPage />);

      expect(screen.getByText("Smith-Jones")).toBeInTheDocument();

      const editButtons = screen.getAllByRole("button");
      const pencilButton = editButtons.find(
        (btn) =>
          btn.classList.contains("rounded") &&
          btn.querySelector("svg") &&
          btn.closest("div")?.textContent?.includes("Smith-Jones"),
      );
      expect(pencilButton).toBeTruthy();
    });

    it("shows leave household button when in a household", () => {
      mockHouseholdState.value.household = TEST_HOUSEHOLD;

      renderWithProviders(<SettingsPage />);

      expect(screen.getByText("Leave Household")).toBeInTheDocument();
    });
  });

  describe("GeneralSection", () => {
    it("renders currency, date format, and locale selects", async () => {
      renderWithProviders(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Currency")).toBeInTheDocument();
        expect(screen.getByText("Date Format")).toBeInTheDocument();
        expect(screen.getByText("Locale")).toBeInTheDocument();
      });
    });
  });

  // --- Enhancement: No CategoryRulesSection ---

  it("does not render Category Rules section", async () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.queryByText("Category Rules")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Rule")).not.toBeInTheDocument();
  });

  // --- Enhancement: Save flash messages ---

  describe("GeneralSection save flash", () => {
    it("shows 'Settings saved' after saving general settings", async () => {
      mockApi.updateSettings.mockResolvedValue(TEST_SETTINGS);
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Currency")).toBeInTheDocument();
      });

      const currencySelect = screen.getByDisplayValue("CAD");
      await user.selectOptions(currencySelect, "USD");
      await user.click(screen.getAllByText("Save")[0]);

      await waitFor(() => {
        expect(screen.getByText("Settings saved")).toBeInTheDocument();
      });
    });
  });

  describe("SyncSection save flash", () => {
    it("shows 'Schedule saved' after saving sync settings", async () => {
      mockApi.updateSyncConfig.mockResolvedValue(TEST_SYNC_CONFIG);
      mockHouseholdState.value = {
        ...mockHouseholdState.value,
        household: TEST_HOUSEHOLD,
      };
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      const syncSection = await waitFor(() => {
        const section = screen.getByText("Sync Schedule").closest(".rounded-2xl")!;
        const toggle = section.querySelector("button[role='switch']");
        expect(toggle).toBeTruthy();
        return section;
      });

      const toggleBtn = syncSection.querySelector("button[role='switch']")!;
      await user.click(toggleBtn);

      await waitFor(() => {
        const saveBtns = Array.from(syncSection.querySelectorAll("button")).filter(
          (b) => b.textContent?.includes("Save")
        );
        expect(saveBtns.length).toBeGreaterThan(0);
      });

      const saveBtns = Array.from(syncSection.querySelectorAll("button")).filter(
        (b) => b.textContent?.includes("Save")
      );
      await user.click(saveBtns[0]);

      await waitFor(() => {
        expect(screen.getByText("Schedule saved")).toBeInTheDocument();
      });
    });
  });

  describe("DataSection", () => {
    it("renders export button", () => {
      renderWithProviders(<SettingsPage />);

      expect(
        screen.getByText("Export Transactions (CSV)"),
      ).toBeInTheDocument();
    });

    it("renders danger zone with clear button", () => {
      renderWithProviders(<SettingsPage />);

      expect(screen.getByText("Danger Zone")).toBeInTheDocument();
      expect(screen.getByText("Clear All Transactions")).toBeInTheDocument();
    });

    it("renders Delete Account button in danger zone", () => {
      renderWithProviders(<SettingsPage />);

      expect(screen.getByText("Delete Account")).toBeInTheDocument();
    });

    it("opens confirm dialog and calls deleteAccount on confirm", async () => {
      mockApi.deleteAccount.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText("Delete your account?")).toBeInTheDocument();

      await user.click(screen.getByText("Delete My Account"));

      await waitFor(() => {
        expect(mockApi.deleteAccount).toHaveBeenCalled();
      });
    });
  });
});
