import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BulkCsvImportDialog from "@/components/bulk-csv-import-dialog";
import { renderWithProviders, TEST_CATEGORIES } from "./helpers";

const mockApi = vi.hoisted(() => ({
  bulkImportTransactions: vi.fn(),
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
}));
const mockStartAutoCategorize = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({ household: null, loading: false, refetch: () => {} }),
}));

vi.mock("@/components/categorization-progress-provider", () => ({
  useCategorizationProgress: () => ({
    startAutoCategorize: mockStartAutoCategorize,
  }),
}));

function makeCsvFile(content: string, name = "test.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

async function uploadCsv(content: string) {
  const file = makeCsvFile(content);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await waitFor(() => expect(input).toBeTruthy());
  fireEvent.change(input, { target: { files: [file] } });
}

async function advanceToPreview(
  user: ReturnType<typeof userEvent.setup>,
  csv: string,
  extraSteps: string[] = [],
) {
  await uploadCsv(csv);
  await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
  await user.click(screen.getByText("Next"));
  for (const _ of extraSteps) {
    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));
  }
}

describe("BulkCsvImportDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getAccounts.mockResolvedValue([]);
    mockApi.getCategories.mockResolvedValue([]);
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 2,
      skipped: 0,
      categorized: 0,
      errors: [],
    });
  });

  it("renders upload step with file upload button", () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    expect(screen.getByText("Bulk Import Transactions")).toBeInTheDocument();
    expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
    expect(screen.getByText(/Upload a CSV with transactions/)).toBeInTheDocument();
  });

  it("file upload goes to column mapping step", async () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => {
      expect(screen.getByText(/Verify column assignments/)).toBeTruthy();
      const table = screen.getByRole("table");
      expect(within(table).getByText("Column")).toBeInTheDocument();
      expect(within(table).getByText("Sample")).toBeInTheDocument();
      expect(within(table).getByText("Role")).toBeInTheDocument();
    });
  });

  it("shows error for CSV with only a header row", async () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv("Date,Merchant,Amount\n");

    await waitFor(() => {
      expect(
        screen.getByText("CSV must contain a header row and at least one data row."),
      ).toBeInTheDocument();
    });
  });

  it("shows accounts review step when CSV has account column", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n2026-01-16,Grocery,42.00,Checking\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("Visa")).toBeInTheDocument();
      expect(screen.getByText("Checking")).toBeInTheDocument();
      expect(screen.getAllByText("New")).toHaveLength(2);
    });
  });

  it("marks existing accounts appropriately", async () => {
    mockApi.getAccounts.mockResolvedValue([{ id: 1, name: "Visa" }]);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n2026-01-16,Grocery,42.00,Checking\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("Existing")).toBeInTheDocument();
      expect(screen.getByText("New")).toBeInTheDocument();
    });
  });

  it("shows category matching step when CSV has category column", async () => {
    mockApi.getCategories.mockResolvedValue(TEST_CATEGORIES);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Category\n2026-01-15,Coffee,4.50,Food & Dining\n2026-01-16,Grocery,42.00,Crypto Fees\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText(/categories found in CSV/)).toBeInTheDocument();
      expect(screen.getByText("Food & Dining")).toBeInTheDocument();
      expect(screen.getByText("Crypto Fees")).toBeInTheDocument();
      expect(screen.getByText("Exact")).toBeInTheDocument();
      expect(screen.getByText("New")).toBeInTheDocument();
    });
  });

  it("navigates through all steps to import with accounts and categories", async () => {
    mockApi.getCategories.mockResolvedValue(TEST_CATEGORIES);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount,Account,Category\n2026-01-15,Coffee,4.50,Visa,Food & Dining\n",
      ["accounts", "categories"],
    );

    await waitFor(() => {
      expect(screen.getByText(/1 transactions ready/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
    });
  });

  it("Import calls bulkImportTransactions with correct payload", async () => {
    mockApi.getCategories.mockResolvedValue(TEST_CATEGORIES);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount,Account,Category\n2026-01-15,Coffee,4.50,Visa,Food & Dining\n",
      ["accounts", "categories"],
    );

    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(mockApi.bulkImportTransactions).toHaveBeenCalled();
      const [payload] = mockApi.bulkImportTransactions.mock.calls[0];
      expect(payload.accounts).toEqual([{ name: "Visa", type: "depository", subtype: "checking", current_balance: 0 }]);
      expect(payload.transactions).toHaveLength(1);
      expect(payload.transactions[0]).toMatchObject({
        date: "2026-01-15",
        amount: 4.5,
        merchant_name: "Coffee",
        category: "Food & Dining",
        account_name: "Visa",
      });
      expect(payload.skip_llm).toBe(true);
    });
  });

  it("skips to preview when no accounts or categories", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => {
      expect(screen.getByText(/1 transactions ready/)).toBeInTheDocument();
    });
  });

  it("shows progress during import", async () => {
    let resolveImport: (value: unknown) => void;
    const importPromise = new Promise<unknown>((resolve) => {
      resolveImport = resolve;
    });
    mockApi.bulkImportTransactions.mockImplementation(
      (_payload: unknown, onProgress: (evt: unknown) => void) => {
        queueMicrotask(() => {
          onProgress({ current: 1, total: 1, merchant: "Coffee", status: "", category: null });
        });
        return importPromise.then(() => ({
          type: "complete",
          imported: 1,
          skipped: 0,
          categorized: 0,
          errors: [],
        }));
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await advanceToPreview(user, "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Importing...")).toBeInTheDocument();
      expect(screen.getByText("1/1")).toBeInTheDocument();
    });

    resolveImport!(undefined);
  });

  it("shows results after import", async () => {
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 2,
      skipped: 1,
      categorized: 1,
      errors: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => expect(screen.getByText(/Import 2 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 2 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
      expect(screen.getByText(/2 imported, 1 skipped, 1 auto-categorized/)).toBeInTheDocument();
    });
  });

  it("shows errors in results after import", async () => {
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 0,
      skipped: 0,
      categorized: 0,
      errors: ["Row 1: unknown account 'Missing'"],
    });
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await advanceToPreview(user, "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
      expect(screen.getByText("Row 1: unknown account 'Missing'")).toBeInTheDocument();
    });
  });

  it("Done button calls onClose", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await advanceToPreview(user, "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    await user.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Back button in columns returns to upload", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv("Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n");

    await waitFor(() => expect(screen.getByText("Back")).toBeInTheDocument());
    await user.click(screen.getByText("Back"));

    await waitFor(() => {
      expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
    });
  });

  it("triggers auto-categorize after import when uncategorized transactions exist", async () => {
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 3,
      skipped: 0,
      categorized: 1,
      errors: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n2026-01-17,Gas,35.00\n",
    );

    await waitFor(() => expect(screen.getByText(/Import 3 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 3 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
      expect(mockStartAutoCategorize).toHaveBeenCalled();
    });
  });

  it("does not trigger auto-categorize when all transactions already categorized", async () => {
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 2,
      skipped: 0,
      categorized: 2,
      errors: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => expect(screen.getByText(/Import 2 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 2 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
    });
    expect(mockStartAutoCategorize).not.toHaveBeenCalled();
  });

  it("includes new_categories in payload for unmatched categories", async () => {
    mockApi.getCategories.mockResolvedValue(TEST_CATEGORIES);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);

    await advanceToPreview(
      user,
      "Date,Merchant,Amount,Category\n2026-01-15,Coffee,4.50,Crypto Fees\n",
      ["categories"],
    );

    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      const [payload] = mockApi.bulkImportTransactions.mock.calls[0];
      expect(payload.new_categories).toContain("Crypto Fees");
    });
  });
});
