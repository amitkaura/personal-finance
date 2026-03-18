import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { createTestQueryClient } from "./helpers";
import { CategorizationProgressProvider, useCategorizationProgress } from "@/components/categorization-progress-provider";
import CategorizationDrawer from "@/components/categorization-drawer";

const mockApi = vi.hoisted(() => ({
  syncAllStream: vi.fn(),
  autoCategorize: vi.fn(),
  streamImportTransactions: vi.fn(),
  bulkImportTransactions: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = createTestQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <CategorizationProgressProvider>
        {children}
        <CategorizationDrawer />
      </CategorizationProgressProvider>
    </QueryClientProvider>
  );
}

function SyncTrigger() {
  const { startSync, state } = useCategorizationProgress();
  return (
    <button onClick={startSync} disabled={state !== "idle"}>
      Sync
    </button>
  );
}

function AutoCatTrigger() {
  const { startAutoCategorize, state } = useCategorizationProgress();
  return (
    <button onClick={startAutoCategorize} disabled={state !== "idle"}>
      Auto-Categorize
    </button>
  );
}

function ImportTrigger() {
  const { startImport, state } = useCategorizationProgress();
  return (
    <button
      onClick={() =>
        startImport(1, "My Checking", [
          { date: "2026-01-15", amount: 4.5, merchant_name: "Coffee" },
        ])
      }
      disabled={state !== "idle"}
    >
      Import
    </button>
  );
}

function BulkImportTrigger() {
  const { startBulkImport, state } = useCategorizationProgress();
  return (
    <button
      onClick={() =>
        startBulkImport({
          accounts: [{ name: "Visa", type: "depository" }],
          transactions: [
            { date: "2026-01-15", amount: 4.5, merchant_name: "Coffee", account_name: "Visa" },
          ],
          skip_llm: true,
        })
      }
      disabled={state !== "idle"}
    >
      Bulk Import
    </button>
  );
}

function DismissTrigger() {
  const { dismiss } = useCategorizationProgress();
  return <button onClick={dismiss}>Reset</button>;
}

describe("CategorizationDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when idle", () => {
    render(
      <Wrapper>
        <SyncTrigger />
      </Wrapper>,
    );
    expect(screen.queryByText(/syncing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoriz/i)).not.toBeInTheDocument();
  });

  it("shows syncing state during sync", async () => {
    let resolveSync: (value: unknown) => void;
    mockApi.syncAllStream.mockImplementation((onEvent: (e: unknown) => void) => {
      onEvent({ status: "syncing", institution: "Chase", current: 1, total: 2 });
      return new Promise((resolve) => { resolveSync = resolve; });
    });

    render(
      <Wrapper>
        <SyncTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Sync"));

    await waitFor(() => {
      expect(screen.getByText(/Chase/)).toBeInTheDocument();
    });

    resolveSync!({ status: "complete", synced: 5, categorized: 3, skipped: 2 });
  });

  it("shows categorization progress during auto-categorize", async () => {
    let resolveAutoCat: (value: unknown) => void;
    mockApi.autoCategorize.mockImplementation((onProgress: (e: unknown) => void) => {
      onProgress({ status: "categorized", current: 2, total: 5, merchant_name: "Target", category: "Shopping" });
      return new Promise((resolve) => { resolveAutoCat = resolve; });
    });

    render(
      <Wrapper>
        <AutoCatTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Auto-Categorize"));

    await waitFor(() => {
      expect(screen.getByText(/Target/)).toBeInTheDocument();
    });

    resolveAutoCat!({ status: "complete", total: 5, categorized: 3, skipped: 2 });
  });

  it("shows completion summary and dismiss button", async () => {
    mockApi.syncAllStream.mockImplementation(() =>
      Promise.resolve({ status: "complete", synced: 10, categorized: 4, skipped: 6 }),
    );

    render(
      <Wrapper>
        <SyncTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Sync"));

    await waitFor(() => {
      expect(screen.getByText(/10/)).toBeInTheDocument();
      expect(screen.getByText(/4/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /dismiss|close/i })).toBeInTheDocument();
  });

  it("shows importing state during import", async () => {
    let resolveImport: (value: unknown) => void;
    mockApi.streamImportTransactions.mockImplementation(
      (_id: number, _rows: unknown[], onProgress: (e: unknown) => void) => {
        onProgress({ type: "progress", current: 1, total: 3, merchant: "Coffee", status: "imported", category: null });
        return new Promise((resolve) => { resolveImport = resolve; });
      },
    );

    render(
      <Wrapper>
        <ImportTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Import"));

    await waitFor(() => {
      expect(screen.getByText(/Importing/)).toBeInTheDocument();
      expect(screen.getByText(/My Checking/)).toBeInTheDocument();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    resolveImport!({ type: "complete", imported: 3, skipped: 0, categorized: 3, errors: [] });
  });

  it("shows importing then transitions to complete when all categorized", async () => {
    mockApi.streamImportTransactions.mockResolvedValue({
      type: "complete", imported: 3, skipped: 0, categorized: 3, errors: [],
    });

    render(
      <Wrapper>
        <ImportTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Import"));

    await waitFor(() => {
      expect(screen.getByText(/Import complete/)).toBeInTheDocument();
      expect(screen.getByText(/3/)).toBeInTheDocument();
    });
  });

  it("chains import into auto-categorize when uncategorized transactions remain", async () => {
    mockApi.streamImportTransactions.mockResolvedValue({
      type: "complete", imported: 5, skipped: 0, categorized: 1, errors: [],
    });
    let resolveAutoCat: (value: unknown) => void;
    mockApi.autoCategorize.mockImplementation((onProgress: (e: unknown) => void) => {
      onProgress({ status: "categorized", current: 1, total: 4, merchant_name: "Target", category: "Shopping" });
      return new Promise((resolve) => { resolveAutoCat = resolve; });
    });

    render(
      <Wrapper>
        <ImportTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Import"));

    await waitFor(() => {
      expect(screen.getByText(/Categorizing/)).toBeInTheDocument();
      expect(screen.getByText(/Target/)).toBeInTheDocument();
    });

    resolveAutoCat!({ status: "complete", total: 4, categorized: 3, skipped: 1 });
  });

  it("shows bulk import progress in drawer", async () => {
    let resolveBulk: (value: unknown) => void;
    mockApi.bulkImportTransactions.mockImplementation(
      (_payload: unknown, onProgress: (e: unknown) => void) => {
        onProgress({ type: "progress", current: 1, total: 2, merchant: "Grocery", status: "imported", category: null });
        return new Promise((resolve) => { resolveBulk = resolve; });
      },
    );

    render(
      <Wrapper>
        <BulkImportTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Bulk Import"));

    await waitFor(() => {
      expect(screen.getByText(/Importing/)).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    resolveBulk!({ type: "complete", imported: 2, skipped: 0, categorized: 2, errors: [] });
  });

  it("dismiss resets to idle and hides the drawer", async () => {
    mockApi.syncAllStream.mockResolvedValue({
      status: "complete", synced: 5, categorized: 2, skipped: 3,
    });

    render(
      <Wrapper>
        <SyncTrigger />
        <DismissTrigger />
      </Wrapper>,
    );

    await userEvent.click(screen.getByText("Sync"));

    await waitFor(() => {
      expect(screen.getByText(/5/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText("Dismiss"));

    await waitFor(() => {
      expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
    });
  });
});
