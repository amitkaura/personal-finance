# Personal Finance System

A self-hosted personal finance platform that aggregates bank accounts via Plaid, categorizes transactions with AI, and gives households a unified view of their financial position.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI, SQLModel (SQLAlchemy + Pydantic) |
| **Database** | PostgreSQL 16 |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| **Bank Integration** | Plaid (sandbox / production), managed or per-household BYO credentials |
| **Auth** | Google OAuth 2.0, JWT session cookies |
| **AI Categorization** | Managed LLM or BYOK (OpenAI, Ollama, Azure, any OpenAI-compatible API) |
| **Charts** | Nivo (bar) |
| **Scheduling** | APScheduler (per-household cron jobs for transaction sync + statement reminders) |
| **Linting** | ESLint (frontend, via Husky + lint-staged), ruff (backend) |
| **Infrastructure** | Docker Compose (Postgres + Redis + API) |

## Features

### Account Management
- Connect bank accounts, credit cards, loans, and investment accounts via Plaid Link
- **Sandbox mode indicator** -- when Plaid is configured in sandbox/test mode, a visible banner appears on the Dashboard, Connections page, and during onboarding; the Link Account button shows "Link Demo Account"; the onboarding managed-mode card shows a "(Demo)" tag
- **Managed or Bring Your Own Plaid** -- hosted instances can offer managed Plaid credentials so users connect instantly; alternatively each household configures its own Plaid API keys in Settings; Plaid and LLM mode can be switched in Settings when no accounts are linked
- **Managed or Bring Your Own LLM** -- admin can configure app-level LLM credentials for managed AI categorization; users choose managed or BYOK during onboarding; switchable in Settings at any time
- **Admin Plaid config** -- instance admin can configure app-level Plaid credentials, toggle managed mode, and see how many households use it (managed via Admin Panel → Plaid Config tab)
- **Admin LLM config** -- instance admin can configure app-level LLM credentials (base URL, API key, model), toggle enabled, and see managed household count (Admin Panel → LLM Config tab)
- **Onboarding** -- full-screen two-step wizard (no sidebar); step 1 lets users choose between managed Plaid and BYOK; step 2 lets users choose between managed AI and BYOK; no skip option on either step; back button on step 2; verbose Settings switch info on both steps; OnboardingRedirect in AuthGate for global coverage
- Supports US and Canadian institutions
- Automatic balance refresh on every sync
- Account type and subtype selection during creation, with editable subtypes
- **Edit account modal** -- consolidated edit dialog for name, type, subtype, and balance; balance is disabled for Plaid accounts with an explanatory note
- Unlink individual accounts or revoke full institution connections with confirmation dialog
- **Sync feedback** -- clear "Synced" or "Sync failed" status after each connection sync
- **Dashboard quick actions** -- Link Account, Add Account, and Add Partner buttons in the dashboard header; Add Account navigates to the accounts page with the add form pre-opened
- **Plaid setup banner** -- dismissible dashboard banner prompts household owners to configure Plaid when not yet set up
- **Click-to-filter** -- click any account row to navigate to the Transactions page pre-filtered by that account
- Accounts page hides unlinked accounts by default (toggle to show all)
- **Manual accounts** -- create accounts without Plaid (all types: depository, credit, loan, investment)
- Manually adjust balances on manual accounts at any time
- Delete manual or unlinked accounts (cascades associated transactions and goal links)
- **Statement reminders** -- set a recurring day-of-month (1-31) per account for statement availability; triggers an in-app banner and email reminder on that day (with last-day-of-month fallback for days 29-31)

### Transaction Management
- **Batched transaction sync** -- all sync paths (first sync after linking, manual sync, scheduled sync) use batch DB lookups and batch LLM categorization instead of per-transaction queries; first sync after linking shows streaming progress in the drawer (same UX as CSV import)
- Manual transaction entry with merchant name, amount, date, category, and notes
- **CSV import** -- bulk import accounts & transactions from bank exports with a multi-step wizard; auto-creates accounts, categorizes transactions, skips duplicates, and lets you set account type, subtype, and starting balance per new account
  - Drag-and-drop or file picker upload
  - Auto-detects common column headers (date, description, amount, category)
  - Supports single Amount column or separate Debit/Credit columns for banks that report withdrawals and deposits as positive numbers in different columns
  - Preview mapped transactions with color-coded amounts before importing
  - Duplicate detection skips previously imported rows
- **Infinite scroll** -- browse the full transaction history with automatic pagination (loads 50 at a time as you scroll)
- Server-side search by merchant name with filters for category, account, source (manual vs synced), and uncategorized
- **Filter popover** -- secondary filters (category, type, date range, amount range) collapsed behind a Filters button with active-filter count badge; click outside to dismiss
- Inline auto-categorization: each transaction is categorized at import time (rules first, then per-transaction LLM fallback) with real-time streaming progress; optional **skip AI categorization** toggle for faster imports
- Manual "auto-categorize" button with streaming progress bar (current/total, merchant name, assigned category) and tooltip describing the AI/rules categorization process
- **Delete confirmation** -- manual transaction deletion requires confirmation via dialog; Plaid-synced transactions are protected
- **Rule suggestion on categorize** -- after manually categorizing a transaction, an inline card offers to create a category rule from the merchant name with multiple keyword options (full name, cleaned name, progressive word combinations); skipped if a matching rule already exists
- **Inline transaction editing** -- pencil button on every transaction row expands an inline form to edit merchant name, category, amount (with expense/income toggle), date, and notes; only one row editable at a time; category change from null triggers rule suggestion

### Hybrid Categorization
1. **Rule-based** -- user-defined keyword-to-category mappings checked first
2. **Batched LLM fallback** -- uncategorized transactions are batched into configurable chunks (default 10, range 1–50) and sent to an OpenAI-compatible model; reduces API calls and avoids rate limiting
3. **Inline categorization** -- each transaction is categorized at import time (rules first, then batched LLM fallback) with real-time streaming progress via NDJSON
4. **Streaming auto-categorize** -- the manual auto-categorize endpoint batches LLM calls but streams per-transaction NDJSON progress events, showing categorization status with a progress bar on the frontend
5. Auto-categorization also runs on every Plaid sync and can be triggered manually for any remaining uncategorized transactions

### Tags
- Create user-defined tags with custom colors
- Attach multiple tags to any transaction
- Filter and organize spending with tag-based labels

### Budgets
- Monthly category budgets with configurable amounts; **click-to-edit** inline amount editing
- Optional rollover of unspent budget to the next month (tooltip explains rollover behavior)
- **Inline add-budget validation** -- amount now shows explicit feedback when invalid (e.g. `0` or empty) instead of silently staying disabled
- **Click-to-filter** -- click any budget row to navigate to the Transactions page pre-filtered by that category and month date range
- **Accessible progress bars** -- ARIA `progressbar` role with `aria-valuenow`/`aria-valuemax`
- Copy all budgets from one month to another
- **Shared budgets** -- create household-level budgets editable by either partner
- **Per-person spending breakdown** -- shared budget rows show a two-tone progress bar with per-person contribution amounts
- **Spending preferences** -- when both a personal and shared budget exist for the same category, choose where your spending counts
- **Sectioned household view** -- household scope groups budgets into "Your Budgets", "Partner's Budgets", and "Shared Budgets" sections
- Dashboard snippet shows personal/shared totals and expanded shared category rows in Mine, Yours, and Ours views

### Financial Goals
- Set savings goals with target amount, target date, icon, and color
- Track current progress toward each goal
- **Shared goals** -- create household-level goals that either partner can contribute to
- **Account-linked goals** -- link one or more accounts to auto-track progress from balances (updated on every Plaid sync)
- **Contribution history** -- expandable log showing who added what, with user avatar, amount, note, and date
- **Inline goal validation** -- create and contribution dialogs show explicit messages for invalid amounts (including `0`)
- Dashboard snippet shows expanded shared goal rows in Mine, Yours, and Ours views

### Validation UX + Error Contract
- API request validation errors now include a normalized payload with `message`, `detail`, and `field_errors` (`field`, `message`, `code`)
- Frontend API client parses validation payloads and surfaces cleaner user-facing mutation errors instead of raw `API error 422: ...` blobs
- Core create/update flows now pair disabled submit states with explicit validation text for invalid required fields (including numeric `> 0` checks where business rules require it)
- Expanded inline/mutation feedback now covers budget and goal amounts, account-name creation, add-transaction amount validation, create-account/create-transaction mutation failures, and household invite email format errors
- **No-shift layout** -- validation errors use reserved-height containers (`min-h` + `opacity` transition) and `aria-invalid` red-bordered inputs so error messages never push adjacent fields out of alignment

### Net Worth Tracking
- Automatic net worth snapshots taken after every Plaid sync, manual account creation, and balance update
- Historical net worth chart on the dashboard (assets, liabilities, net) with correct rendering for single data points
- Manual snapshot trigger via API
- **Balance history CSV import** -- bulk import accounts & balances from a CSV with date, balance, and account name columns to backfill historical net worth; auto-creates accounts if needed, supports matching to existing accounts, and recalculates net worth snapshots

### Cash Flow Visualization
- **Interactive bar chart** -- side-by-side income vs. expenses across months, quarters, or years
- **Drill-down** -- click any bar to see category breakdown, click a category to see individual transactions
- Breadcrumb navigation and back button at each drill level
- Period pickers (month, quarter, year) with navigation

### Recurring Transaction Detection
- Automatic frequency analysis (weekly, bi-weekly, monthly, quarterly, semi-annual, annual)
- Amount consistency detection
- Next expected date projection
- Dashboard widget showing upcoming recurring charges

### Reports
- Spending by category (pie/bar breakdown for any date range)
- Monthly trends (income, expenses, savings rate over time)
- Category trends (per-category spend month-over-month)
- Top merchants by total spend

### Household Sharing
- **Auto-household** -- every new user gets a personal household on signup, ensuring a place to store Plaid credentials even before inviting a partner
- Invite a partner by email to form a household
- Three view modes across the entire app:
  - **Mine** -- only your accounts, transactions, budgets, and goals
  - **Yours** -- view-only access to your partner's data
  - **Ours** -- combined household view with shared budgets/goals
- Owner badges (name + avatar) on accounts, transactions, and connections in shared views
- Shared budgets and goals are editable by either household member
- Partner's personal budgets and goals are visible but read-only
- **Dashboard partner status** -- shows "Sharing with {name}" badge when a partner exists, or an "Add Partner" button with invite dialog when not
- Invitation accept/decline/cancel flow with banner notifications; accepting dissolves the invitee's solo household (including its Plaid config) and warns if they have linked Plaid items
- Editable household name (displayed in ViewSwitcher)
- Leave household at any time; personal data is unaffected

### Profile Management
- Editable display name override (falls back to Google name when cleared)
- Custom avatar URL (falls back to Google profile picture when cleared)
- Optional short bio/tagline (up to 300 characters)
- Read-only email from Google OAuth
- Reset buttons to revert individual fields to Google defaults
- Profile changes reflect immediately in the sidebar

### Admin Panel
- **Multi-admin system** -- admin role persisted on user model; `ADMIN_EMAIL` env var bootstraps first admin on login; admins can promote/demote other users
- **Overview dashboard** -- clickable KPI cards for total users, active users (7d/30d), accounts (linked/manual), transactions, households, recent errors; clicking a KPI navigates to the relevant tab with pre-applied filters
- **User management** -- paginated, searchable user list with per-user stats (accounts, transactions, last active); filterable by active users (N days), linked accounts, manual accounts, sortable by account count; toggle admin, disable/enable (soft-ban), or permanently delete users with full FK cascade
- **User detail drill-down** -- expandable user rows showing accounts, recent transactions, recent activity timeline, and summary stats (total transactions, categories used, rules/tags created)
- **Plaid health** -- aggregated Plaid sync/link errors with recent failure details
- **Error log** -- paginated, filterable error log (by type, user, date range)
- **Analytics** -- DAU/WAU/MAU time series with bar charts, feature adoption rates (budgets, goals, tags, categories, rules, linked accounts), transaction volume bar chart, storage metrics (row counts per table)
- **Plaid Config** -- dedicated tab for managing app-level Plaid credentials (client ID, secret, environment), toggling managed mode, and removing config; moved from Settings page
- **Activity tracking** -- `ActivityLog` model records user actions (login, sync, import, categorize, etc.) for analytics
- **Disabled user enforcement** -- disabled users receive 403 on all authenticated endpoints
- **Sidebar integration** -- Admin link appears conditionally for admin users
- **Timestamps** -- all 24 models have `created_at` (auto-set on insert) and `updated_at` (auto-set on ORM flush via `before_flush` listener); idempotent startup migration ensures columns exist in production

### Authentication & Multi-User
- Google Sign-In with one-tap and popup flows
- JWT session stored as an HttpOnly cookie
- All data is scoped per-user (accounts, transactions, rules, settings, budgets, goals) with household-aware sharing
- User profile display in sidebar with avatar (prefers profile overrides)

### Security & Reliability
- Startup validation for critical config (`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ENCRYPTION_KEY`)
- Enforces `SECURE_COOKIES=true` when `DEBUG=false`
- Security response headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, CSP, conditional HSTS)
- Configurable per-route and global rate limiting (`memory` or `redis` backend)
- Readiness endpoint (`/health/ready`) checks database and Redis dependencies

### Global Progress Drawer
- **Persistent progress drawer** -- fixed bottom-right card shows real-time progress during CSV imports, Plaid sync, and auto-categorization, surviving page navigation
- **Import phase** -- displays account name, current merchant, and progress bar; CSV dialogs close immediately and hand off to the drawer
- **Sync phase** -- displays institution name and account progress (e.g. "Syncing Chase... Account 1 of 3")
- **Categorization phase** -- shows merchant name, assigned category badge, and progress bar (current/total)
- **Automatic chaining** -- after import, auto-categorization starts automatically if uncategorized transactions remain
- **Completion summary** -- displays imported count, synced count, categorized count, and skipped count
- **Error handling** -- displays error message with dismiss button
- **Manual dismiss** -- completion and error states show an X button to reset to idle
- Triggers from both the Sync Now button (connections page) and Auto-Categorize button (transactions page)
- Backed by a global React Context (`CategorizationProgressProvider`) that wraps the app, streaming NDJSON events from the backend

### Navigation & Layout
- **Mobile-responsive sidebar** -- hamburger toggle for small screens with overlay drawer
- **Categories nav link** -- sidebar includes a dedicated Categories page link
- Sidebar supports mobile open/close with backdrop click-to-dismiss
- Main content uses responsive margin (`lg:ml-60`) for proper layout on all screen sizes

### Settings & Configuration
- **Profile & Account** -- display name, avatar URL, bio (with Google fallback)
- **General** -- currency (CAD, USD, EUR, GBP, etc.), date format, number locale; "Settings saved" flash on save
- **Sync Schedule** -- per-household sync config (enable/disable, hour, minute, timezone); owner-only editing; "Schedule saved" flash on save; each household gets its own cron job on its own schedule
- **AI Categorization** — mode-aware: shows "Using managed AI" badge with switch button when managed, or BYOK config form (base URL, model, API key, transactions per request) with switch-to-managed button when BYOK; switchable between managed/BYOK at any time
- **Integrations** -- household owner configures Plaid client ID, secret, and environment (sandbox/development/production); credentials encrypted at rest with Fernet; masked last-4 display for verification; auto-scrolls via `?section=integrations` deep link
- **Data Management** -- CSV export, Bulk Import Accounts & Transactions, Bulk Import Accounts & Balances, bulk delete, factory reset (wipes all financial data while preserving login and household), delete account (permanently removes user and all data with household cleanup)
- Category rules management is on the dedicated Categories page

### Dashboard
- Net worth hero card with total assets, liabilities, and net worth
- Net worth history SVG line chart with hover tooltips
- Top spending movers (biggest category changes)
- Budget and goals summary snippets
- Credit cards widget (balances, limits, utilization)
- Loans widget (balances and payment info)
- Recurring charges widget
- Uncategorized transactions snippet
- Sync-all button

## Project Structure

```
personal-finance/
├── app/                            # FastAPI backend
│   ├── main.py                     # App entry, middleware, router registration
│   ├── auth.py                     # JWT creation/validation, get_current_user
│   ├── config.py                   # Pydantic settings from .env
│   ├── database.py                 # Engine, session management, table creation
│   ├── models.py                   # All SQLModel table definitions
│   ├── scheduler.py                # Per-household APScheduler cron jobs (sync + reminders)
│   ├── plaid_client.py             # Plaid API client factory (managed or per-household credentials)
│   ├── crypto.py                   # Fernet encrypt/decrypt for access tokens
│   ├── categorizer.py              # Rule-based + per-transaction LLM categorization
│   ├── household.py                # Scope helper (personal/partner/household)
│   ├── activity.py                 # log_activity() helper for ActivityLog
│   └── routes/
│       ├── admin.py                # Admin panel: overview, users CRUD, plaid-health, errors, analytics
│       ├── auth.py                 # POST /google, GET /me, POST /logout
│       ├── accounts.py             # CRUD, manual accounts, CSV import, unlink, summary
│       ├── plaid.py                # POST /link-token, /exchange-token, /sync, GET /items
│       ├── transactions.py         # GET /, POST /, PATCH /:id, DELETE /:id, recurring
│       ├── settings.py             # GET /, PUT /, rules CRUD, export, delete
│       ├── budgets.py              # GET /, POST /, PATCH /:id, DELETE /:id, copy, summary
│       ├── goals.py                # GET /, POST /, PATCH /:id, DELETE /:id
│       ├── reports.py              # spending-by-category, trends, top-merchants
│       ├── net_worth.py            # GET /history, POST /snapshot, recompute_snapshot_for_date helper
│       ├── tags.py                 # CRUD tags, attach/detach from transactions
│       └── household.py            # GET /, invite, accept, decline, leave
├── frontend/                       # Next.js frontend
│   ├── app/
│   │   ├── page.tsx                # Dashboard
│   │   ├── login/page.tsx          # Google sign-in
│   │   ├── accounts/page.tsx       # Account list and management
│   │   ├── transactions/page.tsx   # Transaction list, infinite scroll, filters, manual entry
│   │   ├── budgets/page.tsx        # Monthly budget management
│   │   ├── goals/page.tsx          # Financial goals
│   │   ├── cashflow/page.tsx       # Cash flow with drill-down bar chart
│   │   ├── reports/page.tsx        # Spending reports and trends
│   │   ├── recurring/page.tsx      # Recurring transaction analysis
│   │   ├── onboarding/page.tsx     # Extensible wizard: Step 1 = Plaid mode, Step 2 = LLM mode (with back nav)
│   │   ├── connections/page.tsx    # Plaid connections management
│   │   ├── admin/page.tsx          # Admin panel (overview, users, plaid health, analytics, plaid config, llm config)
│   │   ├── settings/page.tsx       # User preferences and configuration
│   │   ├── staging-login/page.tsx  # Staging password gate login page
│   │   ├── api/staging-auth/route.ts # Staging password verification API route
│   │   ├── layout.tsx              # Root layout
│   │   └── providers.tsx           # React Query, Google OAuth, Auth, Household, CategorizationProgress
│   ├── components/
│   │   ├── auth-gate.tsx           # Auth check wrapper with sidebar + categorization drawer
│   │   ├── auth-provider.tsx       # Auth context and useAuth hook
│   │   ├── household-provider.tsx  # Household context and useHousehold hook
│   │   ├── view-switcher.tsx       # Mine / Yours / Ours toggle
│   │   ├── invitation-banner.tsx   # Accept/decline household invitations
│   │   ├── statement-reminder-banner.tsx # Statement day reminder banners
│   │   ├── sidebar.tsx             # Navigation, user profile, logout
│   │   ├── dashboard-actions.tsx    # Dashboard header actions (link/add account, partner status)
│   │   ├── add-partner-dialog.tsx  # Invite partner email dialog
│   │   ├── plaid-setup-banner.tsx  # Dismissible Plaid config prompt (hidden for managed mode)
│   │   ├── sandbox-banner.tsx       # Amber warning banner shown when Plaid is in sandbox/test mode
│   │   ├── sandbox-banner-wrapper.tsx # Client wrapper that queries plaidConfig and conditionally renders SandboxBanner
│   │   ├── link-account.tsx        # Plaid Link flow (mode-aware: managed skips config redirect, sandbox label)
│   │   ├── onboarding-redirect.tsx # Dashboard redirect to /onboarding when plaid_mode or llm_mode is null
│   │   ├── categorization-progress-provider.tsx # Global progress context (sync, categorize, import)
│   │   ├── categorization-drawer.tsx  # Persistent progress drawer (importing, syncing, categorizing, complete)
│   │   ├── sync-button.tsx         # Trigger sync for all items (uses global context)
│   │   ├── net-worth-card.tsx      # Net worth summary
│   │   ├── net-worth-history.tsx   # Net worth line chart
│   │   ├── credit-cards-widget.tsx # Credit card balances
│   │   ├── loans-widget.tsx        # Loan balances
│   │   ├── recurring-widget.tsx    # Upcoming recurring charges
│   │   ├── review-snippet.tsx      # Uncategorized transactions snippet
│   │   ├── budget-snippet.tsx      # Budget progress summary
│   │   ├── goals-snippet.tsx       # Goals progress summary
│   │   ├── top-movers.tsx          # Top spending category changes
│   │   ├── cashflow-bar-chart.tsx  # Income vs expenses bar chart with drill-down
│   │   ├── csv-import-dialog.tsx   # CSV import wizard (upload, map columns, preview); hands off to drawer for progress
│   │   ├── bulk-csv-import-dialog.tsx # Bulk import wizard (upload, columns, accounts, categories, preview); hands off to drawer
│   │   ├── balance-import-dialog.tsx # Bulk Import Accounts & Balances
│   │   └── confirm-dialog.tsx      # Reusable confirmation modal
│   ├── middleware.ts                # Staging password gate (active when STAGING_PASSWORD is set)
│   ├── lib/
│   │   ├── api.ts                  # API client (fetch with credentials)
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── csv-utils.ts            # CSV parsing, column role detection, date normalization
│   │   ├── rule-utils.ts           # Keyword option generation for category rule suggestions
│   │   ├── staging-auth.ts         # SHA-256 hashing and cookie verification for staging gate
│   │   └── hooks.ts                # useSettings, useFormatCurrency, useScope
│   └── tests/                      # Frontend test suite (Vitest + RTL)
│       ├── setup.tsx               # Global mocks (next/image, next/link, next/navigation)
│       ├── helpers.tsx             # Fixtures, mock API factory, renderWithProviders
│       ├── auth-provider.test.tsx  # Login, logout, cache clearing, loading states
│       ├── household-provider.test.tsx # Scope persistence, reset on no household
│       ├── view-switcher.test.tsx  # Labels, pictures, scope switching, visibility
│       ├── invitation-banner.test.tsx  # Accept/decline, dismiss, multiple invites
│       ├── statement-reminder-banner.test.tsx # Render, dismiss, localStorage, multiple
│       ├── settings-page.test.tsx  # Profile, household, general, data management
│       ├── settings-plaid-mode.test.tsx # Plaid mode switching in Settings
│       ├── sidebar.test.tsx        # Nav links, branding, active state, user section
│       ├── hooks.test.tsx          # useFormatCurrency, useFormatCurrencyPrecise, useScope
│       ├── csv-utils.test.ts       # CSV parser, column role guessing, date normalization, row mapping
│       ├── rule-utils.test.ts     # Keyword option generation for rule suggestions
│       ├── accounts-page.test.tsx  # Manual/Plaid account rendering, add form, import/delete actions, edit modal
│       ├── csv-import-dialog.test.tsx # Upload, column mapping, debit/credit, preview, startImport handoff
│       ├── bulk-csv-import-dialog.test.tsx # Bulk upload, multi-account mapping, category matching, startBulkImport handoff
│       ├── balance-import-dialog.test.tsx # Balance history import dialog
│       ├── cashflow-bar-chart.test.tsx # Bar chart, drill-down, period switching, breadcrumbs
│       ├── confirm-dialog.test.tsx # Rendering, variants, ARIA attributes, dismiss
│       ├── transactions-page.test.tsx # Filters, search, add/approve/delete, badges
│       ├── budgets-page.test.tsx   # Month navigation, copy, add form, totals, empty state
│       ├── goals-page.test.tsx     # Active/completed, create dialog, progress, shared summary
│       ├── reports-page.test.tsx   # Period selector, summary cards, category bars, merchants
│       ├── recurring-page.test.tsx # Frequency tabs, sort, consistent/varies badges
│       ├── connections-page.test.tsx # Connection cards, sync, disconnect, confirm, sandbox banner
│       ├── sandbox-banner.test.tsx  # Sandbox mode warning banner rendering
│       ├── sandbox-banner-wrapper.test.tsx # Wrapper: renders banner when sandbox, nothing otherwise
│       ├── login-page.test.tsx     # Hero, trust badges, Google sign-in flow
│       ├── net-worth-card.test.tsx  # Loading, data display, asset/liability breakdown
│       ├── net-worth-history.test.tsx # Empty state, snapshot, chart, change indicator
│       ├── credit-cards-widget.test.tsx # Card list, utilization bars, total owed
│       ├── loans-widget.test.tsx   # Loan list, total remaining
│       ├── recurring-widget.test.tsx # Recurring detection, max 6, sort by amount
│       ├── top-movers.test.tsx     # Investment filter, trend icons
│       ├── categorization-drawer.test.tsx # Idle, syncing, importing, categorizing, complete, import→categorize chain, dismiss
│       ├── sync-button.test.tsx    # Click, syncing state, idle after completion
│       ├── review-snippet.test.tsx # Transaction list, "all caught up", view all link
│       ├── budget-snippet.test.tsx # Personal/shared bars, top 3, "Create one" link
│       ├── goals-snippet.test.tsx  # Personal goals, shared summary, "Set one" link
│       ├── dashboard-actions.test.tsx # Dashboard action buttons, partner status, navigation
│       ├── add-partner-dialog.test.tsx # Email input, invite submit, error handling, close
│       ├── link-account.test.tsx   # Token fetch, Plaid link, success message
│       ├── onboarding.test.tsx    # Wizard: Plaid mode step, LLM mode step, back navigation, progression, redirect
│       ├── plaid-mode-aware.test.tsx # PlaidSetupBanner + LinkAccount mode awareness
│       ├── admin.test.tsx           # Admin panel: tabs, KPI cards, user management, plaid health, analytics, plaid config, llm config
│       ├── admin-plaid-section.test.tsx # Admin section visibility and household count
│       ├── auth-gate.test.tsx      # Loading, unauthenticated, authenticated layout
│       ├── staging-gate.test.ts    # SHA-256 hashing and token verification
│       └── staging-login.test.tsx  # Staging login page rendering, submit, error, redirect
├── tests/                          # Backend test suite (pytest)
│   ├── conftest.py                 # Fixtures, in-memory SQLite, auth mocks
│   ├── test_health.py              # Health/readiness endpoints
│   ├── test_auth.py                # Google OAuth login, session, /me
│   ├── test_transactions.py        # CRUD, filters, search, pagination
│   ├── test_accounts.py            # List, create, update, delete (manual + unlinked), unlink, summary
│   ├── test_categories.py          # Full CRUD, auto-seed, cascading renames/deletes
│   ├── test_budgets.py             # CRUD, copy, summary
│   ├── test_goals.py               # CRUD, ownership
│   ├── test_tags.py                # CRUD, transaction tagging
│   ├── test_household.py           # Invite, accept, decline, leave, scope
│   ├── test_settings.py            # Profile, rules, export, clear, factory reset, balance import (sync fields removed)
│   ├── test_reports.py             # Spending, trends, merchants
│   ├── test_net_worth.py           # Snapshots, history
│   ├── test_scheduler.py            # Per-household scheduler + statement reminders
│   ├── test_sync_config.py          # Sync config CRUD (owner-only)
│   ├── test_plaid.py               # Link token, exchange token, sync (mocked)
│   ├── test_plaid_config.py        # BYO Plaid config CRUD (owner-only, encryption)
│   ├── test_llm_config.py          # BYO LLM config CRUD (owner-only, encryption)
│   ├── test_managed_plaid.py       # PlaidMode enum, AppPlaidConfig model, client resolution
│   ├── test_managed_plaid_routes.py # Admin plaid-config + plaid-mode routes, is_admin
│   ├── test_managed_llm_routes.py  # Admin llm-config + llm-mode routes, categorizer resolution
│   └── test_admin.py               # Admin panel: guard, overview, users CRUD, cascade delete, plaid health, errors, analytics
├── docker-compose.yml              # Postgres + Redis + API services
├── Dockerfile                      # Python 3.12-slim, uvicorn
├── requirements.txt                # Python dependencies
├── ruff.toml                       # Ruff linter config (Python)
├── pytest.ini                      # Pytest configuration
└── .env.example                    # All required environment variables
```

## Data Models

| Model | Purpose |
|-------|---------|
| `User` | Google OAuth user (google_id, email, name, picture, is_admin, is_disabled, created_at, updated_at) |
| `PlaidItem` | Bank connection with encrypted access token |
| `Account` | Bank/credit/loan/investment account with balances, optional `statement_available_day` (1-31) and `last_statement_reminder_sent` for recurring reminders |
| `Transaction` | Financial transaction (Plaid-synced or manual) |
| `CategoryRule` | Keyword-to-category mapping for auto-categorization |
| `UserSettings` | Per-user preferences (currency, locale, sync) |
| `Budget` | Monthly category budget with optional rollover and household sharing |
| `SpendingPreference` | Per-user preference for routing category spending (personal vs shared) |
| `Goal` | Savings goal with target amount, date, and household sharing |
| `GoalAccountLink` | Links a goal to accounts for auto-tracking progress |
| `GoalContribution` | Tracks individual contributions to a goal with attribution |
| `NetWorthSnapshot` | Point-in-time assets, liabilities, and net worth |
| `AccountBalanceSnapshot` | Per-account per-date historical balance for net worth recomputation |
| `Tag` | User-defined label with color |
| `TransactionTag` | Many-to-many link between transactions and tags |
| `Household` | Shared household between two partners; `plaid_mode` field (managed / byok / null); `llm_mode` field (managed / byok / none / null) |
| `HouseholdMember` | User membership in a household with role |
| `HouseholdPlaidConfig` | Per-household encrypted Plaid credentials (client_id, secret, env) |
| `AppPlaidConfig` | App-level managed Plaid credentials (singleton; encrypted client_id, secret, env, enabled toggle) |
| `HouseholdLLMConfig` | Per-household LLM config (household_id FK unique, llm_base_url, encrypted_api_key, llm_model) |
| `AppLLMConfig` | App-level managed LLM credentials (singleton; llm_base_url, encrypted_api_key, llm_model, enabled toggle) |
| `HouseholdSyncConfig` | Per-household sync schedule (sync_enabled, sync_hour, sync_minute, sync_timezone) |
| `HouseholdInvitation` | Pending email invitation to join a household |
| `ActivityLog` | Records user actions (login, sync, import, etc.) for DAU/WAU/MAU analytics |
| `ErrorLog` | Records errors (Plaid sync/link, API 4xx/5xx) for admin monitoring |

## API Reference

All endpoints are prefixed with `/api/v1`. Authenticated via JWT cookie.

### Admin (`/admin`) -- admin-only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | Dashboard stats: total users, active 7d/30d, accounts, transactions, households, errors |
| GET | `/users` | Paginated user list with per-user stats (search, limit, offset, active_days, has_linked, has_manual, sort) |
| PATCH | `/users/:id` | Update user (is_admin, is_disabled) |
| DELETE | `/users/:id` | Hard-delete user and all associated data (full FK cascade) |
| GET | `/users/:id/detail` | User detail: accounts, recent transactions, activity, summary stats |
| GET | `/plaid-health` | Plaid sync/link error aggregations and recent failures |
| GET | `/errors` | Paginated error log (filterable by user, type, date range) |
| GET | `/analytics/active-users` | DAU/WAU/MAU time series |
| GET | `/analytics/feature-adoption` | Users with budgets, goals, tags, rules, categories, linked accounts |
| GET | `/analytics/transaction-volume` | Transaction count per day over time |
| GET | `/analytics/storage` | Row counts for all major tables |

### Auth (`/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/google` | Exchange Google ID token for JWT session |
| GET | `/me` | Get current authenticated user (includes `is_admin` flag) |
| POST | `/logout` | Clear session cookie |

### Household (`/household`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get current household with members and invitations |
| POST | `/invite` | Invite a partner by email |
| PATCH | `/` | Update household name |
| GET | `/invitations/pending` | List pending invitations for current user |
| POST | `/invitations/:token/accept` | Accept an invitation |
| POST | `/invitations/:token/decline` | Decline an invitation |
| DELETE | `/invitations/:token` | Cancel an outgoing invitation |
| DELETE | `/leave` | Leave the current household |

### Plaid (`/plaid`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/link-token` | Create a Plaid Link token |
| POST | `/exchange-token` | Exchange public token for access token |
| POST | `/sync/:plaid_item_id` | Sync transactions for a specific item |
| POST | `/sync-all` | Sync all linked Plaid items (background) |
| POST | `/sync-all-stream` | Sync all items with streaming NDJSON progress (sync + categorize phases) |
| GET | `/items` | List all Plaid connections with accounts |
| POST | `/items/:id/unlink` | Revoke and delete a Plaid connection |

### Accounts (`/accounts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all accounts (supports `?scope=`) |
| POST | `/` | Create a manual account (no Plaid required) |
| PATCH | `/:id` | Update account name, type, subtype, or balance |
| DELETE | `/:id` | Delete a manual or unlinked account (cascades transactions/goal links) |
| POST | `/:id/unlink` | Unlink a single Plaid-linked account |
| POST | `/:id/import` | Bulk import transactions from mapped CSV data |
| GET | `/statement-reminders` | Accounts whose statement day matches today (with last-day-of-month fallback) |
| GET | `/summary` | Aggregated balances by type for dashboard |

### Transactions (`/transactions`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List transactions with search, filters (`account_id`, `is_manual`, `category`, `uncategorized`), pagination (`offset`, `limit`) |
| POST | `/` | Create a manual transaction |
| PATCH | `/:id` | Update category, merchant, amount, date, notes |
| DELETE | `/:id` | Delete a manual transaction |
| GET | `/categories` | List available categories |
| POST | `/auto-categorize` | Auto-categorize uncategorized transactions (supports NDJSON streaming with `Accept: application/x-ndjson`) |
| GET | `/recurring` | Detect recurring transactions |

### Settings (`/settings`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile` | Get user profile (with Google fallbacks) |
| PUT | `/profile` | Update display name, avatar URL, bio |
| GET | `/` | Get user settings |
| PUT | `/` | Update user settings |
| GET | `/rules` | List category rules |
| POST | `/rules` | Create a category rule |
| PUT | `/rules/:id` | Update a category rule |
| DELETE | `/rules/:id` | Delete a category rule |
| GET | `/export` | Export transactions as CSV |
| DELETE | `/transactions` | Delete all user transactions |
| DELETE | `/all-data` | Factory reset -- delete all financial data (preserves user and household) |
| DELETE | `/account` | Delete user account and all associated data (irreversible) |
| GET | `/plaid-config` | Get household Plaid config status (masked credentials) |
| PUT | `/plaid-config` | Create or update Plaid credentials (owner-only) |
| DELETE | `/plaid-config` | Remove Plaid credentials (owner-only) |
| GET | `/plaid-mode` | Get household's Plaid mode (managed/byok/null), managed availability, and managed_plaid_env |
| PUT | `/plaid-mode` | Set Plaid mode (one-time, no switching) |
| GET | `/admin/plaid-config` | Get app-level Plaid config status (admin-only) |
| PUT | `/admin/plaid-config` | Create/update managed Plaid credentials (admin-only) |
| DELETE | `/admin/plaid-config` | Remove managed Plaid credentials (admin-only) |
| GET | `/llm-mode` | Get household's LLM mode (managed/byok/none/null) and managed availability |
| PUT | `/llm-mode` | Set LLM mode (switchable, unlike Plaid) |
| GET | `/admin/llm-config` | Get app-level LLM config status (admin-only) |
| PUT | `/admin/llm-config` | Create/update managed LLM credentials (admin-only) |
| DELETE | `/admin/llm-config` | Remove managed LLM credentials (admin-only) |
| GET | `/llm-config` | Get per-household BYOK LLM config: configured, llm_base_url, llm_model, api_key_last4 |
| PUT | `/llm-config` | Create or update BYOK LLM config (owner-only; body: llm_base_url, llm_api_key, llm_model) |
| DELETE | `/llm-config` | Remove BYOK LLM config (owner-only) |
| GET | `/sync-config` | Get household sync schedule config |
| PUT | `/sync-config` | Create or update sync schedule (owner-only; body: sync_enabled, sync_hour, sync_minute, sync_timezone) |
| DELETE | `/sync-config` | Remove sync config (owner-only) |
| POST | `/import-balances` | Import account balance history CSV (creates accounts, balance snapshots, recomputes net worth) |

### Budgets (`/budgets`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List budgets for a month (personal + shared) |
| POST | `/` | Create a budget (optional `household_id` for shared) |
| PATCH | `/:id` | Update a budget (shared editable by any member) |
| DELETE | `/:id` | Delete a budget (shared deletable by any member) |
| POST | `/copy` | Copy personal budgets from one month to another |
| GET | `/summary` | Budget vs. actual with sectioned household view |
| GET | `/preferences` | Get spending preferences for current user |
| PUT | `/preferences` | Upsert a spending preference (category → personal/shared) |
| GET | `/conflicts` | Categories with both personal and shared budgets |

### Goals (`/goals`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List goals with shared summary (personal + household) |
| POST | `/` | Create a goal (optional `household_id`, `linked_account_ids`) |
| PATCH | `/:id` | Update a goal (shared editable by any member) |
| DELETE | `/:id` | Delete a goal (cascades links and contributions) |
| POST | `/:id/contributions` | Add manual contribution (non-account-linked only) |
| GET | `/:id/contributions` | Contribution history with user name/avatar |

### Reports (`/reports`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/spending-by-category` | Category breakdown for date range |
| GET | `/monthly-trends` | Income, expenses, savings over time |
| GET | `/category-trends` | Per-category monthly spending |
| GET | `/top-merchants` | Top merchants by total spend |

### Net Worth (`/net-worth`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/history` | Historical net worth snapshots |
| POST | `/snapshot` | Take a manual net worth snapshot |

### Tags (`/tags`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all tags |
| POST | `/` | Create a tag |
| PATCH | `/:id` | Update a tag |
| DELETE | `/:id` | Delete a tag |
| POST | `/transactions/:txn_id/tags/:tag_id` | Attach tag to transaction |
| DELETE | `/transactions/:txn_id/tags/:tag_id` | Remove tag from transaction |
| GET | `/transactions/:txn_id` | List tags for a transaction |

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (or Docker)
- A [Plaid](https://dashboard.plaid.com/) account (free sandbox)
- A [Google Cloud](https://console.cloud.google.com/) OAuth 2.0 Client ID

### 1. Clone and configure

```bash
git clone <repo-url> && cd personal-finance
cp .env.example .env
```

Edit `.env` and fill in:
- `ENCRYPTION_KEY` -- generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `GOOGLE_CLIENT_ID` from Google Cloud Console
- `JWT_SECRET` -- generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`

Plaid credentials are configured per-household in Settings (Integrations) or via admin-managed mode. LLM credentials are either admin-managed or per-household BYOK in Settings (AI Categorization).

### 2. Start dependencies

**With Docker:**
```bash
docker compose up -d db redis
```

**Without Docker (local Postgres):**
```bash
createdb finance
# Optional: run Redis locally if RATE_LIMIT_BACKEND=redis
# Update DATABASE_URL / REDIS_URL in .env to point to your local services
```

### 3. Start the backend

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API creates all database tables automatically on startup.

### 4. Start the frontend

```bash
cd frontend
cp .env.example .env.local   # set NEXT_PUBLIC_GOOGLE_CLIENT_ID
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

### 5. Pre-commit hooks (automatic)

Running `npm install` in `frontend/` automatically installs pre-commit hooks via Husky. On every `git commit`, the hook:

- **Frontend**: runs ESLint (with `--fix`) on staged `.ts`/`.tsx` files via lint-staged
- **Backend**: runs ruff on staged `.py` files

If either linter finds errors, the commit is blocked. To skip the hook in an emergency: `git commit --no-verify`.

### Docker (full stack)

```bash
docker compose up -d
```

This starts Postgres on `127.0.0.1:5432` and the API on `127.0.0.1:8000`. The frontend runs separately via `npm run dev` in the `frontend/` directory.

Container health checks:
- `db`: `pg_isready`
- `redis`: `redis-cli ping`
- `api`: probes `http://127.0.0.1:8000/health/ready`

## Testing

### Backend (pytest)

The backend test suite uses pytest with an in-memory SQLite database, so no external services are needed.

```bash
cd personal-finance
pip install -r requirements.txt   # includes pytest
python3 -m pytest                 # run all tests
python3 -m pytest -v              # verbose output
python3 -m pytest tests/test_auth.py  # run a single file
```

**What's tested (523 tests across 23 files):**

| File | Tests | Coverage |
|------|-------|----------|
| `test_settings` | 59 | Profile, user settings, category rules, export (header validation), clear, tag cleanup, factory reset, delete account (full data + user removal, household cleanup, empty household deletion, cross-user goal contributions), import LLM fallback (per-account + bulk + streaming), bulk import account subtype and balance, skip-LLM import option, balance history import (create accounts, match existing, net worth recompute, upsert duplicates, validation) |
| `test_goals` | 34 | CRUD, shared goals, linked accounts, contributions, ownership, date validation |
| `test_budgets` | 32 | CRUD, copy, summary, shared budgets, spending preferences, conflicts |
| `test_household` | 37 | Invite, accept, decline, cancel, rename, leave, scope, invitation email, leave cleanup (budgets, goals, preferences, invitations), accept dissolves solo household (with/without Plaid/LLM/Sync config), blocked when partnered, Plaid items warning |
| `test_transactions` | 31 | CRUD, search, account/source/category filters, pagination, manual vs. Plaid, auto-categorize (rules, batched LLM, batch_size control, partial failure with break, NDJSON streaming with batched LLM), recurring, date validation, response schema |
| `test_categories` | 27 | Full CRUD, auto-seed defaults, create validation (empty/whitespace/duplicate), rename cascades to transactions and rules, delete with reassign or nullify, cross-user isolation |
| `test_accounts` | 35 | List, update, unlink, summary, manual create/delete, unlinked Plaid delete, balance update (manual-only restriction), CSV import, cascade delete, negative amounts, inline auto-categorization, statement_available_day (create/update/clear/validate), statement-reminders endpoint (match/no-match/last-day-fallback/auth) |
| `test_scheduler` | 11 | Statement reminder scheduler job (day match, de-duplication, last-day-of-month fallback, no-accounts), per-household scheduler (reads DB config, no-config skips, disabled skips, multiple households, scoped sync items, scoped reminders) |
| `test_sync_config` | 13 | Sync config CRUD (get configured/unconfigured/no-household/member-read, create/update/invalid-hour/invalid-minute/non-owner/no-household, delete/non-owner/not-configured/no-household) |
| `test_plaid` | 24 | Link token, exchange token (success, relink, conflict, institution name, no background sync), sync, sync-all-stream (NDJSON streaming, batch account lookup, update-existing, batch LLM, rules-before-LLM), background sync (batch lookups, batch LLM), items (all Plaid calls mocked) |
| `test_tags` | 13 | CRUD, attach/detach tags, idempotent tagging |
| `test_reports` | 8 | Spending by category, monthly trends, top merchants |
| `test_email` | 11 | Resend HTTP API, invitation + statement reminder templates, send/skip/fail/network-error handling, bearer auth, app_url in CTAs |
| `test_plaid_config` | 16 | GET (configured/not/no-household/member-read/managed-returns-app-env), PUT (create/update/non-owner/no-household/invalid-env), DELETE (success/non-owner/not-configured/no-household), GET plaid-mode (managed_plaid_env sandbox, null when unavailable) |
| `test_llm_config` | 20 | BYO LLM config CRUD (owner-only, encryption, batch_size default/custom/validation), SSRF validation, Railway internal URL |
| `test_auth` | 8 | Google OAuth login (mocked), session, `/me`, logout, auto-household on signup, no duplicate household on re-login |
| `test_managed_plaid` | 16 | PlaidMode enum, AppPlaidConfig model, Household.plaid_mode field, plaid client resolution (managed vs BYOK: uses correct credentials, raises when disabled/missing/none) |
| `test_managed_plaid_routes` | 31 | Plaid mode GET/PUT (managed/byok/none/switch-blocked/validation), admin plaid-config CRUD (admin-only guard, create/update/delete, household count), /auth/me is_admin field |
| `test_managed_llm_routes` | 35 | LLM mode GET/PUT (managed/byok/none/switchable/validation), admin llm-config CRUD (admin-only guard, create/update/delete, unchanged sentinel, SSRF validation, household count, batch_size create/validation), categorizer resolution (managed uses AppLLMConfig with batch_size, BYOK uses HouseholdLLMConfig with batch_size, none/null returns empty, disabled returns empty) |
| `test_admin` | 44 | Admin guard (403 on all endpoints), overview aggregates, users list (pagination, search, stats, filters: active_days/has_linked/has_manual/sort), user detail (accounts, transactions, activity, stats, 404, auth guard), user update (promote/demote/disable/enable), user delete (full FK cascade, self-deletion blocked), disabled user auth, plaid health, error log (pagination, filters), analytics (active users, feature adoption, transaction volume, storage), activity logging, timestamps (created_at on insert, updated_at on flush, created_at unchanged on update) |
| `test_net_worth` | 5 | Snapshots, history |
| `test_health` | 2 | Liveness and readiness endpoints |

**Test infrastructure:**
- In-memory SQLite with per-test isolation (fresh tables for each test)
- Google OAuth ID token verification is mocked
- `get_current_user` dependency is overridden to inject a test user
- Factory helpers for creating users, accounts, transactions, households, Plaid configs, budgets, goals, tags, settings, and net worth snapshots
- No network calls — all external services (Plaid, Google) are mocked

### Frontend (Vitest + React Testing Library)

The frontend test suite uses Vitest with jsdom and React Testing Library. All API calls and providers are mocked — no backend needed.

```bash
cd personal-finance/frontend
npm install                       # includes vitest, @testing-library/*
npm test                          # run all tests (single run)
npm run test:watch                # watch mode
npx vitest run tests/sidebar.test.tsx  # run a single file
```

**What's tested (488 tests across 47 files):**

| File | Tests | Coverage |
|------|-------|----------|
| `csv-utils` | 51 | CSV parsing, quoted fields, column role guessing (debit/credit), date normalization, row mapping |
| `rule-utils` | 11 | Keyword option generation: full name, cleaned name, progressive word combos, dedup, edge cases |
| `settings-page` | 31 | All sections: profile, household, Integrations group with Bank Connections + AI sub-cards, general (save flash), sync (save flash), no category rules section, data management, delete account (button renders, confirm dialog calls deleteAccount + clearSession), explicit invalid invite email feedback, AI section mode-aware (managed badge, switch to BYOK button, BYOK form, switch to managed button, hidden switch when managed unavailable) |
| `settings-plaid-mode` | 5 | Plaid mode switching in Settings (managed/BYOK cards, switch when no accounts linked, blocked when accounts linked) |
| `balance-import-dialog` | 5 | Upload step rendering, column mapping, error handling, account matching, API call on submit |
| `cashflow-bar-chart` | 15 | Bar chart rendering, drill-down, period switching, breadcrumbs |
| `transactions-page` | 28 | Title, add form, search, filter popover with badge, loading, empty states, delete confirmation dialog, auto-categorize tooltip, click-outside dropdown close, account pre-filter from URL param, category/date pre-filter from URL params, rule suggestion (show/create/dismiss/skip-if-exists), inline edit (button renders, form pre-fills, save, cancel, one-at-a-time, category change triggers rule suggestion), explicit add-amount validation for `0`, create mutation error rendering |
| `sidebar` | 12 | Brand, nav links (including Categories), active state, user avatar, logout, hrefs, Categories position, ARIA navigation role |
| `accounts-page` | 27 | Empty state, Add/Link buttons, manual vs Plaid account actions, add form with subtype selector, import/delete dialogs, click row navigates to filtered transactions, edit modal with pre-filled fields, save calls updateAccount, balance disabled for Plaid, friendly type/subtype labels, statement day in add form and edit modal (appears, submits, pre-fills, editable for Plaid), auto-open add form via ?add=true query param, explicit required-name validation, create mutation error rendering |
| `confirm-dialog` | 11 | Rendering, variants, callbacks, keyboard/click dismiss, ARIA attributes |
| `bulk-csv-import-dialog` | 12 | Upload, preview, account detection, category matching, startBulkImport handoff with onClose, payload validation, fallback account, new categories |
| `csv-import-dialog` | 10 | Upload, column mapping, debit/credit, preview, startImport handoff with onClose, cancel, back navigation |
| `goals-page` | 12 | Title, empty state, active/completed sections, progress bar, target date, create dialog, shared summary, delete confirm, create validation message for zero target amount, contribution validation message for zero amount |
| `statement-reminder-banner` | 5 | Banner rendering, empty state, dismiss with localStorage, dismissed stays hidden, multiple banners |
| `invitation-banner` | 9 | Visibility, inviter details, accept/decline, dismiss, multiple invites |
| `reports-page` | 8 | Title, period selector, loading, summary cards, category bars, empty states, top merchants |
| `budgets-page` | 10 | Title, loading, totals, rollover tooltip, inline amount editing (Enter/Escape), progress bar ARIA attributes, click row navigates to filtered transactions, add-budget validation message for zero amount |
| `view-switcher` | 8 | Hidden when no household, labels, pictures, scope switching, fallbacks |
| `recurring-page` | 7 | Title, loading, empty state, recurring cards, summary, consistent/varies badges, sort dropdown |
| `connections-page` | 9 | Title, empty state, connection cards, sync success/failure feedback, disabled state during sync, sandbox banner shown/hidden based on plaid_env |
| `net-worth-history` | 7 | Loading, empty state with snapshot, SVG line chart rendering, polyline assertion, change indicator, period selector |
| `credit-cards-widget` | 6 | Loading, empty, card list, total owed, utilization bar colors, no-limit handling |
| `recurring-widget` | 6 | Loading, empty, recurring detection, max 6 items, null merchant handling, sort by amount |
| `household-provider` | 6 | Load household/partner, scope persistence per user in localStorage, reset |
| `hooks` | 6 | `useFormatCurrency`, `useFormatCurrencyPrecise`, `useScope` |
| `auth-provider` | 6 | Loading state, login/logout, cache clearing, default context |
| `goals-snippet` | 7 | Loading, empty with "Set one" link, personal goals (max 3), expanded shared rows in personal scope, partner/household shared visibility, view all link |
| `auth-gate` | 11 | Loading spinner, unauthenticated shows login, authenticated renders sidebar + children, hamburger menu button, toggle sidebar open, responsive margin classes, OnboardingRedirect (redirects when plaid_mode or llm_mode null, skips when modes set) |
| `net-worth-card` | 5 | Loading skeleton, net worth display, asset/liability breakdown, account count pluralization |
| `top-movers` | 6 | Loading, empty, investment filter, scrollable list, trend icons, official name fallback |
| `budget-snippet` | 8 | Loading, empty with "Create one" link, personal/shared totals, top-3 category sort, expanded shared categories in personal scope, partner scope, and household scope, view all link |
| `login-page` | 5 | Hero section, trust badges, feature cards, Google sign-in flow |
| `loans-widget` | 4 | Loading, empty, loan list, total remaining |
| `categorization-drawer` | 9 | Idle hidden, syncing state, importing state with account name, importing→complete transition, import→categorize chain, bulk import progress, categorizing progress, completion summary with dismiss, dismiss resets to idle |
| `sync-button` | 4 | Idle state, click triggers sync stream, syncing state (disabled), returns to idle after completion |
| `review-snippet` | 4 | Loading, empty "all caught up", transaction list, view all link |
| `dashboard-actions` | 6 | Add Account/Link Account/Add Partner buttons, partner status message, navigation to /accounts?add=true, partner dialog open |
| `add-partner-dialog` | 6 | Email input and submit, invitePartner API call, onClose on success, error display, close button, hidden when closed |
| `link-account` | 7 | Idle button, token fetch on click, success message, pluralization, sandbox "Link Demo Account" label, production "Link Account" label, startSync triggered after exchange |
| `sandbox-banner` | 2 | Test-mode warning text, demo accounts mention |
| `sandbox-banner-wrapper` | 3 | Renders banner when sandbox, nothing when production, nothing when unconfigured |
| `onboarding` | 21 | Wizard step 1 (Plaid mode): managed + BYOK cards, hidden managed when unavailable, no auto-selection, setPlaidMode calls on card click, Settings info text, no skip; wizard step 2 (LLM mode): managed AI + BYOK cards, no skip, back button returns to step 1, setLLMMode calls, Settings info text; wizard progression: step indicator, advancement after plaid mode set, skip step 2 when already set, redirect after all steps complete; sandbox indicator: banner when managed sandbox keys, hidden for production; cache invalidation: plaid-config cache cleared on managed and BYOK card click |
| `plaid-mode-aware` | 4 | PlaidSetupBanner hidden for managed mode, shown for BYOK; LinkAccount skips config redirect for managed, unavailable message when disabled |
| `admin` | 20 | Tab rendering (6 tabs including Plaid Config and LLM Config), KPI cards with drill-down click (Active 7d, Linked/Manual accounts → users tab with filters), filter badge and clear, user list, disable/delete actions with confirmation, expandable user detail row (accounts, transactions, activity), tab switching (plaid health, analytics with active-users and transaction-volume charts), Plaid Config tab (config status, environment selector, save button), LLM Config tab (config status, model/base URL display, save button, enabled toggle) |
| `admin-plaid-section` | 3 | Plaid Config tab visibility in admin panel, managed household count, environment selector |
| `staging-gate` | 7 | SHA-256 hashing (deterministic, hex format, uniqueness), token verification (match, mismatch, empty, malformed) |
| `staging-login` | 6 | Password input and submit button rendering, POST to /api/staging-auth, redirect to / or ?from, error on 401, empty password guard |

**Test infrastructure:**
- jsdom environment with global mocks for `next/image`, `next/link`, `next/navigation`
- Shared fixtures for users, households, invitations, and settings
- Mock API factory with `vi.hoisted()` for proper hoisting with `vi.mock`
- `renderWithProviders` wrapper with isolated `QueryClient` per test

### Latest coverage snapshot

- Backend (`pytest --cov=app --cov-report=term`): **86% total** (`4207` statements, `601` missed)
- Frontend (`npx vitest run --coverage`): **76% statements**, **72% branches**, **62% functions**, **77% lines**

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_POOL_SIZE` | No | SQLAlchemy connection pool size (default: `5`) |
| `DB_MAX_OVERFLOW` | No | SQLAlchemy pool overflow limit (default: `10`) |
| `ENCRYPTION_KEY` | Yes | Fernet key for encrypting Plaid access tokens and household Plaid/LLM credentials |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `JWT_SECRET` | Yes | Secret for signing JWT session tokens |
| `SECURE_COOKIES` | Conditionally required | Must be `true` when `DEBUG=false` |
| `CORS_ORIGINS` | No | Comma-separated allowed frontend origins |
| `DEBUG` | No | Enable debug logging (default: `false`) |
| `RUN_SCHEDULER` | No | Enable APScheduler background job runner (default: `true`) |
| `RATE_LIMIT_ENABLED` | No | Enable API rate-limiting middleware (default: `true`) |
| `RATE_LIMIT_PER_MINUTE` | No | Default requests/minute for `/api/v1/*` (default: `120`) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | No | Requests/minute for `/api/v1/auth/*` (default: `30`) |
| `PLAID_RATE_LIMIT_PER_MINUTE` | No | Requests/minute for `/api/v1/plaid/*` (default: `60`) |
| `RATE_LIMIT_TRUST_PROXY` | No | Use `X-Forwarded-For` for client IP (default: `false`) |
| `RATE_LIMIT_BACKEND` | No | `memory` or `redis` (default: `memory`) |
| `REDIS_URL` | Required if Redis backend | Redis connection URL (default: `redis://redis:6379/0`) |
| `RESEND_API_KEY` | No | Resend API key (empty = email disabled) |
| `EMAIL_FROM_ADDRESS` | No | Sender email address |
| `EMAIL_FROM_NAME` | No | Sender display name (default: `FinanceApp`) |
| `APP_URL` | No | Public-facing frontend URL for email CTAs (default: `http://localhost:3000`) |
| `STAGING_PASSWORD` | No | Frontend-only. When set, all routes require a shared password before the app is visible. Used to protect staging environments from public access. Unset in production. |

LLM credentials are either managed by the instance admin (Admin Panel → LLM Config) or configured per-household in Settings > AI Categorization (BYOK mode). Households choose their LLM mode during onboarding and can switch in Settings.

## Security

- Designed to run on `localhost` behind a VPN -- not exposed to the public internet
- Plaid access tokens and per-household Plaid API credentials are encrypted at rest with Fernet symmetric encryption
- JWT sessions use HttpOnly cookies (not accessible via JavaScript), with `Secure` in non-debug mode
- LLM API keys are encrypted at rest and never returned to the frontend (only last 4 chars shown); Plaid credentials are returned masked (last 4 chars only)
- All data queries are scoped to the authenticated user
- CORS is configurable via `CORS_ORIGINS`
- API applies baseline security headers on all responses
- Rate limiting can be run in-memory (single instance) or Redis-backed (multi-instance)

## Troubleshooting Notes

- **Cross-user data visible after account switch**: caused by stale React Query cache reused across sessions.
- **Mitigation in codebase**: `frontend/components/auth-provider.tsx` clears query cache on login, logout, and authenticated user-id changes.
- **Verification**: login as user A, view data, logout, login as user B, then refresh target pages and confirm only user B data is shown.


