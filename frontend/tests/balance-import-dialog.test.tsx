import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BalanceImportDialog from "@/components/balance-import-dialog";
import { renderWithProviders, TEST_ACCOUNT } from "./helpers";

const mockApi = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  importBalances: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

function makeCsvFile(content: string, name = "balances.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

async function uploadCsv(content: string) {
  const file = makeCsvFile(content);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await waitFor(() => expect(input).toBeTruthy());
  fireEvent.change(input, { target: { files: [file] } });
}

describe("BalanceImportDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getAccounts.mockResolvedValue([TEST_ACCOUNT]);
    mockApi.importBalances.mockResolvedValue({
      imported: 2,
      accounts_created: 1,
      snapshots_updated: 2,
    });
  });

  it("renders upload step with title and file picker", () => {
    renderWithProviders(<BalanceImportDialog onClose={onClose} />);
    expect(screen.getByText(/Import Balance History/)).toBeInTheDocument();
    expect(screen.getByText("Choose CSV file")).toBeInTheDocument();
  });

  it("shows column mapping after uploading a valid CSV", async () => {
    renderWithProviders(<BalanceImportDialog onClose={onClose} />);
    await uploadCsv("Date,Balance,Account\n2025-01-01,10000,RRSP\n2025-02-01,11000,RRSP\n");

    await waitFor(() => {
      expect(screen.getByText(/Map Columns/)).toBeInTheDocument();
    });
  });

  it("shows error for CSV with only a header row", async () => {
    renderWithProviders(<BalanceImportDialog onClose={onClose} />);
    await uploadCsv("Date,Balance,Account\n");

    await waitFor(() => {
      expect(screen.getByText(/at least one data row/i)).toBeInTheDocument();
    });
  });

  it("shows account matching step after column mapping", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BalanceImportDialog onClose={onClose} />);
    await uploadCsv("Date,Balance,Account\n2025-01-01,10000,RRSP\n");

    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText(/Match Accounts/)).toBeInTheDocument();
      const rrspElements = screen.getAllByText("RRSP");
      expect(rrspElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls importBalances API on submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BalanceImportDialog onClose={onClose} />);
    await uploadCsv("Date,Balance,Account\n2025-01-01,10000,RRSP\n");

    await waitFor(() => expect(screen.getByText("Next")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText(/Match Accounts/)).toBeInTheDocument());

    await waitFor(() => expect(screen.getByText("Import")).toBeInTheDocument());
    await user.click(screen.getByText("Import"));

    await waitFor(() => {
      expect(mockApi.importBalances).toHaveBeenCalledTimes(1);
    });
  });
});
