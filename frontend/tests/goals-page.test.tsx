import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GoalsPage from "@/app/goals/page";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getGoals: vi.fn(),
  getAccounts: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  addGoalContribution: vi.fn(),
  getGoalContributions: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null, partner: null, scope: "personal",
    setScope: vi.fn(), pendingInvitations: [], isLoading: false, refetch: vi.fn(),
  }),
}));

const ACTIVE_GOAL = {
  id: 1, name: "Emergency Fund", progress: 50, current_amount: 5000,
  target_amount: 10000, remaining: 5000, color: "#3b82f6", is_completed: false,
  household_id: null, is_account_linked: false, target_date: "2025-12-31",
  created_at: "2025-01-01",
};

const COMPLETED_GOAL = {
  id: 2, name: "Laptop", progress: 100, current_amount: 2000,
  target_amount: 2000, remaining: 0, color: "#10b981", is_completed: true,
  household_id: null, is_account_linked: false, target_date: null,
  created_at: "2024-06-01",
};

describe("GoalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getGoals.mockResolvedValue({ goals: [], shared_goals_summary: null });
    mockApi.getAccounts.mockResolvedValue([]);
  });

  it("renders title and New Goal button", () => {
    renderWithProviders(<GoalsPage />);
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("New Goal")).toBeInTheDocument();
  });

  it("shows empty state when no goals", async () => {
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("No goals yet")).toBeInTheDocument();
      expect(screen.getByText("Create your first goal")).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.getGoals.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<GoalsPage />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders active goals section", async () => {
    mockApi.getGoals.mockResolvedValue({ goals: [ACTIVE_GOAL], shared_goals_summary: null });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("Active Goals")).toBeInTheDocument();
      expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
    });
  });

  it("renders completed goals section", async () => {
    mockApi.getGoals.mockResolvedValue({ goals: [COMPLETED_GOAL], shared_goals_summary: null });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("Laptop")).toBeInTheDocument();
      expect(screen.getAllByText(/Completed/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows progress percentage on goal card", async () => {
    mockApi.getGoals.mockResolvedValue({ goals: [ACTIVE_GOAL], shared_goals_summary: null });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("50% complete")).toBeInTheDocument();
    });
  });

  it("shows target date on goal card", async () => {
    mockApi.getGoals.mockResolvedValue({ goals: [ACTIVE_GOAL], shared_goals_summary: null });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("Target date")).toBeInTheDocument();
    });
  });

  it("opens create goal dialog when clicking New Goal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoalsPage />);
    await user.click(screen.getByText("New Goal"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Emergency fund")).toBeInTheDocument();
    });
  });

  it("shows shared goals summary in personal scope", async () => {
    mockApi.getGoals.mockResolvedValue({
      goals: [],
      shared_goals_summary: { count: 2, total_progress_pct: 45 },
    });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 shared goals/)).toBeInTheDocument();
    });
  });

  it("delete opens confirm dialog", async () => {
    const user = userEvent.setup();
    mockApi.getGoals.mockResolvedValue({ goals: [ACTIVE_GOAL], shared_goals_summary: null });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
    });
    const deleteBtn = screen.getByTitle("Delete goal");
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  it("shows explicit validation when goal target amount is zero", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoalsPage />);
    await user.click(screen.getByText("New Goal"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. Emergency fund")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("e.g. Emergency fund"), "Trip");
    const dialogNumberInputs = document.querySelectorAll('input[type="number"]');
    expect(dialogNumberInputs.length).toBeGreaterThan(0);
    const targetInput = dialogNumberInputs[0] as HTMLInputElement;
    await user.type(targetInput, "0");

    expect(targetInput).toHaveAttribute("aria-invalid", "true");
    const errorEl = screen.getByText("Target amount must be greater than 0.");
    expect(errorEl.className).toContain("opacity-100");
  });

  it("shows explicit validation when contribution amount is zero", async () => {
    const user = userEvent.setup();
    mockApi.getGoals.mockResolvedValue({ goals: [ACTIVE_GOAL], shared_goals_summary: null });
    renderWithProviders(<GoalsPage />);
    await waitFor(() => {
      expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Update Progress"));
    await waitFor(() => {
      expect(screen.getByText("Amount to add")).toBeInTheDocument();
    });

    const amountInput = document.querySelector('input[type="number"][min="0.01"]') as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    await user.type(amountInput, "0");

    expect(amountInput).toHaveAttribute("aria-invalid", "true");
    const errorEl = screen.getByText("Amount must be greater than 0.");
    expect(errorEl.className).toContain("opacity-100");
  });
});
