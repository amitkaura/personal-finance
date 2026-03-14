import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CsvImportDialog from "@/components/csv-import-dialog";
import { renderWithProviders, TEST_SETTINGS } from "./helpers";

const mockApi = vi.hoisted(() => ({
  streamImportTransactions: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

function makeCsvFile(content: string, name = "test.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

async function uploadCsv(content: string) {
  const file = makeCsvFile(content);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await waitFor(() => expect(input).toBeTruthy());
  fireEvent.change(input, { target: { files: [file] } });
}

async function advanceToPreview(user: ReturnType<typeof userEvent.setup>, csv: string) {
  await uploadCsv(csv);
  await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
  await user.click(screen.getByText("Next"));
}

describe("CsvImportDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.streamImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 2,
      skipped: 0,
      categorized: 0,
      errors: [],
    });
  });

  it("renders upload step with file upload button", () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="My Checking" onClose={onClose} />,
    );
    expect(screen.getByText(/Import CSV to My Checking/)).toBeInTheDocument();
    expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
    expect(screen.getByText(/auto-detect columns/)).toBeInTheDocument();
  });

  it("file upload goes to column mapping step", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n");

    await waitFor(() => {
      expect(screen.getByText(/Verify column assignments/)).toBeTruthy();
      const table = screen.getByRole("table");
      expect(within(table).getByText("Column")).toBeInTheDocument();
      expect(within(table).getByText("Sample")).toBeInTheDocument();
      expect(within(table).getByText("Role")).toBeInTheDocument();
    });
  });

  it("shows error for CSV with only header row", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n");

    await waitFor(() => {
      expect(
        screen.getByText("CSV must contain a header row and at least one data row."),
      ).toBeInTheDocument();
    });
  });

  it("Next button disabled when required columns not assigned", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Foo,Bar,Baz\n1,2,3\n");

    await waitFor(() => {
      expect(screen.getByText("Next")).toBeDisabled();
      expect(screen.getByText(/Assign at least Date, Merchant, and Amount/)).toBeInTheDocument();
    });
  });

  it("navigates through all steps: upload → columns → preview → import → result", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={42} accountName="Test" onClose={onClose} />,
    );

    await advanceToPreview(
      user,
      "Date,Description,Amount,Category\n2026-01-15,Coffee Shop,4.50,Food\n",
    );

    await waitFor(() => {
      expect(screen.getByText(/1 transactions ready/)).toBeInTheDocument();
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
    });
  });

  it("Import calls streamImportTransactions with mapped data", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={42} accountName="Test" onClose={onClose} />,
    );

    await advanceToPreview(
      user,
      "Date,Description,Amount,Category\n2026-01-15,Coffee Shop,4.50,Food\n",
    );

    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(mockApi.streamImportTransactions).toHaveBeenCalledWith(
        42,
        [
          {
            date: "2026-01-15",
            amount: 4.5,
            merchant_name: "Coffee Shop",
            category: "Food",
          },
        ],
        expect.any(Function),
        false,
      );
    });
  });

  it("shows progress during import", async () => {
    let resolveImport: (value: unknown) => void;
    const importPromise = new Promise<unknown>((resolve) => {
      resolveImport = resolve;
    });
    mockApi.streamImportTransactions.mockImplementation(
      (_id: number, _rows: unknown[], onProgress: (evt: unknown) => void) => {
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
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );

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
    mockApi.streamImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 2,
      skipped: 1,
      categorized: 1,
      errors: [],
    });
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );

    await advanceToPreview(
      user,
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => expect(screen.getByText(/Import 2 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 2 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
      expect(screen.getByText(/2 imported, 1 skipped, 1 auto-categorized/)).toBeInTheDocument();
    });
  });

  it("shows errors in results after import", async () => {
    mockApi.streamImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 1,
      skipped: 0,
      categorized: 0,
      errors: ["Row 1: invalid date 'bad'"],
    });
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );

    await advanceToPreview(user, "Date,Description,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeInTheDocument();
      expect(screen.getByText("Row 1: invalid date 'bad'")).toBeInTheDocument();
    });
  });

  it("Done button calls onClose", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await advanceToPreview(user, "Date,Description,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 transactions/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 transactions/));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    await user.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Back button returns to upload step and resets", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n");

    await waitFor(() => expect(screen.getByText("Back")).toBeInTheDocument());
    await user.click(screen.getByText("Back"));

    await waitFor(() => {
      expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
    });
  });

  it("handles debit/credit columns correctly", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );

    await advanceToPreview(
      user,
      "Date,Description,Debit,Credit\n2026-01-15,Coffee,4.50,\n2026-01-16,Payroll,,1500.00\n",
    );

    await waitFor(() => {
      expect(screen.getByText(/2 transactions ready/)).toBeInTheDocument();
      expect(screen.getByText("Coffee")).toBeInTheDocument();
      expect(screen.getByText("Payroll")).toBeInTheDocument();
    });
  });

  it("preview shows skipped row count for invalid data", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );

    await advanceToPreview(
      user,
      "Date,Merchant,Amount\nbad-date,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => {
      expect(screen.getByText(/1 transactions ready/)).toBeInTheDocument();
      expect(screen.getByText(/1 rows skipped/)).toBeInTheDocument();
    });
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    const closeBtn = screen.getByRole("button", { name: "" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
