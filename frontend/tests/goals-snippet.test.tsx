import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import GoalsSnippet from "@/components/goals-snippet";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getGoals: vi.fn(),
  getSettings: vi.fn(),
}));
const mockState = vi.hoisted(() => ({
  scope: "personal" as "personal" | "partner" | "household",
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: mockState.scope,
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("GoalsSnippet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockState.scope = "personal";
    mockApi.getGoals.mockImplementation(async (scope?: "personal" | "partner" | "household") => {
      if (scope === "household") return { goals: [], shared_goals_summary: null };
      return { goals: [], shared_goals_summary: null };
    });
  });

  it("shows loading skeletons", () => {
    mockApi.getGoals.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<GoalsSnippet />);
    expect(screen.getByText("Goals Progress")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("shows empty state with Set one link", async () => {
    mockApi.getGoals.mockResolvedValue({ goals: [], shared_goals_summary: null });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText(/No active goals/)).toBeInTheDocument();
      const link = screen.getByText("Set one");
      expect(link.closest("a")).toHaveAttribute("href", "/goals");
    });
  });

  it("renders up to 3 personal goals", async () => {
    mockApi.getGoals.mockImplementation(async (scope?: "personal" | "partner" | "household") => {
      if (scope === "household") return { goals: [], shared_goals_summary: null };
      return {
        goals: [
          { id: 1, name: "Emergency", progress: 50, current_amount: 5000, target_amount: 10000, color: "#3b82f6", is_completed: false, household_id: null },
          { id: 2, name: "Vacation", progress: 25, current_amount: 500, target_amount: 2000, color: "#10b981", is_completed: false, household_id: null },
          { id: 3, name: "Car", progress: 10, current_amount: 1000, target_amount: 10000, color: "#f59e0b", is_completed: false, household_id: null },
          { id: 4, name: "Hidden", progress: 5, current_amount: 100, target_amount: 2000, color: "#ef4444", is_completed: false, household_id: null },
        ],
        shared_goals_summary: null,
      };
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeInTheDocument();
      expect(screen.getByText("Vacation")).toBeInTheDocument();
      expect(screen.getByText("Car")).toBeInTheDocument();
      expect(screen.queryByText("Hidden")).toBeNull();
    });
  });

  it("expands shared goals as rows in personal scope", async () => {
    mockApi.getGoals.mockImplementation(async (scope?: "personal" | "partner" | "household") => {
      if (scope === "household") {
        return {
          goals: [
            { id: 11, name: "Shared Emergency", progress: 60, current_amount: 6000, target_amount: 10000, color: "#3b82f6", is_completed: false, household_id: 99 },
          ],
          shared_goals_summary: null,
        };
      }
      return {
        goals: [{ id: 1, name: "Emergency", progress: 50, current_amount: 5000, target_amount: 10000, color: "#3b82f6", is_completed: false, household_id: null }],
        shared_goals_summary: { count: 1, total_progress_pct: 80 },
      };
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeInTheDocument();
      expect(screen.getByText("Shared Emergency")).toBeInTheDocument();
      expect(screen.queryByText(/shared goal/)).toBeNull();
    });
  });

  it("expands shared goals as rows in partner scope", async () => {
    mockState.scope = "partner";
    mockApi.getGoals.mockImplementation(async (scope?: "personal" | "partner" | "household") => {
      if (scope === "household") {
        return {
          goals: [
            { id: 21, name: "Shared Vacation", progress: 35, current_amount: 700, target_amount: 2000, color: "#10b981", is_completed: false, household_id: 99 },
          ],
          shared_goals_summary: null,
        };
      }
      if (scope === "partner") {
        return {
          goals: [
            { id: 2, name: "Partner Goal", progress: 45, current_amount: 900, target_amount: 2000, color: "#3b82f6", is_completed: false, household_id: null },
          ],
          shared_goals_summary: null,
        };
      }
      return { goals: [], shared_goals_summary: null };
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Partner Goal")).toBeInTheDocument();
      expect(screen.getByText("Shared Vacation")).toBeInTheDocument();
      expect(screen.queryByText(/No active goals/)).toBeNull();
    });
  });

  it("has View all link to /goals", async () => {
    mockApi.getGoals.mockResolvedValue({ goals: [], shared_goals_summary: null });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      const link = screen.getByText("View all");
      expect(link.closest("a")).toHaveAttribute("href", "/goals");
    });
  });

  it("shows household goal rows in household scope", async () => {
    mockState.scope = "household";
    mockApi.getGoals.mockResolvedValue({
      goals: [
        { id: 11, name: "Shared Emergency", progress: 60, current_amount: 6000, target_amount: 10000, color: "#3b82f6", is_completed: false, household_id: 99 },
      ],
      shared_goals_summary: null,
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Shared Emergency")).toBeInTheDocument();
      expect(screen.queryByText(/No active goals/)).toBeNull();
    });
  });
});
