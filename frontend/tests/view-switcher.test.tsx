import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ViewSwitcher from "@/components/view-switcher";
import type { ViewScope } from "@/lib/types";
import { TEST_USER, TEST_HOUSEHOLD, PARTNER_MEMBER } from "./helpers";

const mockSetScope = vi.fn();

const mockState = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  household: {} as Record<string, unknown>,
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockState.household,
}));

describe("ViewSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.auth = {
      user: TEST_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };
    mockState.household = {
      household: TEST_HOUSEHOLD,
      partner: PARTNER_MEMBER,
      scope: "personal" as ViewScope,
      setScope: mockSetScope,
      pendingInvitations: [],
      isLoading: false,
      refetch: vi.fn(),
    };
  });

  it("renders nothing when no household", () => {
    mockState.household = {
      ...mockState.household,
      household: null,
      partner: null,
    };

    const { container } = render(<ViewSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("renders three scope buttons with correct labels", () => {
    render(<ViewSwitcher />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Smith-Jones")).toBeInTheDocument();
  });

  it("shows user picture for personal scope", () => {
    render(<ViewSwitcher />);

    const imgs = screen.getAllByRole("img");
    const aliceImg = imgs.find((img) => img.getAttribute("alt") === "Alice");
    expect(aliceImg).toBeTruthy();
    expect(aliceImg?.getAttribute("src")).toBe("https://example.com/alice.jpg");
  });

  it("shows partner picture for partner scope", () => {
    render(<ViewSwitcher />);

    const imgs = screen.getAllByRole("img");
    const bobImg = imgs.find((img) => img.getAttribute("alt") === "Bob");
    expect(bobImg).toBeTruthy();
    expect(bobImg?.getAttribute("src")).toBe("https://example.com/bob.jpg");
  });

  it("calls setScope when a button is clicked", async () => {
    const user = userEvent.setup();
    render(<ViewSwitcher />);

    await user.click(screen.getByText("Bob"));
    expect(mockSetScope).toHaveBeenCalledWith("partner");

    await user.click(screen.getByText("Smith-Jones"));
    expect(mockSetScope).toHaveBeenCalledWith("household");
  });

  it("highlights the active scope button", () => {
    mockState.household = { ...mockState.household, scope: "partner" };
    render(<ViewSwitcher />);

    const partnerBtn = screen.getByText("Bob").closest("button")!;
    expect(partnerBtn.className).toContain("bg-accent");
  });

  it("uses fallback label when user is null", () => {
    mockState.auth = { ...mockState.auth, user: null };
    render(<ViewSwitcher />);

    expect(screen.getByText("Mine")).toBeInTheDocument();
  });

  it("uses fallback label when partner is null", () => {
    mockState.household = { ...mockState.household, partner: null };
    render(<ViewSwitcher />);

    expect(screen.getByText("Yours")).toBeInTheDocument();
  });
});
