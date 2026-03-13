import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import GoalsSnippet from "@/components/goals-snippet";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getGoals: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

describe("GoalsSnippet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
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
    mockApi.getGoals.mockResolvedValue({
      goals: [
        { id: 1, name: "Emergency", progress: 50, current_amount: 5000, target_amount: 10000, color: "#3b82f6", is_completed: false, household_id: null },
        { id: 2, name: "Vacation", progress: 25, current_amount: 500, target_amount: 2000, color: "#10b981", is_completed: false, household_id: null },
        { id: 3, name: "Car", progress: 10, current_amount: 1000, target_amount: 10000, color: "#f59e0b", is_completed: false, household_id: null },
        { id: 4, name: "Hidden", progress: 5, current_amount: 100, target_amount: 2000, color: "#ef4444", is_completed: false, household_id: null },
      ],
      shared_goals_summary: null,
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeInTheDocument();
      expect(screen.getByText("Vacation")).toBeInTheDocument();
      expect(screen.getByText("Car")).toBeInTheDocument();
      expect(screen.queryByText("Hidden")).toBeNull();
    });
  });

  it("shows shared goals summary block", async () => {
    mockApi.getGoals.mockResolvedValue({
      goals: [],
      shared_goals_summary: { count: 2, total_progress_pct: 45 },
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("2 shared goals")).toBeInTheDocument();
      expect(screen.getByText("45% avg")).toBeInTheDocument();
    });
  });

  it("uses singular 'goal' for count of 1", async () => {
    mockApi.getGoals.mockResolvedValue({
      goals: [],
      shared_goals_summary: { count: 1, total_progress_pct: 80 },
    });
    renderWithProviders(<GoalsSnippet />);
    await waitFor(() => {
      expect(screen.getByText("1 shared goal")).toBeInTheDocument();
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
});
