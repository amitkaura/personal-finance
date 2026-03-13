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

  it("renders upload step initially", () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="My Checking" onClose={onClose} />,
    );
    expect(screen.getByText("Import Transactions")).toBeInTheDocument();
    expect(screen.getByText("My Checking")).toBeInTheDocument();
    expect(screen.getByText("Drag & drop a CSV file here")).toBeInTheDocument();
    expect(screen.getByText("Choose File")).toBeInTheDocument();
  });

  it("shows error for CSV with only header", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n");

    await waitFor(() => {
      expect(
        screen.getByText("CSV must have at least a header row and one data row."),
      ).toBeInTheDocument();
    });
  });

  it("advances to mapping step after valid file upload", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n");

    await waitFor(() => {
      expect(screen.getByText(/Assign a role to each column/)).toBeInTheDocument();
    });
  });

  it("auto-detects column roles from headers", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n");

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect(selects).toHaveLength(3);
      expect((selects[0] as HTMLSelectElement).value).toBe("date");
      expect((selects[1] as HTMLSelectElement).value).toBe("merchant");
      expect((selects[2] as HTMLSelectElement).value).toBe("amount");
    });
  });

  it("auto-detects debit and credit columns", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Transaction Date,Details,Debit,Credit\n2026-01-15,Coffee,4.50,\n",
    );

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect((selects[0] as HTMLSelectElement).value).toBe("date");
      expect((selects[1] as HTMLSelectElement).value).toBe("merchant");
      expect((selects[2] as HTMLSelectElement).value).toBe("debit");
      expect((selects[3] as HTMLSelectElement).value).toBe("credit");
    });
  });

  it("enables Preview button when required columns are mapped", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv("Date,Description,Amount\n2026-01-15,Coffee,4.50\n");

    await waitFor(() => {
      const previewBtn = screen.getByText("Preview");
      expect(previewBtn).not.toBeDisabled();
    });
  });

  it("enables Preview button with debit/credit columns instead of amount", async () => {
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Details,Debit,Credit\n2026-01-15,Coffee,4.50,\n",
    );

    await waitFor(() => {
      const previewBtn = screen.getByText("Preview");
      expect(previewBtn).not.toBeDisabled();
    });
  });

  it("shows preview with mapped transactions", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee Shop,4.50\n2026-01-16,Grocery Store,42.00\n",
    );

    await waitFor(() => {
      expect(screen.getByText("Preview")).not.toBeDisabled();
    });
    await user.click(screen.getByText("Preview"));

    await waitFor(() => {
      expect(screen.getByText(/2 transactions ready to import/)).toBeInTheDocument();
      expect(screen.getByText("Coffee Shop")).toBeInTheDocument();
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });
  });

  it("shows result step after successful import", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => expect(screen.getByText("Preview")).not.toBeDisabled());
    await user.click(screen.getByText("Preview"));

    await waitFor(() => expect(screen.getByText(/Import 2/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 2/));

    await waitFor(() => {
      expect(screen.getByText("Import Complete")).toBeInTheDocument();
      expect(screen.getByText("2 imported")).toBeInTheDocument();
    });
  });

  it("displays skipped duplicates in result", async () => {
    mockApi.streamImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 1,
      skipped: 1,
      categorized: 0,
      errors: [],
    });
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n2026-01-16,Grocery,42.00\n",
    );

    await waitFor(() => expect(screen.getByText("Preview")).not.toBeDisabled());
    await user.click(screen.getByText("Preview"));
    await waitFor(() => expect(screen.getByText(/Import 2/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 2/));

    await waitFor(() => {
      expect(screen.getByText("1 imported")).toBeInTheDocument();
      expect(screen.getByText("1 duplicates skipped")).toBeInTheDocument();
    });
  });

  it("displays errors in result step", async () => {
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
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => expect(screen.getByText("Preview")).not.toBeDisabled());
    await user.click(screen.getByText("Preview"));
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => {
      expect(screen.getByText(/1 error/)).toBeInTheDocument();
      expect(screen.getByText("Row 1: invalid date 'bad'")).toBeInTheDocument();
    });
  });

  it("calls onClose when Done is clicked after import", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => expect(screen.getByText("Preview")).not.toBeDisabled());
    await user.click(screen.getByText("Preview"));
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    await user.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates back from map to upload step", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={1} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => expect(screen.getByText("Back")).toBeInTheDocument());
    await user.click(screen.getByText("Back"));

    await waitFor(() => {
      expect(screen.getByText("Drag & drop a CSV file here")).toBeInTheDocument();
    });
  });

  it("sends correct payload to streamImportTransactions", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CsvImportDialog accountId={42} accountName="Test" onClose={onClose} />,
    );
    await uploadCsv(
      "Date,Description,Amount,Category\n2026-01-15,Coffee Shop,4.50,Food\n",
    );

    await waitFor(() => expect(screen.getByText("Preview")).not.toBeDisabled());
    await user.click(screen.getByText("Preview"));
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => {
      expect(mockApi.streamImportTransactions).toHaveBeenCalledWith(
        42,
        [
          {
            date: "2026-01-15",
            amount: 4.50,
            merchant_name: "Coffee Shop",
            category: "Food",
          },
        ],
        expect.any(Function),
      );
    });
  });
});
