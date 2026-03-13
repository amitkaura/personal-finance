import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "@/components/sidebar";
import { TEST_USER, TEST_HOUSEHOLD, PARTNER_MEMBER } from "./helpers";
import type { ViewScope } from "@/lib/types";

const mockLogout = vi.fn();

const mockState = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  household: {} as Record<string, unknown>,
  pathname: "/",
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockState.household,
}));

vi.mock("@/components/view-switcher", () => ({
  __esModule: true,
  default: () => <div data-testid="view-switcher">ViewSwitcher</div>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockState.pathname,
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.pathname = "/";
    mockState.auth = {
      user: TEST_USER,
      isLoading: false,
      login: vi.fn(),
      logout: mockLogout,
      refreshUser: vi.fn(),
    };
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

  it("renders brand name", () => {
    render(<Sidebar />);
    expect(screen.getByText("fino")).toBeInTheDocument();
  });

  it("renders all navigation links", () => {
    render(<Sidebar />);

    const expectedLinks = [
      "Dashboard",
      "Accounts",
      "Transactions",
      "Budgets",
      "Goals",
      "Cash Flow",
      "Reports",
      "Recurring",
      "Connections",
      "Settings",
    ];

    expectedLinks.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("highlights the active nav link", () => {
    mockState.pathname = "/budgets";
    render(<Sidebar />);

    const budgetsLink = screen.getByText("Budgets").closest("a")!;
    expect(budgetsLink.className).toContain("bg-accent/15");
    expect(budgetsLink.className).toContain("text-accent");

    const dashboardLink = screen.getByText("Dashboard").closest("a")!;
    expect(dashboardLink.className).toContain("text-muted-foreground");
  });

  it("includes the ViewSwitcher component", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("view-switcher")).toBeInTheDocument();
  });

  it("shows user name and email", () => {
    render(<Sidebar />);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("shows user avatar", () => {
    render(<Sidebar />);

    const avatar = screen.getByAltText("Alice Smith");
    expect(avatar).toBeInTheDocument();
    expect(avatar.getAttribute("src")).toBe("https://example.com/alice.jpg");
  });

  it("shows initial fallback when no picture", () => {
    mockState.auth = { ...mockState.auth, user: { ...TEST_USER, picture: null } };
    render(<Sidebar />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("calls logout on sign out click", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByTitle("Sign out"));
    expect(mockLogout).toHaveBeenCalled();
  });

  it("does not show user section when not logged in", () => {
    mockState.auth = { ...mockState.auth, user: null };
    render(<Sidebar />);

    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Sign out")).not.toBeInTheDocument();
  });

  it("nav links have correct hrefs", () => {
    render(<Sidebar />);

    const dashboardLink = screen.getByText("Dashboard").closest("a")!;
    expect(dashboardLink.getAttribute("href")).toBe("/");

    const settingsLink = screen.getByText("Settings").closest("a")!;
    expect(settingsLink.getAttribute("href")).toBe("/settings");
  });
});
