import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SyncButton from "@/components/sync-button";
import { renderWithProviders } from "./helpers";

const mockApi = vi.hoisted(() => ({
  triggerSyncAll: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("SyncButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Sync Now when idle", () => {
    renderWithProviders(<SyncButton />);
    expect(screen.getByText("Sync Now")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("calls triggerSyncAll on click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockApi.triggerSyncAll.mockResolvedValue({ ok: true });
    renderWithProviders(<SyncButton />);
    await user.click(screen.getByText("Sync Now"));
    expect(mockApi.triggerSyncAll).toHaveBeenCalled();
  });

  it("shows Syncing state and disables button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockApi.triggerSyncAll.mockResolvedValue({ ok: true });
    renderWithProviders(<SyncButton />);
    await user.click(screen.getByText("Sync Now"));
    await waitFor(() => {
      expect(screen.getByText("Syncing...")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  it("returns to idle after delay", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockApi.triggerSyncAll.mockResolvedValue({ ok: true });
    renderWithProviders(<SyncButton />);
    await user.click(screen.getByText("Sync Now"));
    await waitFor(() => {
      expect(screen.getByText("Syncing...")).toBeInTheDocument();
    });
    vi.advanceTimersByTime(5500);
    await waitFor(() => {
      expect(screen.getByText("Sync Now")).toBeInTheDocument();
    });
  });
});
