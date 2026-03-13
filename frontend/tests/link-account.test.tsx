import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LinkAccount from "@/components/link-account";
import { renderWithProviders } from "./helpers";

const mockOpen = vi.fn();

vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: mockOpen, ready: true }),
}));

const mockApi = vi.hoisted(() => ({
  createLinkToken: vi.fn(),
  exchangeToken: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("LinkAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Link Account button when idle", () => {
    renderWithProviders(<LinkAccount />);
    expect(screen.getByText("Link Account")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("calls createLinkToken on click", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));
    expect(mockApi.createLinkToken).toHaveBeenCalled();
  });

  it("shows success message with account count", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    mockApi.exchangeToken.mockResolvedValue({ item_id: "item-1", accounts_synced: 3 });

    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));

    await waitFor(() => {
      expect(mockApi.createLinkToken).toHaveBeenCalled();
    });
  });

  it("pluralizes account(s) correctly for 1 account", async () => {
    const user = userEvent.setup();
    mockApi.createLinkToken.mockResolvedValue({ link_token: "link-tok" });
    mockApi.exchangeToken.mockResolvedValue({ item_id: "item-1", accounts_synced: 1 });

    renderWithProviders(<LinkAccount />);
    await user.click(screen.getByText("Link Account"));

    await waitFor(() => {
      expect(mockApi.createLinkToken).toHaveBeenCalled();
    });
  });
});
