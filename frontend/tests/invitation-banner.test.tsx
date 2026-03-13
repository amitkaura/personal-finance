import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvitationBanner from "@/components/invitation-banner";
import { renderWithProviders, TEST_INVITATION } from "./helpers";
import type { HouseholdInvitation } from "@/lib/types";

const mockState = vi.hoisted(() => ({
  household: {
    pendingInvitations: [] as HouseholdInvitation[],
    refetch: vi.fn(),
  },
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockState.household,
}));

vi.mock("@/lib/api", () => ({
  api: {
    acceptInvitation: (...args: unknown[]) => mockState.acceptInvitation(...args),
    declineInvitation: (...args: unknown[]) => mockState.declineInvitation(...args),
  },
}));

describe("InvitationBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.household = {
      pendingInvitations: [TEST_INVITATION],
      refetch: vi.fn(),
    };
    mockState.acceptInvitation.mockResolvedValue({ status: "accepted", household_id: 1 });
    mockState.declineInvitation.mockResolvedValue({ status: "declined" });
  });

  it("renders nothing when no pending invitations", () => {
    mockState.household.pendingInvitations = [];
    const { container } = renderWithProviders(<InvitationBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows invitation with inviter name and household name", () => {
    renderWithProviders(<InvitationBanner />);

    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("The Smiths")).toBeInTheDocument();
  });

  it("shows inviter picture", () => {
    renderWithProviders(<InvitationBanner />);

    const img = screen.getByAltText("Bob Jones");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("https://example.com/bob.jpg");
  });

  it("renders accept and decline buttons", () => {
    renderWithProviders(<InvitationBanner />);

    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
  });

  it("calls acceptInvitation with token on accept", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitationBanner />);

    await user.click(screen.getByText("Accept"));

    await waitFor(() => {
      expect(mockState.acceptInvitation).toHaveBeenCalled();
      expect(mockState.acceptInvitation.mock.calls[0][0]).toBe("inv-token-123");
    });
  });

  it("calls declineInvitation with token on decline", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitationBanner />);

    await user.click(screen.getByText("Decline"));

    await waitFor(() => {
      expect(mockState.declineInvitation).toHaveBeenCalled();
      expect(mockState.declineInvitation.mock.calls[0][0]).toBe("inv-token-123");
    });
  });

  it("hides invitation after decline", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitationBanner />);

    await user.click(screen.getByText("Decline"));

    await waitFor(() =>
      expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument(),
    );
  });

  it("renders multiple invitations", () => {
    const secondInvite: HouseholdInvitation = {
      ...TEST_INVITATION,
      id: 11,
      token: "inv-token-456",
      invited_by_name: "Carol",
      household_name: "Carol's House",
      invited_by_picture: null,
    };
    mockState.household.pendingInvitations = [TEST_INVITATION, secondInvite];

    renderWithProviders(<InvitationBanner />);

    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("shows icon fallback when inviter has no picture", () => {
    mockState.household.pendingInvitations = [
      { ...TEST_INVITATION, invited_by_picture: null },
    ];
    renderWithProviders(<InvitationBanner />);

    expect(screen.queryByAltText("Bob Jones")).not.toBeInTheDocument();
  });
});
