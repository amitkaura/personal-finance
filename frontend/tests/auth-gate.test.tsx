import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthGate from "@/components/auth-gate";
import { TEST_USER } from "./helpers";
import { render } from "@testing-library/react";

const mockAuthState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockAuthState.value,
}));

vi.mock("@/components/sidebar", () => ({
  __esModule: true,
  default: (props: { isOpen?: boolean; onClose?: () => void }) => (
    <aside data-testid="sidebar" data-open={props.isOpen ?? true}>
      Sidebar
    </aside>
  ),
}));

vi.mock("@/components/invitation-banner", () => ({
  __esModule: true,
  default: () => <div data-testid="invitation-banner" />,
}));

vi.mock("@/components/statement-reminder-banner", () => ({
  __esModule: true,
  default: () => <div data-testid="statement-reminder-banner" />,
}));

vi.mock("@/app/login/page", () => ({
  __esModule: true,
  default: () => <div data-testid="login-page">Login</div>,
}));

describe("AuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.value = {
      user: TEST_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };
  });

  it("shows loading spinner when loading", () => {
    mockAuthState.value = { ...mockAuthState.value, isLoading: true, user: null };
    render(<AuthGate>Content</AuthGate>);
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows login page when unauthenticated", () => {
    mockAuthState.value = { ...mockAuthState.value, isLoading: false, user: null };
    render(<AuthGate>Content</AuthGate>);
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("renders sidebar and children when authenticated", () => {
    render(<AuthGate><div>Page Content</div></AuthGate>);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });

  it("renders a hamburger menu button for mobile", () => {
    render(<AuthGate><div>Content</div></AuthGate>);
    const hamburger = screen.getByLabelText("Toggle menu");
    expect(hamburger).toBeInTheDocument();
  });

  it("clicking hamburger toggles sidebar open", async () => {
    const user = userEvent.setup();
    render(<AuthGate><div>Content</div></AuthGate>);

    const hamburger = screen.getByLabelText("Toggle menu");
    await user.click(hamburger);

    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
  });

  it("main content uses responsive margin (no fixed ml-60 on mobile)", () => {
    render(<AuthGate><div>Content</div></AuthGate>);
    const main = document.querySelector("main");
    expect(main).not.toBeNull();
    const classes = main!.className.split(/\s+/);
    expect(classes).not.toContain("ml-60");
    expect(classes).toContain("lg:ml-60");
  });
});
