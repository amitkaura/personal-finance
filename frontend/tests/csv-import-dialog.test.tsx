import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
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

  it("renders initial state with file upload button", () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="My Checking" onClose={onClose} />,
    );
    expect(screen.getByText(/Import CSV to My Checking/)).toBeInTheDocument();
    expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Import 0 rows")).toBeInTheDocument();
  });

  it("file upload parses CSV and shows preview", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n");

    await waitFor(() => {
      expect(screen.getByText("2 rows parsed")).toBeInTheDocument();
      expect(screen.getByText("Coffee")).toBeInTheDocument();
      expect(screen.getByText("Grocery")).toBeInTheDocument();
      expect(screen.getByText("4.50")).toBeInTheDocument();
      expect(screen.getByText("42.00")).toBeInTheDocument();
    });
  });

  it("shows error for invalid CSV", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n");

    await waitFor(() => {
      expect(
        screen.getByText("Could not parse CSV. Ensure it has date, amount, and merchant/description columns."),
      ).toBeInTheDocument();
    });
  });

  it("Import button disabled when no rows", () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    expect(screen.getByText("Import 0 rows")).toBeDisabled();
  });

  it("Import calls streamImportTransactions with correct params", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={42} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount,Category\n2026-01-15,Coffee Shop,4.50,Food\n",
    );

    await waitFor(() => expect(screen.getByText("1 rows parsed")).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 rows/));

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
        // Call progress callback before resolving so progress UI is shown
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
    await uploadCsv("Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 rows/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 rows/));

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
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => expect(screen.getByText(/Import 2 rows/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 2 rows/));

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
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n");

    await waitFor(() => expect(screen.getByText(/Import 1 rows/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 rows/));

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
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n");
    await waitFor(() => expect(screen.getByText(/Import 1 rows/)).toBeInTheDocument());
    await user.click(screen.getByText(/Import 1 rows/));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    await user.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
