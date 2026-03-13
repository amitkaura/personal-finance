import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BulkCsvImportDialog from "@/components/bulk-csv-import-dialog";
import {
  renderWithProviders,
  TEST_HOUSEHOLD,
} from "./helpers";
import type { Household, HouseholdInvitation, ViewScope } from "@/lib/types";

const mockApi = vi.hoisted(() => ({
  bulkImportTransactions: vi.fn(),
  getAccounts: vi.fn(),
  getUserCategories: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

const mockHouseholdState = vi.hoisted(() => ({
  value: {} as {
    household: Household | null;
    partner: Record<string, unknown> | null;
    scope: ViewScope;
    setScope: () => void;
    pendingInvitations: HouseholdInvitation[];
    isLoading: boolean;
    refetch: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => mockHouseholdState.value,
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

describe("BulkCsvImportDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockHouseholdState.value = {
      household: null,
      partner: null,
      scope: "personal",
      setScope: vi.fn(),
      pendingInvitations: [],
      isLoading: false,
      refetch: vi.fn(),
    };
    mockApi.getAccounts.mockResolvedValue([]);
    mockApi.getUserCategories.mockResolvedValue([
      { id: 1, name: "Food & Dining" },
      { id: 2, name: "Groceries" },
      { id: 3, name: "Shopping" },
    ]);
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 2,
      skipped: 0,
      categorized: 0,
      errors: [],
    });
  });

  it("renders upload step initially", () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    expect(screen.getByText("Bulk Import Transactions")).toBeInTheDocument();
    expect(screen.getByText("Drag & drop a CSV file here")).toBeInTheDocument();
    expect(screen.getByText("Choose File")).toBeInTheDocument();
  });

  it("shows error for CSV with only header", async () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv("Date,Merchant,Amount\n");

    await waitFor(() => {
      expect(
        screen.getByText("CSV must have at least a header row and one data row."),
      ).toBeInTheDocument();
    });
  });

  it("advances to mapping step after valid file upload", async () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n",
    );

    await waitFor(() => {
      expect(screen.getByText(/Assign a role to each column/)).toBeInTheDocument();
    });
  });

  it("auto-detects new column roles (account, notes, owner)", async () => {
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account,Notes,Owner\n2026-01-15,Coffee,4.50,Visa,memo,Alice\n",
    );

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect(selects).toHaveLength(6);
      expect((selects[0] as HTMLSelectElement).value).toBe("date");
      expect((selects[1] as HTMLSelectElement).value).toBe("merchant");
      expect((selects[2] as HTMLSelectElement).value).toBe("amount");
      expect((selects[3] as HTMLSelectElement).value).toBe("account");
      expect((selects[4] as HTMLSelectElement).value).toBe("notes");
      expect((selects[5] as HTMLSelectElement).value).toBe("owner");
    });
  });

  it("advances to accounts step after column mapping", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText(/1 account/)).toBeInTheDocument();
      expect(screen.getByText("Visa")).toBeInTheDocument();
      expect(screen.getByText("New")).toBeInTheDocument();
    });
  });

  it("shows existing badge for already-existing accounts", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Visa", type: "credit" },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("Exists")).toBeInTheDocument();
    });
  });

  it("skips owners step when no household", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());
    await user.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText(/ready to import/)).toBeInTheDocument();
      expect(screen.getByText("Coffee")).toBeInTheDocument();
    });
  });

  it("shows owners step when household exists and CSV has owner column", async () => {
    mockHouseholdState.value.household = TEST_HOUSEHOLD;
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account,Owner\n2026-01-15,Coffee,4.50,Visa,Alice Smith\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => {
      expect(screen.getByText("CSV Owner")).toBeInTheDocument();
      expect(screen.getByText("Household Member")).toBeInTheDocument();
    });
  });

  it("shows preview with transaction count and account breakdown", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n2026-01-16,Grocery,42.00,Checking\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());
    const nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/2 transactions ready to import/)).toBeInTheDocument();
      expect(screen.getByText("Coffee")).toBeInTheDocument();
      expect(screen.getByText("Grocery")).toBeInTheDocument();
    });
  });

  it("shows result step after successful import", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n2026-01-16,Grocery,42.00,Visa\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());
    const nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/Import 2/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 2/));

    await waitFor(() => {
      expect(screen.getByText("Import Complete")).toBeInTheDocument();
      expect(screen.getByText("2 imported")).toBeInTheDocument();
    });
  });

  it("sends correct payload to bulkImportTransactions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account,Category\n2026-01-15,Coffee,4.50,Visa,Food\n",
    );

    // Map columns -> Accounts
    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());

    // Accounts -> Categories
    let nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/unique categor/)).toBeInTheDocument());

    // Categories -> Preview
    nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => {
      expect(mockApi.bulkImportTransactions).toHaveBeenCalled();
      const payload = mockApi.bulkImportTransactions.mock.calls[0][0];
      expect(payload.accounts).toEqual([{ name: "Visa", type: "depository" }]);
      expect(payload.transactions).toHaveLength(1);
      expect(payload.transactions[0].merchant_name).toBe("Coffee");
    });
  });

  it("does not include existing accounts in payload", async () => {
    mockApi.getAccounts.mockResolvedValue([
      { id: 1, name: "Visa", type: "credit" },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Exists")).toBeInTheDocument());
    const nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => {
      const payload = mockApi.bulkImportTransactions.mock.calls[0][0];
      expect(payload.accounts).toEqual([]);
    });
  });

  it("displays errors in result step", async () => {
    mockApi.bulkImportTransactions.mockResolvedValue({
      type: "complete",
      imported: 0,
      skipped: 0,
      categorized: 0,
      errors: ["Row 1: unknown account 'Missing'"],
    });
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    const nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => {
      expect(screen.getByText(/1 error/)).toBeInTheDocument();
      expect(screen.getByText("Row 1: unknown account 'Missing'")).toBeInTheDocument();
    });
  });

  it("calls onClose when Done is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    const nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/Import 1/)).not.toBeDisabled());
    await user.click(screen.getByText(/Import 1/));

    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    await user.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates back from columns to upload", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount\n2026-01-15,Coffee,4.50\n",
    );

    await waitFor(() => expect(screen.getByText("Back")).toBeInTheDocument());
    await user.click(screen.getByText("Back"));

    await waitFor(() => {
      expect(screen.getByText("Drag & drop a CSV file here")).toBeInTheDocument();
    });
  });

  it("navigates back from accounts to columns", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account\n2026-01-15,Coffee,4.50,Visa\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());

    await user.click(screen.getByText("Back"));

    await waitFor(() => {
      expect(screen.getByText(/Assign a role to each column/)).toBeInTheDocument();
    });
  });

  it("shows Exact badge for categories matching existing ones", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account,Category\n2026-01-15,Coffee,4.50,Visa,Groceries\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());

    let nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/unique categor/)).toBeInTheDocument();
      expect(screen.getByText("Exact")).toBeInTheDocument();
    });
  });

  it("shows New badge for unmatched categories", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account,Category\n2026-01-15,Coffee,4.50,Visa,Crypto Fees\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());

    let nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/unique categor/)).toBeInTheDocument();
      expect(screen.getByText("New")).toBeInTheDocument();
      expect(screen.getByText("Crypto Fees")).toBeInTheDocument();
    });
  });

  it("shows ~Fuzzy badge for close-but-not-exact category matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BulkCsvImportDialog onClose={onClose} />);
    await uploadCsv(
      "Date,Merchant,Amount,Account,Category\n2026-01-15,Coffee,4.50,Visa,Shoping\n",
    );

    await waitFor(() => expect(screen.getByText("Next")).not.toBeDisabled());
    await user.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Visa")).toBeInTheDocument());

    let nextButtons = screen.getAllByText("Next");
    await user.click(nextButtons[nextButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/unique categor/)).toBeInTheDocument();
      expect(screen.getByText("~Fuzzy")).toBeInTheDocument();
    });
  });
});
