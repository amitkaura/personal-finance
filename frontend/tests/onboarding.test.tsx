import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAID_MODES, LLM_MODES } from "@/lib/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/onboarding",
}));

const mockApi = vi.hoisted(() => ({
  getPlaidMode: vi.fn(),
  setPlaidMode: vi.fn(),
  getLLMMode: vi.fn(),
  setLLMMode: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

import OnboardingPage from "@/app/onboarding/page";
import { renderWithProviders } from "./helpers";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });
  });

  // ── Step 1: Plaid mode (preserved existing behavior) ─────────

  it("renders managed and BYOK options when managed is available", async () => {
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/connect instantly/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
  });

  it("only shows BYOK option when managed is not available", async () => {
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/connect instantly/i)).not.toBeInTheDocument();
  });

  it("calls setPlaidMode with MANAGED when managed card is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: true });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.MANAGED, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/connect instantly/i)).toBeInTheDocument();
    });

    const managedBtn = screen.getByRole("button", { name: /connect instantly/i });
    await user.click(managedBtn);

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.MANAGED);
    });
  });

  it("calls setPlaidMode with BYOK when BYOK card is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: true });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });

    const byokBtn = screen.getByRole("button", { name: /use your own.*plaid/i });
    await user.click(byokBtn);

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.BYOK);
    });
  });

  // ── Wizard progression ──────────────────────────────────────

  it("shows step indicator (step 1 of 2)", async () => {
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
    });
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
  });

  it("advances to step 2 (LLM mode) after plaid mode is selected", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByText(/step 2/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/ai categorization/i)).toBeInTheDocument();
  });

  it("skips step 2 and redirects when LLM mode already set", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: LLM_MODES.BYOK, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  // ── Step 2: LLM mode ──────────────────────────────────────

  it("shows managed AI option when available", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByText(/use managed ai/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/bring your own.*api/i)).toBeInTheDocument();
  });

  it("shows skip option on LLM mode step", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    });
  });

  it("calls setLLMMode with MANAGED when managed AI is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: true });
    mockApi.setLLMMode.mockResolvedValue({ mode: LLM_MODES.MANAGED, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByText(/use managed ai/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use managed ai/i }));

    await waitFor(() => {
      expect(mockApi.setLLMMode).toHaveBeenCalledWith(LLM_MODES.MANAGED);
    });
  });

  it("calls setLLMMode with NONE on skip and redirects", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setLLMMode.mockResolvedValue({ mode: LLM_MODES.NONE, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /skip/i }));

    await waitFor(() => {
      expect(mockApi.setLLMMode).toHaveBeenCalledWith(LLM_MODES.NONE);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("redirects to dashboard after LLM mode selection", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: true });
    mockApi.setLLMMode.mockResolvedValue({ mode: LLM_MODES.MANAGED, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByText(/use managed ai/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use managed ai/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  // ── Sandbox indicator on Plaid mode step ───────────────────────

  it("shows sandbox banner when managed plaid uses sandbox keys", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null,
      managed_available: true,
      managed_plaid_env: "sandbox",
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByTestId("sandbox-banner")).toBeInTheDocument();
    });
  });

  it("shows Demo tag on managed card when sandbox keys are used", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null,
      managed_available: true,
      managed_plaid_env: "sandbox",
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/connect instantly/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("does not show sandbox banner when managed plaid uses production keys", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null,
      managed_available: true,
      managed_plaid_env: "production",
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/connect instantly/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("sandbox-banner")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  });
});
