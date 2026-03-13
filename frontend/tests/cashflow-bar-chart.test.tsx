import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CashFlowBarChart from "@/components/cashflow-bar-chart";
import CashFlowPage from "@/app/cashflow/page";
import { renderWithProviders, TEST_USER, TEST_SETTINGS } from "./helpers";
import type { Transaction } from "@/lib/types";

// ─── Hoisted mocks ──────────────────────────────────────────────────

const mockApi = vi.hoisted(() => ({
  getTransactions: vi.fn(),
  getAllTransactions: vi.fn(),
  getAccounts: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: TEST_USER, isLoading: false }),
}));

vi.mock("@/components/household-provider", () => ({
  useHousehold: () => ({
    household: null,
    partner: null,
    scope: "personal",
    setScope: vi.fn(),
    pendingInvitations: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@nivo/bar", () => ({
  ResponsiveBar: ({ data, keys, onClick, indexBy }: any) => (
    <div data-testid="nivo-bar-chart">
      {data.map((item: any, i: number) => (
        <div key={i} data-testid={`bar-group-${item[indexBy]}`}>
          {keys.map((key: string) => (
            <button
              key={key}
              data-testid={`bar-${item[indexBy]}-${key}`}
              onClick={(e) =>
                onClick?.(
                  {
                    id: key,
                    indexValue: item[indexBy],
                    value: item[key],
                    data: item,
                  },
                  e,
                )
              }
            >
              {item[indexBy]} {key}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}));

// ─── Fixtures ────────────────────────────────────────────────────────

function txn(
  overrides: Partial<Transaction> & Pick<Transaction, "id" | "date" | "amount">,
): Transaction {
  return {
    merchant_name: null,
    category: null,
    pending_status: false,
    account_id: 1,
    plaid_transaction_id: `plaid-${overrides.id}`,
    is_manual: false,
    notes: null,
    tags: [],
    ...overrides,
  };
}

const TRANSACTIONS: Transaction[] = [
  // Jan 2025 income (negative = money in, Plaid convention)
  txn({ id: 1, date: "2025-01-15", amount: -3000, merchant_name: "Employer Inc", category: "Salary" }),
  txn({ id: 2, date: "2025-01-20", amount: -500, merchant_name: "Freelance Co", category: "Freelance" }),
  // Jan 2025 expenses
  txn({ id: 3, date: "2025-01-05", amount: 80, merchant_name: "Grocery Store", category: "Groceries" }),
  txn({ id: 4, date: "2025-01-10", amount: 120, merchant_name: "Electric Co", category: "Utilities" }),
  // Feb 2025 income
  txn({ id: 5, date: "2025-02-15", amount: -3000, merchant_name: "Employer Inc", category: "Salary" }),
  // Feb 2025 expenses
  txn({ id: 6, date: "2025-02-08", amount: 60, merchant_name: "Grocery Store", category: "Groceries" }),
  txn({ id: 7, date: "2025-02-12", amount: 200, merchant_name: "Gas Station", category: "Transport" }),
];

// ─── Bar Chart Tests ─────────────────────────────────────────────────

describe("CashFlowBarChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getAllTransactions.mockResolvedValue(TRANSACTIONS);
  });

  it("renders the bar chart with period bars", async () => {
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });
    expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
    expect(screen.getByTestId("bar-Jan 2025-Expenses")).toBeInTheDocument();
    expect(screen.getByTestId("bar-Feb 2025-Income")).toBeInTheDocument();
    expect(screen.getByTestId("bar-Feb 2025-Expenses")).toBeInTheDocument();
  });

  it("drills into category view when clicking an Income bar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Jan 2025-Income"));

    await waitFor(() => {
      expect(screen.getByTestId("bar-Salary-amount")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Freelance-amount")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    expect(screen.queryByTestId("bar-Jan 2025-Income")).not.toBeInTheDocument();
  });

  it("drills into category view when clicking an Expenses bar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Expenses")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Jan 2025-Expenses"));

    await waitFor(() => {
      expect(screen.getByTestId("bar-Groceries-amount")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Utilities-amount")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("returns to overview when clicking back from category view", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Jan 2025-Income"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Feb 2025-Income")).toBeInTheDocument();
    });
  });

  it("drills into transaction list when clicking a category bar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Expenses")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Jan 2025-Expenses"));
    await waitFor(() => {
      expect(screen.getByTestId("bar-Groceries-amount")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Groceries-amount"));

    await waitFor(() => {
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("bar-Groceries-amount")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("returns to category view when clicking back from transaction list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Expenses")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Jan 2025-Expenses"));
    await waitFor(() => {
      expect(screen.getByTestId("bar-Groceries-amount")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Groceries-amount"));
    await waitFor(() => {
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByTestId("bar-Groceries-amount")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Utilities-amount")).toBeInTheDocument();
    });
  });

  it("limits monthly view to last 12 months by default", async () => {
    const manyMonths: Transaction[] = [];
    for (let m = 0; m < 15; m++) {
      const year = 2025 + Math.floor(m / 12);
      const month = (m % 12) + 1;
      const date = `${year}-${String(month).padStart(2, "0")}-15`;
      manyMonths.push(
        txn({ id: 100 + m, date, amount: -1000, merchant_name: "Employer", category: "Salary" }),
        txn({ id: 200 + m, date, amount: 50, merchant_name: "Store", category: "Groceries" }),
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(manyMonths);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    // 15 months: Jan 2025 – Mar 2026; last 12 = Apr 2025 – Mar 2026
    expect(screen.getByTestId("bar-Apr 2025-Income")).toBeInTheDocument();
    expect(screen.getByTestId("bar-Mar 2026-Income")).toBeInTheDocument();
    // Older months should be excluded
    expect(screen.queryByTestId("bar-Jan 2025-Income")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bar-Feb 2025-Income")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bar-Mar 2025-Income")).not.toBeInTheDocument();
  });

  it("limits quarterly view to last 4 quarters by default", async () => {
    const user = userEvent.setup();
    const sixQ: Transaction[] = [];
    for (let q = 0; q < 6; q++) {
      const year = 2025 + Math.floor(q / 4);
      const month = (q % 4) * 3 + 2;
      const date = `${year}-${String(month).padStart(2, "0")}-15`;
      sixQ.push(
        txn({ id: 300 + q, date, amount: -1000, merchant_name: "Employer", category: "Salary" }),
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(sixQ);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Quarterly"));
    await waitFor(() => {
      // 6 quarters: Q1–Q4 2025, Q1–Q2 2026; last 4 = Q3 2025 – Q2 2026
      expect(screen.getByTestId("bar-2025 Q3-Income")).toBeInTheDocument();
      expect(screen.getByTestId("bar-2026 Q2-Income")).toBeInTheDocument();
      expect(screen.queryByTestId("bar-2025 Q1-Income")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bar-2025 Q2-Income")).not.toBeInTheDocument();
    });
  });

  it("limits yearly view to last 5 years by default", async () => {
    const user = userEvent.setup();
    const sevenYears: Transaction[] = [];
    for (let y = 0; y < 7; y++) {
      const date = `${2020 + y}-06-15`;
      sevenYears.push(
        txn({ id: 400 + y, date, amount: -1000, merchant_name: "Employer", category: "Salary" }),
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(sevenYears);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Yearly"));
    await waitFor(() => {
      // 7 years: 2020–2026; last 5 = 2022–2026
      expect(screen.getByTestId("bar-2022-Income")).toBeInTheDocument();
      expect(screen.getByTestId("bar-2026-Income")).toBeInTheDocument();
      expect(screen.queryByTestId("bar-2020-Income")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bar-2021-Income")).not.toBeInTheDocument();
    });
  });

  it("shows all periods for a selected year (overrides window)", async () => {
    const user = userEvent.setup();
    const manyMonths: Transaction[] = [];
    for (let m = 0; m < 15; m++) {
      const year = 2025 + Math.floor(m / 12);
      const month = (m % 12) + 1;
      const date = `${year}-${String(month).padStart(2, "0")}-15`;
      manyMonths.push(
        txn({ id: 500 + m, date, amount: -1000, merchant_name: "Employer", category: "Salary" }),
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(manyMonths);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    // Select year 2025 explicitly — should show all 12 months in 2025
    await user.selectOptions(screen.getByDisplayValue(/Last 12 months/i), "2025");
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Dec 2025-Income")).toBeInTheDocument();
    });
  });

  it("shows empty state when no transactions", async () => {
    mockApi.getAllTransactions.mockResolvedValue([]);
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByText("No transaction data available.")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("nivo-bar-chart")).not.toBeInTheDocument();
  });

  it("shows uncategorized transactions as 'Uncategorized' in category drill-down", async () => {
    const user = userEvent.setup();
    const txnsWithUncategorized: Transaction[] = [
      txn({ id: 10, date: "2025-01-05", amount: 80, merchant_name: "Random Shop", category: null }),
      txn({ id: 11, date: "2025-01-10", amount: 120, merchant_name: "Electric Co", category: "Utilities" }),
    ];
    mockApi.getAllTransactions.mockResolvedValue(txnsWithUncategorized);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Expenses")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("bar-Jan 2025-Expenses"));

    await waitFor(() => {
      expect(screen.getByTestId("bar-Uncategorized-amount")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Utilities-amount")).toBeInTheDocument();
    });
  });

  it("filters by quarter when quarter dropdown is used", async () => {
    const user = userEvent.setup();
    const yearOfTxns: Transaction[] = [];
    for (let m = 0; m < 12; m++) {
      const date = `2025-${String(m + 1).padStart(2, "0")}-15`;
      yearOfTxns.push(
        txn({ id: 600 + m, date, amount: -1000, merchant_name: "Employer", category: "Salary" }),
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(yearOfTxns);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByDisplayValue(/Last 12 months/i), "2025");
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByDisplayValue("All Quarters"), "1");
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
      expect(screen.getByTestId("bar-Mar 2025-Income")).toBeInTheDocument();
      expect(screen.queryByTestId("bar-Apr 2025-Income")).not.toBeInTheDocument();
    });
  });

  it("filters by month when month dropdown is used", async () => {
    const user = userEvent.setup();
    const yearOfTxns: Transaction[] = [];
    for (let m = 0; m < 12; m++) {
      const date = `2025-${String(m + 1).padStart(2, "0")}-15`;
      yearOfTxns.push(
        txn({ id: 700 + m, date, amount: -1000, merchant_name: "Employer", category: "Salary" }),
      );
    }
    mockApi.getAllTransactions.mockResolvedValue(yearOfTxns);

    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByDisplayValue(/Last 12 months/i), "2025");
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByDisplayValue("All Months"), "0");
    await waitFor(() => {
      expect(screen.getByTestId("bar-Jan 2025-Income")).toBeInTheDocument();
      expect(screen.queryByTestId("bar-Feb 2025-Income")).not.toBeInTheDocument();
    });
  });

  it("shows breadcrumb navigation at each drill level", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CashFlowBarChart />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });

    expect(screen.getByText("Income vs Expenses")).toBeInTheDocument();

    await user.click(screen.getByTestId("bar-Jan 2025-Expenses"));
    await waitFor(() => {
      const breadcrumb = screen.getByLabelText("Breadcrumb");
      expect(breadcrumb).toHaveTextContent("Jan 2025");
      expect(breadcrumb).toHaveTextContent("Expenses");
    });

    await user.click(screen.getByTestId("bar-Groceries-amount"));
    await waitFor(() => {
      const breadcrumb = screen.getByLabelText("Breadcrumb");
      expect(breadcrumb).toHaveTextContent("Jan 2025");
      expect(breadcrumb).toHaveTextContent("Expenses");
      expect(breadcrumb).toHaveTextContent("Groceries");
    });
  });
});

// ─── Page-Level Tests ────────────────────────────────────────────────

describe("CashFlowPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getSettings.mockResolvedValue(TEST_SETTINGS);
    mockApi.getTransactions.mockResolvedValue(TRANSACTIONS);
    mockApi.getAllTransactions.mockResolvedValue(TRANSACTIONS);
    mockApi.getAccounts.mockResolvedValue([]);
  });

  it("renders the cash flow bar chart when transactions exist", async () => {
    renderWithProviders(<CashFlowPage />);
    await waitFor(() => {
      expect(screen.getByTestId("nivo-bar-chart")).toBeInTheDocument();
    });
  });

  it("shows empty state when no transactions exist", async () => {
    mockApi.getTransactions.mockResolvedValue([]);
    mockApi.getAllTransactions.mockResolvedValue([]);
    renderWithProviders(<CashFlowPage />);
    await waitFor(() => {
      expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("nivo-bar-chart")).not.toBeInTheDocument();
  });
});
