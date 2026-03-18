import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
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
  getPlaidConfig: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

import OnboardingPage from "@/app/onboarding/page";
import { renderWithProviders } from "./helpers";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });
  });

  // ── Step 1: Plaid mode ───────────────────────────────────────

  it("shows both managed and BYOK cards when managed is available", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect instantly/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
  });

  it("only shows BYOK option when managed is not available", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/connect instantly/i)).not.toBeInTheDocument();
  });

  it("does not auto-select any mode on mount", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect instantly/i })).toBeInTheDocument();
    });
    expect(mockApi.setPlaidMode).not.toHaveBeenCalled();
  });

  it("calls setPlaidMode with MANAGED when managed card is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.MANAGED, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect instantly/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /connect instantly/i }));

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.MANAGED);
    });
  });

  it("calls setPlaidMode with BYOK when BYOK card is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });

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

  it("shows Settings info text on step 1", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/settings.*integrations/i)).toBeInTheDocument();
    });
  });

  it("does not show skip button on step 1", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect instantly/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
  });

  // ── Wizard progression ──────────────────────────────────────

  it("shows step indicator (step 1 of 2)", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
    });
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
  });

  it("advances to step 2 (LLM mode) after plaid mode is selected", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByText(/step 2/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /ai categorization/i })).toBeInTheDocument();
  });

  it("skips step 2 and redirects when LLM mode already set", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getLLMMode.mockResolvedValue({ mode: LLM_MODES.BYOK, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  // ── Step 2: LLM mode ──────────────────────────────────────

  it("shows managed AI option when available", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
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

  it("does not show skip button on step 2", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ai categorization/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
  });

  it("shows back button on step 2", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });
  });

  it("back button on step 2 returns to step 1", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByText(/step 1/i)).toBeInTheDocument();
    });
  });

  it("shows info text about changing LLM mode in Settings", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getLLMMode.mockResolvedValue({ mode: null, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own.*plaid/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(screen.getByText(/settings/i)).toBeInTheDocument();
    });
  });

  it("calls setLLMMode with MANAGED when managed AI is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
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

  it("redirects to dashboard after LLM mode selection", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
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

  it("shows sandbox banner on step 1 when managed available with sandbox keys", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "sandbox", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByTestId("sandbox-banner")).toBeInTheDocument();
    });
  });

  it("does not show sandbox banner when managed available with production keys", async () => {
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "production", has_linked_accounts: false,
    });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect instantly/i })).toBeInTheDocument();
    });
    expect(screen.queryByTestId("sandbox-banner")).not.toBeInTheDocument();
  });

  // ── Cache invalidation ────────────────────────────────────────

  it("invalidates plaid-config cache when managed card is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: true, managed_plaid_env: "sandbox", has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.MANAGED, managed_available: true, managed_plaid_env: "sandbox", has_linked_accounts: false,
    });
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true, plaid_env: "sandbox", client_id_last4: null, secret_last4: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["plaid-config"], {
      configured: false, plaid_env: null, client_id_last4: null, secret_last4: null,
    });

    renderWithProviders(<OnboardingPage />, { queryClient });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect instantly/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /connect instantly/i }));

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.MANAGED);
    });

    await waitFor(() => {
      const state = queryClient.getQueryState(["plaid-config"]);
      expect(state?.isInvalidated).toBe(true);
    });
  });

  it("invalidates plaid-config cache when BYOK card is clicked", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({
      mode: null, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.setPlaidMode.mockResolvedValue({
      mode: PLAID_MODES.BYOK, managed_available: false, managed_plaid_env: null, has_linked_accounts: false,
    });
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: false, plaid_env: null, client_id_last4: null, secret_last4: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["plaid-config"], {
      configured: false, plaid_env: null, client_id_last4: null, secret_last4: null,
    });

    renderWithProviders(<OnboardingPage />, { queryClient });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use your own.*plaid/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /use your own.*plaid/i }));

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.BYOK);
    });

    await waitFor(() => {
      const state = queryClient.getQueryState(["plaid-config"]);
      expect(state?.isInvalidated).toBe(true);
    });
  });
});
