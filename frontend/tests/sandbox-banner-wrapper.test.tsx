import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import SandboxBannerWrapper from "@/components/sandbox-banner-wrapper";
import { renderWithProviders } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getPlaidConfig: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("SandboxBannerWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sandbox banner when plaid_env is sandbox", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "sandbox",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    renderWithProviders(<SandboxBannerWrapper />);
    await waitFor(() => {
      expect(screen.getByTestId("sandbox-banner")).toBeInTheDocument();
    });
  });

  it("renders nothing when plaid_env is production", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: true,
      plaid_env: "production",
      client_id_last4: "1234",
      secret_last4: "5678",
    });
    renderWithProviders(<SandboxBannerWrapper />);
    await waitFor(() => {
      expect(mockApi.getPlaidConfig).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("sandbox-banner")).not.toBeInTheDocument();
  });

  it("renders nothing when plaid is not configured", async () => {
    mockApi.getPlaidConfig.mockResolvedValue({
      configured: false,
      plaid_env: null,
      client_id_last4: null,
      secret_last4: null,
    });
    renderWithProviders(<SandboxBannerWrapper />);
    await waitFor(() => {
      expect(mockApi.getPlaidConfig).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("sandbox-banner")).not.toBeInTheDocument();
  });
});
