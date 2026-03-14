import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatementReminderBanner from "@/components/statement-reminder-banner";
import { renderWithProviders } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getStatementReminders: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe("StatementReminderBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders banner when reminders exist", async () => {
    mockApi.getStatementReminders.mockResolvedValue([
      { id: 1, name: "Visa", statement_available_day: 15 },
    ]);
    renderWithProviders(<StatementReminderBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Visa/)).toBeInTheDocument();
      expect(screen.getByText(/statement is ready/)).toBeInTheDocument();
    });
  });

  it("renders nothing when no reminders", async () => {
    mockApi.getStatementReminders.mockResolvedValue([]);
    const { container } = renderWithProviders(<StatementReminderBanner />);

    await waitFor(() => {
      expect(mockApi.getStatementReminders).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it("dismiss hides banner and sets localStorage key", async () => {
    const user = userEvent.setup();
    mockApi.getStatementReminders.mockResolvedValue([
      { id: 1, name: "Visa", statement_available_day: 15 },
    ]);
    renderWithProviders(<StatementReminderBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Visa/)).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Dismiss"));

    await waitFor(() => {
      expect(screen.queryByText(/Visa/)).not.toBeInTheDocument();
    });

    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.startsWith("statement_dismissed_1_"))).toBe(true);
  });

  it("dismissed banner stays hidden on re-render", async () => {
    const now = new Date();
    const key = `statement_dismissed_1_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    localStorage.setItem(key, "1");

    mockApi.getStatementReminders.mockResolvedValue([
      { id: 1, name: "Visa", statement_available_day: 15 },
    ]);
    const { container } = renderWithProviders(<StatementReminderBanner />);

    await waitFor(() => {
      expect(mockApi.getStatementReminders).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Visa/)).not.toBeInTheDocument();
  });

  it("shows multiple banners for multiple accounts", async () => {
    mockApi.getStatementReminders.mockResolvedValue([
      { id: 1, name: "Visa", statement_available_day: 15 },
      { id: 2, name: "Amex", statement_available_day: 15 },
    ]);
    renderWithProviders(<StatementReminderBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Visa/)).toBeInTheDocument();
      expect(screen.getByText(/Amex/)).toBeInTheDocument();
    });
  });
});
