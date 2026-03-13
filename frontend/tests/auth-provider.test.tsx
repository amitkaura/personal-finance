import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { createTestQueryClient, TEST_USER } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getMe: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

function AuthConsumer() {
  const { user, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.name : "none"}</span>
      <button onClick={() => login("test-id-token")}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

function renderAuth(qc?: QueryClient) {
  const queryClient = qc ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading then user after getMe resolves", async () => {
    mockApi.getMe.mockResolvedValue(TEST_USER);

    renderAuth();

    expect(screen.getByTestId("loading").textContent).toBe("true");
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("Alice Smith");
  });

  it("sets user to null when getMe fails", async () => {
    mockApi.getMe.mockRejectedValue(new Error("401"));

    renderAuth();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("login sets user and clears query cache", async () => {
    mockApi.getMe.mockRejectedValue(new Error("401"));
    mockApi.loginWithGoogle.mockResolvedValue(TEST_USER);

    const qc = createTestQueryClient();
    const clearSpy = vi.spyOn(qc, "clear");

    renderAuth(qc);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => {
      screen.getByText("Login").click();
    });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Alice Smith"));
    expect(mockApi.loginWithGoogle).toHaveBeenCalledWith("test-id-token");
    expect(clearSpy).toHaveBeenCalled();
  });

  it("logout clears user and query cache", async () => {
    mockApi.getMe.mockResolvedValue(TEST_USER);
    mockApi.logout.mockResolvedValue({ ok: true });

    const qc = createTestQueryClient();
    const clearSpy = vi.spyOn(qc, "clear");

    renderAuth(qc);
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Alice Smith"));

    await act(async () => {
      screen.getByText("Logout").click();
    });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("none"));
    expect(mockApi.logout).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("refreshUser updates user without clearing cache", async () => {
    mockApi.getMe.mockResolvedValue(TEST_USER);

    const qc = createTestQueryClient();
    renderAuth(qc);

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Alice Smith"));
  });

  it("provides default context values when used outside provider", () => {
    function Bare() {
      const { user, isLoading } = useAuth();
      return (
        <div>
          <span data-testid="user">{user ? user.name : "none"}</span>
          <span data-testid="loading">{String(isLoading)}</span>
        </div>
      );
    }

    render(<Bare />);
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("loading").textContent).toBe("true");
  });
});
