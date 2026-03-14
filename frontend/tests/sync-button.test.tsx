import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import SyncButton from "@/components/sync-button";
import { CategorizationProgressProvider } from "@/components/categorization-progress-provider";
import { createTestQueryClient } from "./helpers";

const mockApi = vi.hoisted(() => ({
  syncAllStream: vi.fn(),
  autoCategorize: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = createTestQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <CategorizationProgressProvider>
        {children}
      </CategorizationProgressProvider>
    </QueryClientProvider>
  );
}

describe("SyncButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Sync Now when idle", () => {
    render(<SyncButton />, { wrapper: Wrapper });
    expect(screen.getByText("Sync Now")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("calls syncAllStream on click", async () => {
    mockApi.syncAllStream.mockResolvedValue({
      status: "complete", synced: 0, categorized: 0, skipped: 0,
    });
    render(<SyncButton />, { wrapper: Wrapper });
    await userEvent.click(screen.getByText("Sync Now"));
    expect(mockApi.syncAllStream).toHaveBeenCalled();
  });

  it("shows Syncing state and disables button", async () => {
    let resolve: (v: unknown) => void;
    mockApi.syncAllStream.mockImplementation(() =>
      new Promise((r) => { resolve = r; }),
    );
    render(<SyncButton />, { wrapper: Wrapper });
    await userEvent.click(screen.getByText("Sync Now"));
    await waitFor(() => {
      expect(screen.getByText("Syncing...")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
    });
    resolve!({ status: "complete", synced: 0, categorized: 0, skipped: 0 });
  });

  it("returns to Sync Now after completion", async () => {
    mockApi.syncAllStream.mockResolvedValue({
      status: "complete", synced: 1, categorized: 0, skipped: 0,
    });
    render(<SyncButton />, { wrapper: Wrapper });
    await userEvent.click(screen.getByText("Sync Now"));
    await waitFor(() => {
      expect(screen.getByText("Sync Now")).toBeInTheDocument();
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });
});
