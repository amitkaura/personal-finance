import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PLAID_MODES } from "@/lib/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/onboarding",
}));

const mockApi = vi.hoisted(() => ({
  getPlaidMode: vi.fn(),
  setPlaidMode: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

import OnboardingPage from "@/app/onboarding/page";
import { renderWithProviders } from "./helpers";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders managed and BYOK options when managed is available", async () => {
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: true });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/connect instantly/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/use your own/i)).toBeInTheDocument();
  });

  it("only shows BYOK option when managed is not available", async () => {
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own/i)).toBeInTheDocument();
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
      expect(screen.getByText(/use your own/i)).toBeInTheDocument();
    });

    const byokBtn = screen.getByRole("button", { name: /use your own/i });
    await user.click(byokBtn);

    await waitFor(() => {
      expect(mockApi.setPlaidMode).toHaveBeenCalledWith(PLAID_MODES.BYOK);
    });
  });

  it("redirects to dashboard after successful selection", async () => {
    const user = userEvent.setup();
    mockApi.getPlaidMode.mockResolvedValue({ mode: null, managed_available: false });
    mockApi.setPlaidMode.mockResolvedValue({ mode: PLAID_MODES.BYOK, managed_available: false });

    renderWithProviders(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/use your own/i)).toBeInTheDocument();
    });

    const byokBtn = screen.getByRole("button", { name: /use your own/i });
    await user.click(byokBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
