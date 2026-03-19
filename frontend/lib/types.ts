export type ViewScope = "personal" | "partner" | "household";

export interface Account {
  id: number;
  user_id: number;
  name: string;
  official_name: string | null;
  type: "depository" | "investment" | "credit" | "loan" | "real_estate";
  subtype: string | null;
  current_balance: number;
  available_balance: number | null;
  credit_limit: number | null;
  currency_code: string | null;
  plaid_account_id: string;
  plaid_item_id: number | null;
  is_linked: boolean;
  statement_available_day?: number | null;
  owner_name?: string;
  owner_picture?: string | null;
}

export interface PlaidConnectionAccount {
  id: number;
  name: string;
  type: string;
  subtype: string | null;
  current_balance: number;
  is_linked: boolean;
}

export interface PlaidConnection {
  id: number;
  item_id: string;
  institution_name: string | null;
  owner_name?: string;
  owner_picture?: string | null;
  accounts: PlaidConnectionAccount[];
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
  real_estate_balance: number;
  credit_accounts: CreditAccountSummary[];
  loan_accounts: LoanAccountSummary[];
  account_count: number;
}

export interface TagInfo {
  id: number;
  name: string;
  color: string;
}

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  merchant_name: string | null;
  category: string | null;
  pending_status: boolean;
  account_id: number | null;
  plaid_transaction_id: string;
  owner_name?: string;
  owner_picture?: string | null;
  is_manual: boolean;
  notes: string | null;
  tags: TagInfo[];
}

export interface Budget {
  id: number;
  category: string;
  amount: number;
  month: string;
  rollover: boolean;
  household_id?: number | null;
}

export interface BudgetSummaryItem {
  id: number;
  category: string;
  budgeted: number;
  rollover: number;
  effective_budget: number;
  spent: number;
  remaining: number;
  percent_used: number;
  breakdown?: Record<string, number>;
}

export interface BudgetSectionSummary {
  items: BudgetSummaryItem[];
  total_budgeted: number;
  total_spent: number;
  total_remaining: number;
}

export interface BudgetSummary {
  month: string;
  items: BudgetSummaryItem[];
  total_budgeted: number;
  total_spent: number;
  total_remaining: number;
  sections?: {
    personal: BudgetSectionSummary;
    partner: BudgetSectionSummary;
    shared: BudgetSectionSummary;
  };
  shared_summary?: BudgetSectionSummary | null;
}

export interface SpendingPreference {
  category: string;
  target: "personal" | "shared";
}

export interface BudgetConflict {
  category: string;
  current_preference: "personal" | "shared" | null;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  icon: string;
  color: string;
  is_completed: boolean;
  progress: number;
  remaining: number;
  months_left: number | null;
  monthly_needed: number | null;
  created_at: string;
  household_id?: number | null;
  linked_account_ids?: number[];
  is_account_linked?: boolean;
}

export interface GoalsResponse {
  goals: Goal[];
  shared_goals_summary: {
    count: number;
    total_progress_pct: number;
  } | null;
}

export interface GoalContribution {
  id: number;
  goal_id: number;
  user_id: number;
  user_name: string;
  user_picture: string | null;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface SpendingCategory {
  category: string;
  amount: number;
  percent: number;
}

export interface SpendingByCategory {
  period_months: number;
  total_expenses: number;
  total_income: number;
  categories: SpendingCategory[];
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface TopMerchant {
  merchant: string;
  total: number;
  count: number;
  category: string | null;
}

export interface NetWorthSnapshot {
  date: string;
  assets: number;
  liabilities: number;
  net_worth: number;
}

export interface RecurringTransaction {
  merchant_name: string;
  category: string | null;
  latest_amount: number;
  average_amount: number;
  is_consistent_amount: boolean;
  frequency: string;
  occurrence_count: number;
  last_date: string;
  next_expected: string | null;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface UserSettings {
  currency: string;
  date_format: string;
  locale: string;
}

export interface SyncConfig {
  configured: boolean;
  sync_enabled: boolean | null;
  sync_hour: number | null;
  sync_minute: number | null;
  sync_timezone: string | null;
}

export interface CategoryRule {
  id: number;
  keyword: string;
  category: string;
  case_sensitive: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  google_name: string;
  google_picture: string | null;
  is_admin?: boolean;
  is_protected?: boolean;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  google_name: string;
  google_picture: string | null;
}

export interface HouseholdMember {
  id: number;
  user_id: number;
  name: string;
  email: string;
  picture: string | null;
  role: string;
}

export interface Household {
  id: number;
  name: string;
  members: HouseholdMember[];
  pending_invitations: { id: number; token: string; invited_email: string; status: string }[];
}

export interface HouseholdInvitation {
  id: number;
  token: string;
  household_name: string;
  invited_by_name: string;
  invited_by_picture: string | null;
  status: string;
}

export interface LLMConfig {
  configured: boolean;
  llm_base_url: string | null;
  llm_model: string | null;
  api_key_last4: string | null;
  batch_size?: number;
}

export interface PlaidConfig {
  configured: boolean;
  plaid_env: string | null;
  client_id_last4: string | null;
  secret_last4: string | null;
}

export interface PlaidModeResponse {
  mode: "managed" | "byok" | null;
  managed_available: boolean;
  managed_plaid_env: string | null;
  has_linked_accounts: boolean;
}

export interface AdminPlaidConfig {
  configured: boolean;
  enabled: boolean;
  plaid_env: string | null;
  client_id_last4: string | null;
  secret_last4: string | null;
  managed_household_count: number;
}

export const PLAID_MODES = { MANAGED: "managed", BYOK: "byok" } as const;

export interface AdminLLMConfig {
  configured: boolean;
  enabled: boolean;
  llm_base_url: string | null;
  llm_model: string | null;
  api_key_last4: string | null;
  batch_size: number;
  managed_household_count: number;
}

export interface LLMModeResponse {
  mode: "managed" | "byok" | "none" | null;
  managed_available: boolean;
}

export const LLM_MODES = { MANAGED: "managed", BYOK: "byok", NONE: "none" } as const;

export interface Category {
  id: number;
  name: string;
  user_id: number;
}


// ── Admin Types ────────────────────────────────────────────────

export interface AdminOverview {
  total_users: number;
  active_7d: number;
  active_30d: number;
  total_accounts: number;
  linked_accounts: number;
  manual_accounts: number;
  total_transactions: number;
  total_households: number;
  recent_errors: number;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  is_admin: boolean;
  is_protected: boolean;
  is_disabled: boolean;
  created_at: string | null;
  account_count: number;
  transaction_count: number;
  last_active: string | null;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
}

export interface AdminPlaidError {
  id: number;
  user_id: number | null;
  error_type: string;
  endpoint: string;
  status_code: number | null;
  detail: string;
  created_at: string;
}

export interface AdminPlaidHealth {
  total_plaid_errors: number;
  recent_errors: AdminPlaidError[];
}

export interface AdminErrorEntry {
  id: number;
  user_id: number | null;
  error_type: string;
  endpoint: string;
  status_code: number | null;
  detail: string;
  created_at: string;
}

export interface AdminErrorsResponse {
  items: AdminErrorEntry[];
  total: number;
}

export interface ActiveUsersPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface FeatureAdoption {
  feature: string;
  user_count: number;
  percentage: number;
}

export interface TransactionVolumePoint {
  date: string;
  count: number;
}

export interface StorageMetric {
  table_name: string;
  row_count: number;
}

export interface AdminUserDetailAccount {
  id: number;
  name: string;
  type: string;
  subtype: string | null;
  current_balance: number;
  is_linked: boolean;
  created_at: string | null;
}

export interface AdminUserDetailTransaction {
  id: number;
  date: string;
  merchant_name: string | null;
  amount: number;
  category: string | null;
  account_name: string | null;
}

export interface AdminUserDetailActivity {
  action: string;
  detail: string | null;
  created_at: string | null;
}

export interface AdminUserDetailStats {
  total_transactions: number;
  first_transaction_date: string | null;
  categories_used: number;
  rules_created: number;
  tags_created: number;
}

export interface AdminUserDetail {
  user: AdminUser;
  accounts: AdminUserDetailAccount[];
  recent_transactions: AdminUserDetailTransaction[];
  recent_activity: AdminUserDetailActivity[];
  stats: AdminUserDetailStats;
}

export interface WebhookEvent {
  id: number;
  webhook_type: string;
  webhook_code: string;
  item_id: string | null;
  error_code: string | null;
  error_message: string | null;
  processed: boolean;
  created_at: string | null;
}

export interface WebhookEventsResponse {
  total: number;
  events: WebhookEvent[];
}
