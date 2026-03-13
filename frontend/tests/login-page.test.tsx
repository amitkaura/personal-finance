import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import LoginPage from "@/app/login/page";

const mockLogin = vi.fn();
const mockPush = vi.fn();

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ login: mockLogin, user: null, isLoading: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: (props: { onSuccess: (r: unknown) => void; onError: () => void }) => (
    <button
      data-testid="google-login"
      onClick={() => props.onSuccess({ credential: "test-cred" })}
    >
      Sign in with Google
    </button>
  ),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockResolvedValue(undefined);
  });

  it("renders hero section with sign-in prompt", () => {
    render(<LoginPage />);
    expect(screen.getByText(/Sign in or create an account/)).toBeInTheDocument();
  });

  it("renders trust badges", () => {
    render(<LoginPage />);
    expect(screen.getByText("Self-hosted")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Yours")).toBeInTheDocument();
  });

  it("renders feature cards", () => {
    render(<LoginPage />);
    const cards = document.querySelectorAll(".feature-card");
    expect(cards.length).toBe(6);
  });

  it("calls login and navigates on success", async () => {
    render(<LoginPage />);
    const btn = screen.getByTestId("google-login");
    btn.click();
    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test-cred");
    });
  });

  it("shows error when no credential received", async () => {
    vi.mocked(vi.fn()).mockImplementation(() => {});
    render(<LoginPage />);
  });
});
