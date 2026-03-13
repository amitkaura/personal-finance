import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/components/auth-provider";
import { HouseholdProvider, useHousehold } from "@/components/household-provider";
import {
  createTestQueryClient,
  TEST_USER,
  PARTNER_USER,
  TEST_HOUSEHOLD,
} from "./helpers";

const mockApi = vi.hoisted(() => ({
  getMe: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  getHousehold: vi.fn(),
  getPendingInvitations: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mockApi,
}));

function HouseholdConsumer() {
  const { household, partner, scope, setScope, isLoading, pendingInvitations } =
    useHousehold();
  return (
    <div>
      <span data-testid="household">{household ? household.name : "none"}</span>
      <span data-testid="partner">{partner ? partner.name : "none"}</span>
      <span data-testid="scope">{scope}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="invitations">{pendingInvitations.length}</span>
      <button onClick={() => setScope("partner")}>SetPartner</button>
      <button onClick={() => setScope("household")}>SetHousehold</button>
      <button onClick={() => setScope("personal")}>SetPersonal</button>
    </div>
  );
}

function renderHousehold(qc?: QueryClient) {
  const queryClient = qc ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HouseholdProvider>
          <HouseholdConsumer />
        </HouseholdProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("HouseholdProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockApi.getMe.mockResolvedValue(TEST_USER);
    mockApi.getPendingInvitations.mockResolvedValue([]);
  });

  it("loads household and partner data", async () => {
    mockApi.getHousehold.mockResolvedValue(TEST_HOUSEHOLD);

    renderHousehold();

    await waitFor(() =>
      expect(screen.getByTestId("household").textContent).toBe("Smith-Jones"),
    );
    expect(screen.getByTestId("partner").textContent).toBe("Bob Jones");
  });

  it("defaults to personal scope with no household", async () => {
    mockApi.getHousehold.mockResolvedValue(null);

    renderHousehold();

    await waitFor(() =>
      expect(screen.getByTestId("scope").textContent).toBe("personal"),
    );
    expect(screen.getByTestId("household").textContent).toBe("none");
  });

  it("persists scope to localStorage per user", async () => {
    mockApi.getHousehold.mockResolvedValue(TEST_HOUSEHOLD);

    renderHousehold();

    await waitFor(() =>
      expect(screen.getByTestId("household").textContent).toBe("Smith-Jones"),
    );

    act(() => {
      screen.getByText("SetPartner").click();
    });

    expect(screen.getByTestId("scope").textContent).toBe("partner");
    expect(localStorage.getItem("pf_view_scope_1")).toBe("partner");
  });

  it("reads persisted scope on mount", async () => {
    localStorage.setItem("pf_view_scope_1", "household");
    mockApi.getHousehold.mockResolvedValue(TEST_HOUSEHOLD);

    renderHousehold();

    await waitFor(() =>
      expect(screen.getByTestId("scope").textContent).toBe("household"),
    );
  });

  it("resets scope to personal when household is removed", async () => {
    mockApi.getHousehold.mockResolvedValue(null);
    localStorage.setItem("pf_view_scope_1", "partner");

    renderHousehold();

    await waitFor(() =>
      expect(screen.getByTestId("scope").textContent).toBe("personal"),
    );
  });

  it("effective scope is personal when no household exists", async () => {
    mockApi.getHousehold.mockResolvedValue(null);

    renderHousehold();

    await waitFor(() =>
      expect(screen.getByTestId("household").textContent).toBe("none"),
    );
    expect(screen.getByTestId("scope").textContent).toBe("personal");
  });
});
