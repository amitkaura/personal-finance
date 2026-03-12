export interface Account {
  id: number;
  name: string;
  official_name: string | null;
  type: "depository" | "investment" | "credit" | "loan";
  subtype: string | null;
  current_balance: number;
  available_balance: number | null;
  credit_limit: number | null;
  currency_code: string | null;
  plaid_account_id: string;
}

export interface CreditAccountSummary {
  id: number;
  name: string;
  official_name: string | null;
  subtype: string | null;
  current_balance: number;
  available_balance: number | null;
  credit_limit: number | null;
}

export interface LoanAccountSummary {
  id: number;
  name: string;
  official_name: string | null;
  subtype: string | null;
  current_balance: number;
}

export interface AccountSummary {
  net_worth: number;
  total_balance: number;
  depository_balance: number;
  investment_balance: number;
  credit_balance: number;
  loan_balance: number;
  credit_accounts: CreditAccountSummary[];
  loan_accounts: LoanAccountSummary[];
  account_count: number;
}

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  merchant_name: string | null;
  category: string | null;
  pending_status: boolean;
  needs_review: boolean;
  account_id: number | null;
  plaid_transaction_id: string;
}
