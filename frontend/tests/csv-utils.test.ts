import { describe, it, expect } from "vitest";
import {
  parseCsv,
  guessRole,
  normalizeDate,
  buildMappedRows,
  buildBulkMappedRows,
  levenshteinDistance,
  matchCategories,
  type ColumnRole,
} from "@/lib/csv-utils";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    const rows = parseCsv('Date,"Merchant, Inc.",Amount\n2026-01-01,"Coffee, Ltd.",42.50\n');
    expect(rows[1]).toEqual(["2026-01-01", "Coffee, Ltd.", "42.50"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCsv('a,"say ""hello""",c\n');
    expect(rows[0][1]).toBe('say "hello"');
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("skips empty rows", () => {
    const rows = parseCsv("a,b\n\n1,2\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("trims whitespace from fields", () => {
    const rows = parseCsv("  date , amount \n 2026-01-01 , 10 \n");
    expect(rows[0]).toEqual(["date", "amount"]);
    expect(rows[1]).toEqual(["2026-01-01", "10"]);
  });
});

describe("guessRole", () => {
  it("detects date headers", () => {
    expect(guessRole("Date")).toBe("date");
    expect(guessRole("Posted Date")).toBe("date");
    expect(guessRole("Transaction Date")).toBe("date");
  });

  it("detects merchant/description headers", () => {
    expect(guessRole("Description")).toBe("merchant");
    expect(guessRole("Merchant Name")).toBe("merchant");
    expect(guessRole("Memo")).toBe("merchant");
    expect(guessRole("Payee")).toBe("merchant");
    expect(guessRole("Details")).toBe("merchant");
    expect(guessRole("Narration")).toBe("merchant");
  });

  it("detects debit headers separately from amount", () => {
    expect(guessRole("Debit")).toBe("debit");
    expect(guessRole("Withdrawal")).toBe("debit");
  });

  it("detects credit headers separately from amount", () => {
    expect(guessRole("Credit")).toBe("credit");
    expect(guessRole("Deposit")).toBe("credit");
  });

  it("detects single amount headers", () => {
    expect(guessRole("Amount")).toBe("amount");
    expect(guessRole("Sum")).toBe("amount");
    expect(guessRole("Value")).toBe("amount");
  });

  it("detects category headers", () => {
    expect(guessRole("Category")).toBe("category");
  });

  it("detects account headers", () => {
    expect(guessRole("Account")).toBe("account");
    expect(guessRole("Account Name")).toBe("account");
  });

  it("detects notes headers", () => {
    expect(guessRole("Notes")).toBe("notes");
    expect(guessRole("Note")).toBe("notes");
  });

  it("detects original statement headers", () => {
    expect(guessRole("Original Statement")).toBe("original_statement");
    expect(guessRole("Original Stmt")).toBe("original_statement");
  });

  it("detects owner headers", () => {
    expect(guessRole("Owner")).toBe("owner");
  });

  it("returns skip for unrecognized headers", () => {
    expect(guessRole("Reference")).toBe("skip");
    expect(guessRole("Balance")).toBe("skip");
    expect(guessRole("Tags")).toBe("skip");
  });
});

describe("normalizeDate", () => {
  it("passes through ISO format", () => {
    expect(normalizeDate("2026-03-15")).toBe("2026-03-15");
  });

  it("converts MM/DD/YYYY", () => {
    expect(normalizeDate("03/15/2026")).toBe("2026-03-15");
  });

  it("converts MM-DD-YYYY", () => {
    expect(normalizeDate("03-15-2026")).toBe("2026-03-15");
  });

  it("converts short year MM/DD/YY", () => {
    expect(normalizeDate("03/15/26")).toBe("2026-03-15");
  });

  it("treats short years > 50 as 19xx", () => {
    expect(normalizeDate("01/01/99")).toBe("1999-01-01");
  });

  it("pads single-digit months and days", () => {
    expect(normalizeDate("3/5/2026")).toBe("2026-03-05");
  });

  it("returns null for invalid dates", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("buildMappedRows", () => {
  it("maps rows using a single amount column", () => {
    const rows = [
      ["Date", "Description", "Amount"],
      ["2026-01-15", "Coffee Shop", "4.50"],
      ["2026-01-16", "Grocery Store", "42.00"],
    ];
    const roles: ("date" | "merchant" | "amount")[] = ["date", "merchant", "amount"];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toEqual({
      date: "2026-01-15",
      amount: 4.50,
      merchant_name: "Coffee Shop",
    });
  });

  it("maps rows using separate debit/credit columns", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit"],
      ["2026-01-15", "Coffee Shop", "4.50", ""],
      ["2026-01-16", "Employer Payroll", "", "1500.00"],
    ];
    const roles: ("date" | "merchant" | "debit" | "credit")[] = [
      "date", "merchant", "debit", "credit",
    ];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(2);
    expect(mapped[0].amount).toBe(4.50);
    expect(mapped[1].amount).toBe(-1500.00);
  });

  it("skips rows where both debit and credit are zero", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit"],
      ["2026-01-15", "Zero Row", "0", "0"],
      ["2026-01-16", "Valid Debit", "10.00", ""],
    ];
    const roles: ("date" | "merchant" | "debit" | "credit")[] = [
      "date", "merchant", "debit", "credit",
    ];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].merchant_name).toBe("Valid Debit");
  });

  it("includes optional category column", () => {
    const rows = [
      ["Date", "Description", "Amount", "Category"],
      ["2026-01-15", "Coffee Shop", "4.50", "Food"],
    ];
    const roles: ("date" | "merchant" | "amount" | "category")[] = [
      "date", "merchant", "amount", "category",
    ];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped[0].category).toBe("Food");
  });

  it("strips dollar signs and commas from amounts", () => {
    const rows = [
      ["Date", "Desc", "Amount"],
      ["2026-01-15", "Rent", "$1,200.00"],
    ];
    const roles: ("date" | "merchant" | "amount")[] = ["date", "merchant", "amount"];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped[0].amount).toBe(1200.00);
  });

  it("skips rows with invalid dates", () => {
    const rows = [
      ["Date", "Desc", "Amount"],
      ["bad-date", "Shop", "10.00"],
      ["2026-01-15", "Valid", "20.00"],
    ];
    const roles: ("date" | "merchant" | "amount")[] = ["date", "merchant", "amount"];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].merchant_name).toBe("Valid");
  });

  it("skips rows with empty merchant", () => {
    const rows = [
      ["Date", "Desc", "Amount"],
      ["2026-01-15", "", "10.00"],
      ["2026-01-16", "Valid", "20.00"],
    ];
    const roles: ("date" | "merchant" | "amount")[] = ["date", "merchant", "amount"];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
  });

  it("handles credit-only mapping (no debit column)", () => {
    const rows = [
      ["Date", "Description", "Deposit"],
      ["2026-01-15", "Paycheck", "3000.00"],
    ];
    const roles: ("date" | "merchant" | "credit")[] = ["date", "merchant", "credit"];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].amount).toBe(-3000.00);
  });

  it("treats negative credit values as income (not expense)", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit"],
      ["2026-01-15", "Coffee Shop", "4.50", ""],
      ["2026-01-16", "Employer Payroll", "", "-1500.00"],
    ];
    const roles: ("date" | "merchant" | "debit" | "credit")[] = [
      "date", "merchant", "debit", "credit",
    ];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(2);
    expect(mapped[0].amount).toBe(4.50);
    expect(mapped[1].amount).toBe(-1500.00);
  });

  it("treats negative debit values as expenses", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit"],
      ["2026-01-15", "Refund", "-25.00", ""],
    ];
    const roles: ("date" | "merchant" | "debit" | "credit")[] = [
      "date", "merchant", "debit", "credit",
    ];
    const mapped = buildMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].amount).toBe(25.00);
  });

  it("negates all amounts when negateAmounts option is set", () => {
    const rows = [
      ["Date", "Description", "Amount"],
      ["2026-01-15", "Coffee Shop", "-25.00"],
      ["2026-01-16", "Employer Payroll", "1500.00"],
    ];
    const roles: ("date" | "merchant" | "amount")[] = ["date", "merchant", "amount"];
    const mapped = buildMappedRows(rows, roles, { negateAmounts: true });

    expect(mapped).toHaveLength(2);
    expect(mapped[0].amount).toBe(25.00);
    expect(mapped[1].amount).toBe(-1500.00);
  });

  it("negates debit/credit amounts when negateAmounts option is set", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit"],
      ["2026-01-15", "Coffee", "4.50", ""],
      ["2026-01-16", "Payroll", "", "1500.00"],
    ];
    const roles: ("date" | "merchant" | "debit" | "credit")[] = [
      "date", "merchant", "debit", "credit",
    ];
    const mapped = buildMappedRows(rows, roles, { negateAmounts: true });

    expect(mapped).toHaveLength(2);
    expect(mapped[0].amount).toBe(-4.50);
    expect(mapped[1].amount).toBe(1500.00);
  });
});

describe("buildBulkMappedRows", () => {
  it("maps rows with account, notes, and owner columns", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Account", "Notes", "Owner"],
      ["2026-01-15", "Coffee Shop", "4.50", "Visa", "morning run", "Alice"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "account", "notes", "owner"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toEqual({
      date: "2026-01-15",
      amount: 4.50,
      merchant_name: "Coffee Shop",
      account_name: "Visa",
      notes: "morning run",
      owner_name: "Alice",
    });
  });

  it("combines original_statement and notes into a single notes field", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Original Statement", "Notes"],
      ["2026-01-15", "Coffee", "4.50", "VISA PURCHASE 1234", "My note"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "original_statement", "notes"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped[0].notes).toBe("VISA PURCHASE 1234 | My note");
  });

  it("uses only original_statement when notes is empty", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Original Statement", "Notes"],
      ["2026-01-15", "Coffee", "4.50", "VISA PURCHASE 1234", ""],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "original_statement", "notes"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped[0].notes).toBe("VISA PURCHASE 1234");
  });

  it("handles rows without optional columns", () => {
    const rows = [
      ["Date", "Merchant", "Amount"],
      ["2026-01-15", "Coffee", "4.50"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].account_name).toBeUndefined();
    expect(mapped[0].notes).toBeUndefined();
    expect(mapped[0].owner_name).toBeUndefined();
  });

  it("includes category when mapped", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Category", "Account"],
      ["2026-01-15", "Grocery", "42.00", "Food", "Checking"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "category", "account"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped[0].category).toBe("Food");
    expect(mapped[0].account_name).toBe("Checking");
  });

  it("skips rows with invalid dates", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Account"],
      ["bad-date", "Shop", "10.00", "Visa"],
      ["2026-01-15", "Valid", "20.00", "Visa"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "account"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].merchant_name).toBe("Valid");
  });

  it("skips rows with empty merchant", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Account"],
      ["2026-01-15", "", "10.00", "Visa"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "account"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(0);
  });

  it("works with debit/credit columns", () => {
    const rows = [
      ["Date", "Merchant", "Debit", "Credit", "Account", "Owner"],
      ["2026-01-15", "Coffee", "4.50", "", "Visa", "Bob"],
      ["2026-01-16", "Payroll", "", "2000.00", "Checking", "Alice"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "debit", "credit", "account", "owner"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(2);
    expect(mapped[0].amount).toBe(4.50);
    expect(mapped[0].account_name).toBe("Visa");
    expect(mapped[0].owner_name).toBe("Bob");
    expect(mapped[1].amount).toBe(-2000.00);
    expect(mapped[1].account_name).toBe("Checking");
  });

  it("treats negative credit values as income in bulk rows", () => {
    const rows = [
      ["Date", "Merchant", "Debit", "Credit", "Account"],
      ["2026-01-15", "Payroll", "", "-2500.00", "Checking"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "debit", "credit", "account"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].amount).toBe(-2500.00);
    expect(mapped[0].account_name).toBe("Checking");
  });

  it("treats negative debit values as expenses in bulk rows", () => {
    const rows = [
      ["Date", "Merchant", "Debit", "Credit", "Account"],
      ["2026-01-15", "Refund", "-15.00", "", "Visa"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "debit", "credit", "account"];
    const mapped = buildBulkMappedRows(rows, roles);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].amount).toBe(15.00);
  });

  it("negates all amounts when negateAmounts option is set", () => {
    const rows = [
      ["Date", "Merchant", "Amount", "Account"],
      ["2026-01-15", "Coffee", "-25.00", "Visa"],
      ["2026-01-16", "Payroll", "1500.00", "Checking"],
    ];
    const roles: ColumnRole[] = ["date", "merchant", "amount", "account"];
    const mapped = buildBulkMappedRows(rows, roles, { negateAmounts: true });

    expect(mapped).toHaveLength(2);
    expect(mapped[0].amount).toBe(25.00);
    expect(mapped[0].account_name).toBe("Visa");
    expect(mapped[1].amount).toBe(-1500.00);
    expect(mapped[1].account_name).toBe("Checking");
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns length for empty vs non-empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("xyz", "")).toBe(3);
  });

  it("counts single character substitutions", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("counts insertions and deletions", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("handles completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
  });
});

describe("matchCategories", () => {
  const existing = ["Food & Dining", "Groceries", "Transportation", "Entertainment", "Shopping"];

  it("finds exact matches (case-insensitive)", () => {
    const result = matchCategories(["food & dining", "GROCERIES"], existing);
    expect(result).toHaveLength(2);
    expect(result[0].confidence).toBe("exact");
    expect(result[0].suggestion).toBe("Food & Dining");
    expect(result[0].isNew).toBe(false);
    expect(result[1].confidence).toBe("exact");
    expect(result[1].suggestion).toBe("Groceries");
  });

  it("finds substring matches", () => {
    const result = matchCategories(["Dining"], existing);
    expect(result[0].confidence).toBe("fuzzy");
    expect(result[0].suggestion).toBe("Food & Dining");
    expect(result[0].isNew).toBe(false);
  });

  it("finds fuzzy matches via Levenshtein", () => {
    const result = matchCategories(["Entertainmnt"], existing);
    expect(result[0].confidence).toBe("fuzzy");
    expect(result[0].suggestion).toBe("Entertainment");
    expect(result[0].isNew).toBe(false);
  });

  it("returns none for unmatched categories", () => {
    const result = matchCategories(["Crypto Fees"], existing);
    expect(result[0].confidence).toBe("none");
    expect(result[0].suggestion).toBeNull();
    expect(result[0].isNew).toBe(true);
  });

  it("handles empty inputs", () => {
    expect(matchCategories([], existing)).toEqual([]);
    const result = matchCategories(["Foo"], []);
    expect(result[0].confidence).toBe("none");
    expect(result[0].isNew).toBe(true);
  });

  it("preserves original CSV category name", () => {
    const result = matchCategories(["MY GROCERIES"], existing);
    expect(result[0].csvCategory).toBe("MY GROCERIES");
  });
});
