import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import AuthGate from "@/components/auth-gate";
import { TEST_USER } from "./helpers";

const mockUseAuth = vi.fn();

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/components/sidebar", () => ({
  __esModule: true,
  default: () => <nav data-testid="sidebar">Sidebar</nav>,
}));

vi.mock("@/components/invitation-banner", () => ({
  __esModule: true,
  default: () => <div data-testid="invitation-banner">Banner</div>,
}));

vi.mock("@/app/login/page", () => ({
  __esModule: true,
  default: () => <div data-testid="login-page">Login Page</div>,
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("AuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading spinner when auth is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    render(<AuthGate><div>Child</div></AuthGate>);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("Child")).toBeNull();
  });

  it("renders login page when not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    render(<AuthGate><div>Child</div></AuthGate>);
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByText("Child")).toBeNull();
  });

  it("renders sidebar and children when authenticated", () => {
    mockUseAuth.mockReturnValue({ user: TEST_USER, isLoading: false });
    render(<AuthGate><div>Child Content</div></AuthGate>);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("invitation-banner")).toBeInTheDocument();
    expect(screen.getByText("Child Content")).toBeInTheDocument();
  });

  it("renders main with proper layout classes", () => {
    mockUseAuth.mockReturnValue({ user: TEST_USER, isLoading: false });
    render(<AuthGate><div>Content</div></AuthGate>);
    const main = document.querySelector("main");
    expect(main?.className).toContain("ml-60");
  });
});
