import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddPartnerDialog from "@/components/add-partner-dialog";
import { renderWithProviders } from "./helpers";

const mockApi = vi.hoisted(() => ({
  invitePartner: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({ refetch: vi.fn() }),
}));

describe("AddPartnerDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.invitePartner.mockResolvedValue({
      id: 1,
      token: "t",
      invited_email: "bob@example.com",
      status: "pending",
    });
  });

  it("renders email input and Send Invite button", () => {
    renderWithProviders(<AddPartnerDialog open onClose={onClose} />);
    expect(screen.getByPlaceholderText(/partner.*email/i)).toBeInTheDocument();
    expect(screen.getByText("Send Invite")).toBeInTheDocument();
  });

  it("calls invitePartner with email on submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddPartnerDialog open onClose={onClose} />);

    await user.type(screen.getByPlaceholderText(/partner.*email/i), "bob@example.com");
    await user.click(screen.getByText("Send Invite"));

    await waitFor(() => {
      expect(mockApi.invitePartner).toHaveBeenCalledWith("bob@example.com");
    });
  });

  it("calls onClose after successful invite", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddPartnerDialog open onClose={onClose} />);

    await user.type(screen.getByPlaceholderText(/partner.*email/i), "bob@example.com");
    await user.click(screen.getByText("Send Invite"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error message on API failure", async () => {
    mockApi.invitePartner.mockRejectedValue(new Error("API error 400: {\"detail\":\"Already in a household\"}"));
    const user = userEvent.setup();
    renderWithProviders(<AddPartnerDialog open onClose={onClose} />);

    await user.type(screen.getByPlaceholderText(/partner.*email/i), "bob@example.com");
    await user.click(screen.getByText("Send Invite"));

    await waitFor(() => {
      expect(screen.getByText(/Already in a household/)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when clicking close button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddPartnerDialog open onClose={onClose} />);

    await user.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when open is false", () => {
    const { container } = renderWithProviders(<AddPartnerDialog open={false} onClose={onClose} />);
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
