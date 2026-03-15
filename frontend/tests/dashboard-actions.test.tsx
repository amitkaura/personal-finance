import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardActions from "@/components/dashboard-actions";
import { renderWithProviders, TEST_HOUSEHOLD, PARTNER_MEMBER } from "./helpers";
import type { ViewScope } from "@/lib/types";

const mockRouterPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/components/link-account", () => ({
  __esModule: true,
  default: () => <button>Link Account</button>,
}));

const mockState = vi.hoisted(() => ({
  household: {} as Record<string, unknown>,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockState.household,
}));

vi.mock("@/lib/api", () => ({
  api: {
    invitePartner: vi.fn().mockResolvedValue({ id: 1, token: "t", invited_email: "x@x.com", status: "pending" }),
  },
}));

describe("DashboardActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.household = {
      household: null,
      partner: null,
      scope: "personal" as ViewScope,
      setScope: vi.fn(),
      pendingInvitations: [],
      isLoading: false,
      refetch: vi.fn(),
    };
  });

  it("uses a 2-column grid on mobile, flex on desktop", () => {
    const { container } = renderWithProviders(<DashboardActions />);
    const wrapper = container.querySelector(".grid.grid-cols-2");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain("sm:flex");
  });

  it("partner badge spans full grid row on mobile", () => {
    mockState.household = {
      ...mockState.household,
      household: TEST_HOUSEHOLD,
      partner: PARTNER_MEMBER,
    };
    renderWithProviders(<DashboardActions />);
    const badge = screen.getByText(/Sharing with Bob Jones/).closest("span");
    expect(badge!.className).toContain("col-span-full");
  });

  it("renders Add Account button", () => {
    renderWithProviders(<DashboardActions />);
    expect(screen.getByText("Add Account")).toBeInTheDocument();
  });

  it("renders Link Account button", () => {
    renderWithProviders(<DashboardActions />);
    expect(screen.getByText("Link Account")).toBeInTheDocument();
  });

  it("renders Add Partner button when no household exists", () => {
    renderWithProviders(<DashboardActions />);
    expect(screen.getByText("Add Partner")).toBeInTheDocument();
  });

  it("shows sharing message when partner exists", () => {
    mockState.household = {
      ...mockState.household,
      household: TEST_HOUSEHOLD,
      partner: PARTNER_MEMBER,
    };
    renderWithProviders(<DashboardActions />);
    expect(screen.getByText(/Sharing with Bob Jones/)).toBeInTheDocument();
    expect(screen.queryByText("Add Partner")).not.toBeInTheDocument();
  });

  it("navigates to /accounts?add=true when clicking Add Account", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardActions />);
    await user.click(screen.getByText("Add Account"));
    expect(mockRouterPush).toHaveBeenCalledWith("/accounts?add=true");
  });

  it("opens Add Partner dialog when clicking Add Partner", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardActions />);
    await user.click(screen.getByText("Add Partner"));
    expect(screen.getByPlaceholderText(/partner.*email/i)).toBeInTheDocument();
    expect(screen.getByText("Send Invite")).toBeInTheDocument();
  });
});
