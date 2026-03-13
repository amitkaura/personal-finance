// ── Fuzzy category matching ──────────────────────────────────

export interface CategoryMatch {
  csvCategory: string;
  suggestion: string | null;
  confidence: "exact" | "fuzzy" | "none";
  isNew: boolean;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function matchCategories(
  csvCategories: string[],
  existingCategories: string[],
): CategoryMatch[] {
  const existingLower = existingCategories.map((c) => c.toLowerCase());

  return csvCategories.map((csv) => {
    const csvLower = csv.toLowerCase();

    // 1. Exact match (case-insensitive)
    const exactIdx = existingLower.indexOf(csvLower);
    if (exactIdx !== -1) {
      return { csvCategory: csv, suggestion: existingCategories[exactIdx], confidence: "exact" as const, isNew: false };
    }

    // 2. Substring containment
    const substringIdx = existingLower.findIndex(
      (e) => e.includes(csvLower) || csvLower.includes(e),
    );
    if (substringIdx !== -1) {
      return { csvCategory: csv, suggestion: existingCategories[substringIdx], confidence: "fuzzy" as const, isNew: false };
    }

    // 3. Levenshtein distance (normalized <= 0.3 → 70%+ similarity)
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < existingLower.length; i++) {
      const dist = levenshteinDistance(csvLower, existingLower[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    const maxLen = Math.max(csvLower.length, existingLower[bestIdx]?.length ?? 1);
    if (bestIdx !== -1 && bestDist / maxLen <= 0.3) {
      return { csvCategory: csv, suggestion: existingCategories[bestIdx], confidence: "fuzzy" as const, isNew: false };
    }

    // 4. No match
    return { csvCategory: csv, suggestion: null, confidence: "none" as const, isNew: true };
  });
}

// ── CSV parsing and row mapping ──────────────────────────────

export type ColumnRole =
  | "date" | "merchant" | "amount" | "debit" | "credit"
  | "category" | "account" | "notes" | "original_statement" | "owner" | "skip";

export const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: "skip", label: "Skip" },
  { value: "date", label: "Date" },
  { value: "merchant", label: "Description / Merchant" },
  { value: "amount", label: "Amount (single column)" },
  { value: "debit", label: "Debit / Withdrawal" },
  { value: "credit", label: "Credit / Deposit" },
  { value: "category", label: "Category" },
  { value: "account", label: "Account" },
  { value: "notes", label: "Notes" },
  { value: "original_statement", label: "Original Statement" },
  { value: "owner", label: "Owner" },
];

export interface MappedRow {
  date: string;
  amount: number;
  merchant_name: string;
  category?: string;
}

export interface BulkMappedRow extends MappedRow {
  account_name?: string;
  notes?: string;
  owner_name?: string;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let fields: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      fields.push(current.trim());
      if (fields.some((f) => f !== "")) rows.push(fields);
      fields = [];
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  if (fields.some((f) => f !== "")) rows.push(fields);
  return rows;
}

export function guessRole(header: string): ColumnRole {
  const h = header.toLowerCase();
  if (/date|posted|trans.*date/i.test(h)) return "date";
  if (/desc|merchant|memo|narration|payee|detail/i.test(h)) return "merchant";
  if (/\bdebit\b|withdraw/i.test(h)) return "debit";
  if (/\bcredit\b|\bdeposit\b/i.test(h)) return "credit";
  if (/amount|sum|value/i.test(h)) return "amount";
  if (/categ/i.test(h)) return "category";
  if (/\baccount\b/i.test(h)) return "account";
  if (/original.?\bst(?:at|mt)/i.test(h)) return "original_statement";
  if (/\bnotes?\b/i.test(h)) return "notes";
  if (/\bowner\b/i.test(h)) return "owner";
  return "skip";
}

export function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return trimmed;

  const slashMdy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMdy) {
    const [, m, d, y] = slashMdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const slashMdy2 = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (slashMdy2) {
    const [, m, d, y] = slashMdy2;
    const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export interface MappingOptions {
  negateAmounts?: boolean;
}

export function buildMappedRows(
  rawRows: string[][],
  columnRoles: ColumnRole[],
  options?: MappingOptions,
): MappedRow[] {
  const dateIdx = columnRoles.indexOf("date");
  const merchantIdx = columnRoles.indexOf("merchant");
  const amountIdx = columnRoles.indexOf("amount");
  const debitIdx = columnRoles.indexOf("debit");
  const creditIdx = columnRoles.indexOf("credit");
  const categoryIdx = columnRoles.indexOf("category");

  const dataRows = rawRows.slice(1);
  const mapped: MappedRow[] = [];

  for (const row of dataRows) {
    const rawDate = row[dateIdx] ?? "";
    const date = normalizeDate(rawDate);
    if (!date) continue;

    let amount: number;

    if (amountIdx >= 0) {
      const rawAmount = (row[amountIdx] ?? "").replace(/[$,\s]/g, "");
      amount = parseFloat(rawAmount);
      if (isNaN(amount)) continue;
    } else {
      const rawDebit = (debitIdx >= 0 ? row[debitIdx] ?? "" : "").replace(/[$,\s]/g, "");
      const rawCredit = (creditIdx >= 0 ? row[creditIdx] ?? "" : "").replace(/[$,\s]/g, "");
      const debit = Math.abs(parseFloat(rawDebit) || 0);
      const credit = Math.abs(parseFloat(rawCredit) || 0);

      if (debit === 0 && credit === 0) continue;

      // Positive = expense (debit), negative = income (credit)
      amount = debit > 0 ? debit : -credit;
    }

    const merchant = row[merchantIdx]?.trim();
    if (!merchant) continue;

    if (options?.negateAmounts) amount = -amount;

    const entry: MappedRow = { date, amount, merchant_name: merchant };
    if (categoryIdx >= 0 && row[categoryIdx]?.trim()) {
      entry.category = row[categoryIdx].trim();
    }
    mapped.push(entry);
  }
  return mapped;
}

export function buildBulkMappedRows(
  rawRows: string[][],
  columnRoles: ColumnRole[],
  options?: MappingOptions,
): BulkMappedRow[] {
  const dateIdx = columnRoles.indexOf("date");
  const merchantIdx = columnRoles.indexOf("merchant");
  const amountIdx = columnRoles.indexOf("amount");
  const debitIdx = columnRoles.indexOf("debit");
  const creditIdx = columnRoles.indexOf("credit");
  const categoryIdx = columnRoles.indexOf("category");
  const accountIdx = columnRoles.indexOf("account");
  const notesIdx = columnRoles.indexOf("notes");
  const origStmtIdx = columnRoles.indexOf("original_statement");
  const ownerIdx = columnRoles.indexOf("owner");

  const dataRows = rawRows.slice(1);
  const mapped: BulkMappedRow[] = [];

  for (const row of dataRows) {
    const rawDate = row[dateIdx] ?? "";
    const date = normalizeDate(rawDate);
    if (!date) continue;

    let amount: number;

    if (amountIdx >= 0) {
      const rawAmount = (row[amountIdx] ?? "").replace(/[$,\s]/g, "");
      amount = parseFloat(rawAmount);
      if (isNaN(amount)) continue;
    } else {
      const rawDebit = (debitIdx >= 0 ? row[debitIdx] ?? "" : "").replace(/[$,\s]/g, "");
      const rawCredit = (creditIdx >= 0 ? row[creditIdx] ?? "" : "").replace(/[$,\s]/g, "");
      const debit = Math.abs(parseFloat(rawDebit) || 0);
      const credit = Math.abs(parseFloat(rawCredit) || 0);

      if (debit === 0 && credit === 0) continue;
      amount = debit > 0 ? debit : -credit;
    }

    const merchant = row[merchantIdx]?.trim();
    if (!merchant) continue;

    if (options?.negateAmounts) amount = -amount;

    const entry: BulkMappedRow = { date, amount, merchant_name: merchant };
    if (categoryIdx >= 0 && row[categoryIdx]?.trim()) {
      entry.category = row[categoryIdx].trim();
    }
    if (accountIdx >= 0 && row[accountIdx]?.trim()) {
      entry.account_name = row[accountIdx].trim();
    }

    const noteParts: string[] = [];
    if (origStmtIdx >= 0 && row[origStmtIdx]?.trim()) {
      noteParts.push(row[origStmtIdx].trim());
    }
    if (notesIdx >= 0 && row[notesIdx]?.trim()) {
      noteParts.push(row[notesIdx].trim());
    }
    if (noteParts.length > 0) {
      entry.notes = noteParts.join(" | ");
    }

    if (ownerIdx >= 0 && row[ownerIdx]?.trim()) {
      entry.owner_name = row[ownerIdx].trim();
    }

    mapped.push(entry);
  }
  return mapped;
}
