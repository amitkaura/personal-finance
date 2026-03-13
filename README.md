# Personal Finance System

A self-hosted personal finance platform that aggregates bank accounts via Plaid, categorizes transactions with AI, and gives households a unified view of their financial position.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.14, FastAPI, SQLModel (SQLAlchemy + Pydantic) |
| **Database** | PostgreSQL 16 |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| **Bank Integration** | Plaid (sandbox / development / production) |
| **Auth** | Google OAuth 2.0, JWT session cookies |
| **AI Categorization** | OpenAI-compatible API (GPT, Ollama, Azure, etc.) |
| **Charts** | Nivo (bar) |
| **Scheduling** | APScheduler (daily transaction sync) |
| **Infrastructure** | Docker Compose (Postgres + Redis + API) |

## Features

### Account Management
- Connect bank accounts, credit cards, loans, and investment accounts via Plaid Link
- Supports US and Canadian institutions
- Automatic balance refresh on every sync
- Account type classification (depository, credit, loan, investment) with editable subtypes
- Unlink individual accounts or revoke full institution connections
- Accounts page hides unlinked accounts by default (toggle to show all)
- **Manual accounts** -- create accounts without Plaid (all types: depository, credit, loan, investment)
- Manually adjust balances on manual accounts at any time
- Delete manual accounts (cascades associated transactions and goal links)

### Transaction Management
- Automatic transaction sync from all linked Plaid items
- Manual transaction entry with merchant name, amount, date, category, and notes
- **CSV import** -- upload bank statement CSVs with a multi-step column mapper
  - Drag-and-drop or file picker upload
  - Auto-detects common column headers (date, description, amount, category)
  - Supports single Amount column or separate Debit/Credit columns for banks that report withdrawals and deposits as positive numbers in different columns
  - Preview mapped transactions with color-coded amounts before importing
  - Duplicate detection skips previously imported rows
- **Infinite scroll** -- browse the full transaction history with automatic pagination (loads 50 at a time as you scroll)
- Server-side search by merchant name with filters for category, account, source (manual vs synced), and uncategorized
- Filter by account, manual/synced source, income/expense type, date range, and amount range
- Inline auto-categorization: transactions are categorized on import using rules and LLM fallback
- Manual "auto-categorize" button to batch-process any remaining uncategorized transactions
- Delete manual transactions; Plaid-synced transactions are protected

### Hybrid Categorization
1. **Rule-based** -- user-defined keyword-to-category mappings checked first
2. **LLM fallback** -- uncategorized transactions are sent to an OpenAI-compatible model for classification
3. **Inline categorization** -- each transaction is categorized at import/creation time (rules first, then LLM)
4. Auto-categorization also runs on every Plaid sync and can be triggered manually for any remaining uncategorized transactions

### Tags
- Create user-defined tags with custom colors
- Attach multiple tags to any transaction
- Filter and organize spending with tag-based labels

### Budgets
- Monthly category budgets with configurable amounts
- Optional rollover of unspent budget to the next month
- Copy all budgets from one month to another
- **Shared budgets** -- create household-level budgets editable by either partner
- **Per-person spending breakdown** -- shared budget rows show a two-tone progress bar with per-person contribution amounts
- **Spending preferences** -- when both a personal and shared budget exist for the same category, choose where your spending counts
- **Sectioned household view** -- household scope groups budgets into "Your Budgets", "Partner's Budgets", and "Shared Budgets" sections
- Dashboard snippet shows personal and shared budget progress side-by-side

### Financial Goals
- Set savings goals with target amount, target date, icon, and color
- Track current progress toward each goal
- **Shared goals** -- create household-level goals that either partner can contribute to
- **Account-linked goals** -- link one or more accounts to auto-track progress from balances (updated on every Plaid sync)
- **Contribution history** -- expandable log showing who added what, with user avatar, amount, note, and date
- **Collapsed shared summary** -- personal scope shows a compact "N shared goals — X% avg progress" banner
- Dashboard snippet shows personal goals plus a shared goals summary

### Net Worth Tracking
- Automatic net worth snapshots taken after every Plaid sync
- Historical net worth chart on the dashboard (assets, liabilities, net)
- Manual snapshot trigger via API

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
- Invite a partner by email to form a household
- Three view modes across the entire app:
  - **Mine** -- only your accounts, transactions, budgets, and goals
  - **Yours** -- view-only access to your partner's data
  - **Ours** -- combined household view with shared budgets/goals
- Owner badges (name + avatar) on accounts, transactions, and connections in shared views
- Shared budgets and goals are editable by either household member
- Partner's personal budgets and goals are visible but read-only
- Invitation accept/decline/cancel flow with banner notifications
- Editable household name (displayed in ViewSwitcher)
- Leave household at any time; personal data is unaffected

### Profile Management
- Editable display name override (falls back to Google name when cleared)
- Custom avatar URL (falls back to Google profile picture when cleared)
- Optional short bio/tagline (up to 300 characters)
- Read-only email from Google OAuth
- Reset buttons to revert individual fields to Google defaults
- Profile changes reflect immediately in the sidebar

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

### Settings & Configuration
- **Profile & Account** -- display name, avatar URL, bio (with Google fallback)
- **General** -- currency (CAD, USD, EUR, GBP, etc.), date format, number locale
- **Sync Schedule** -- enable/disable auto-sync, pick hour, minute, and timezone
- **Category Rules** -- CRUD for keyword-to-category mappings
- **AI Categorization** -- configure LLM base URL, model, and API key
- **Data Management** -- CSV export of all transactions, bulk delete

### Dashboard
- Net worth hero card with total assets, liabilities, and net worth
- Net worth history chart
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
│   ├── scheduler.py                # APScheduler daily sync job
│   ├── plaid_client.py             # Plaid API client factory
│   ├── crypto.py                   # Fernet encrypt/decrypt for access tokens
│   ├── categorizer.py              # Rule-based + LLM batch categorization
│   ├── household.py                # Scope helper (personal/partner/household)
│   └── routes/
│       ├── auth.py                 # POST /google, GET /me, POST /logout
│       ├── accounts.py             # CRUD, manual accounts, CSV import, unlink, summary
│       ├── plaid.py                # POST /link-token, /exchange-token, /sync, GET /items
│       ├── transactions.py         # GET /, POST /, PATCH /:id, DELETE /:id, recurring
│       ├── settings.py             # GET /, PUT /, rules CRUD, export, delete
│       ├── budgets.py              # GET /, POST /, PATCH /:id, DELETE /:id, copy, summary
│       ├── goals.py                # GET /, POST /, PATCH /:id, DELETE /:id
│       ├── reports.py              # spending-by-category, trends, top-merchants
│       ├── net_worth.py            # GET /history, POST /snapshot
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
│   │   ├── connections/page.tsx    # Plaid connections management
│   │   ├── settings/page.tsx       # User preferences and configuration
│   │   ├── layout.tsx              # Root layout
│   │   └── providers.tsx           # React Query, Google OAuth, Auth, Household
│   ├── components/
│   │   ├── auth-gate.tsx           # Auth check wrapper with sidebar
│   │   ├── auth-provider.tsx       # Auth context and useAuth hook
│   │   ├── household-provider.tsx  # Household context and useHousehold hook
│   │   ├── view-switcher.tsx       # Mine / Yours / Ours toggle
│   │   ├── invitation-banner.tsx   # Accept/decline household invitations
│   │   ├── sidebar.tsx             # Navigation, user profile, logout
│   │   ├── link-account.tsx        # Plaid Link flow
│   │   ├── sync-button.tsx         # Trigger sync for all items
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
│   │   ├── csv-import-dialog.tsx   # Multi-step CSV import with column mapper
│   │   └── confirm-dialog.tsx      # Reusable confirmation modal
│   ├── lib/
│   │   ├── api.ts                  # API client (fetch with credentials)
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── csv-utils.ts            # CSV parsing, column role detection, date normalization
│   │   └── hooks.ts                # useSettings, useFormatCurrency, useScope
│   └── tests/                      # Frontend test suite (Vitest + RTL)
│       ├── setup.tsx               # Global mocks (next/image, next/link, next/navigation)
│       ├── helpers.tsx             # Fixtures, mock API factory, renderWithProviders
│       ├── auth-provider.test.tsx  # Login, logout, cache clearing, loading states
│       ├── household-provider.test.tsx # Scope persistence, reset on no household
│       ├── view-switcher.test.tsx  # Labels, pictures, scope switching, visibility
│       ├── invitation-banner.test.tsx  # Accept/decline, dismiss, multiple invites
│       ├── settings-page.test.tsx  # Profile, household, general, data management
│       ├── sidebar.test.tsx        # Nav links, branding, active state, user section
│       ├── hooks.test.tsx          # useFormatCurrency, useFormatCurrencyPrecise, useScope
│       ├── csv-utils.test.ts       # CSV parser, column role guessing, date normalization, row mapping
│       ├── accounts-page.test.tsx  # Manual/Plaid account rendering, add form, import/delete actions
│       ├── csv-import-dialog.test.tsx # Upload, column mapping, debit/credit, preview, import flow
│       ├── bulk-csv-import-dialog.test.tsx # Bulk upload, multi-account mapping, category matching
│       ├── cashflow-bar-chart.test.tsx # Bar chart, drill-down, period switching, breadcrumbs
│       ├── confirm-dialog.test.tsx # Rendering, variants, ARIA attributes, dismiss
│       ├── transactions-page.test.tsx # Filters, search, add/approve/delete, badges
│       ├── budgets-page.test.tsx   # Month navigation, copy, add form, totals, empty state
│       ├── goals-page.test.tsx     # Active/completed, create dialog, progress, shared summary
│       ├── reports-page.test.tsx   # Period selector, summary cards, category bars, merchants
│       ├── recurring-page.test.tsx # Frequency tabs, sort, consistent/varies badges
│       ├── connections-page.test.tsx # Connection cards, sync, disconnect, confirm
│       ├── login-page.test.tsx     # Hero, trust badges, Google sign-in flow
│       ├── net-worth-card.test.tsx  # Loading, data display, asset/liability breakdown
│       ├── net-worth-history.test.tsx # Empty state, snapshot, chart, change indicator
│       ├── credit-cards-widget.test.tsx # Card list, utilization bars, total owed
│       ├── loans-widget.test.tsx   # Loan list, total remaining
│       ├── recurring-widget.test.tsx # Recurring detection, max 6, sort by amount
│       ├── top-movers.test.tsx     # Investment filter, trend icons
│       ├── sync-button.test.tsx    # Click, syncing state, idle after delay
│       ├── review-snippet.test.tsx # Transaction list, "all caught up", view all link
│       ├── budget-snippet.test.tsx # Personal/shared bars, top 3, "Create one" link
│       ├── goals-snippet.test.tsx  # Personal goals, shared summary, "Set one" link
│       ├── link-account.test.tsx   # Token fetch, Plaid link, success message
│       └── auth-gate.test.tsx      # Loading, unauthenticated, authenticated layout
├── tests/                          # Backend test suite (pytest)
│   ├── conftest.py                 # Fixtures, in-memory SQLite, auth mocks
│   ├── test_health.py              # Health/readiness endpoints
│   ├── test_auth.py                # Google OAuth login, session, /me
│   ├── test_transactions.py        # CRUD, filters, search, pagination
│   ├── test_accounts.py            # List, create, update, delete, unlink, summary
│   ├── test_categories.py          # Full CRUD, auto-seed, cascading renames/deletes
│   ├── test_budgets.py             # CRUD, copy, summary
│   ├── test_goals.py               # CRUD, ownership
│   ├── test_tags.py                # CRUD, transaction tagging
│   ├── test_household.py           # Invite, accept, decline, leave, scope
│   ├── test_settings.py            # Profile, rules, export, clear
│   ├── test_reports.py             # Spending, trends, merchants
│   ├── test_net_worth.py           # Snapshots, history
│   └── test_plaid.py               # Link token, exchange token, sync (mocked)
├── docker-compose.yml              # Postgres + Redis + API services
├── Dockerfile                      # Python 3.12-slim, uvicorn
├── requirements.txt                # Python dependencies
├── pytest.ini                      # Pytest configuration
└── .env.example                    # All required environment variables
```

## Data Models

| Model | Purpose |
|-------|---------|
| `User` | Google OAuth user (google_id, email, name, picture) |
| `PlaidItem` | Bank connection with encrypted access token |
| `Account` | Bank/credit/loan/investment account with balances |
| `Transaction` | Financial transaction (Plaid-synced or manual) |
| `CategoryRule` | Keyword-to-category mapping for auto-categorization |
| `UserSettings` | Per-user preferences (currency, locale, sync, LLM config) |
| `Budget` | Monthly category budget with optional rollover and household sharing |
| `SpendingPreference` | Per-user preference for routing category spending (personal vs shared) |
| `Goal` | Savings goal with target amount, date, and household sharing |
| `GoalAccountLink` | Links a goal to accounts for auto-tracking progress |
| `GoalContribution` | Tracks individual contributions to a goal with attribution |
| `NetWorthSnapshot` | Point-in-time assets, liabilities, and net worth |
| `Tag` | User-defined label with color |
| `TransactionTag` | Many-to-many link between transactions and tags |
| `Household` | Shared household between two partners |
| `HouseholdMember` | User membership in a household with role |
| `HouseholdInvitation` | Pending email invitation to join a household |

## API Reference

All endpoints are prefixed with `/api/v1`. Authenticated via JWT cookie.

### Auth (`/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/google` | Exchange Google ID token for JWT session |
| GET | `/me` | Get current authenticated user |
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
| POST | `/sync-all` | Sync all linked Plaid items |
| GET | `/items` | List all Plaid connections with accounts |
| POST | `/items/:id/unlink` | Revoke and delete a Plaid connection |

### Accounts (`/accounts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all accounts (supports `?scope=`) |
| POST | `/` | Create a manual account (no Plaid required) |
| PATCH | `/:id` | Update account name, type, subtype, or balance |
| DELETE | `/:id` | Delete a manual account (cascades transactions/goal links) |
| POST | `/:id/unlink` | Unlink a single Plaid-linked account |
| POST | `/:id/import` | Bulk import transactions from mapped CSV data |
| GET | `/summary` | Aggregated balances by type for dashboard |

### Transactions (`/transactions`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List transactions with search, filters (`account_id`, `is_manual`, `category`, `uncategorized`), pagination (`offset`, `limit`) |
| POST | `/` | Create a manual transaction |
| PATCH | `/:id` | Update category, merchant, amount, date, notes |
| DELETE | `/:id` | Delete a manual transaction |
| GET | `/categories` | List available categories |
| POST | `/auto-categorize` | Auto-categorize uncategorized transactions |
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
- Python 3.14+
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
- `PLAID_CLIENT_ID` and `PLAID_SECRET` from the Plaid dashboard
- `ENCRYPTION_KEY` -- generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `GOOGLE_CLIENT_ID` from Google Cloud Console
- `JWT_SECRET` -- generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `LLM_API_KEY` (optional, for AI categorization)

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

**What's tested (260 tests across 15 files — 84% line coverage):**

| File | Tests | Coverage |
|------|-------|----------|
| `test_settings` | 43 | Profile, user settings, category rules, export (header validation), clear, tag cleanup, sync validation |
| `test_goals` | 34 | CRUD, shared goals, linked accounts, contributions, ownership, date validation |
| `test_budgets` | 32 | CRUD, copy, summary, shared budgets, spending preferences, conflicts |
| `test_household` | 31 | Invite, accept, decline, cancel, rename, leave, scope, invitation email, leave cleanup (budgets, goals, preferences, invitations) |
| `test_transactions` | 27 | CRUD, search, account/source/category filters, pagination, manual vs. Plaid, auto-categorize, recurring, date validation, response schema |
| `test_categories` | 20 | Full CRUD, auto-seed defaults, create validation (empty/duplicate), rename cascades to transactions and rules, delete with reassign or nullify, cross-user isolation |
| `test_accounts` | 19 | List, update, unlink, summary, manual create/delete, balance update, CSV import, cascade delete, negative amounts, inline auto-categorization |
| `test_plaid` | 14 | Link token, exchange token (success, relink, conflict, institution name), sync, items (all Plaid calls mocked) |
| `test_tags` | 13 | CRUD, attach/detach tags, idempotent tagging |
| `test_reports` | 8 | Spending by category, monthly trends, top merchants |
| `test_email` | 6 | SMTP service, invitation template, send/skip/fail handling, port-465 SSL |
| `test_auth` | 6 | Google OAuth login (mocked), session, `/me`, logout |
| `test_net_worth` | 5 | Snapshots, history |
| `test_health` | 2 | Liveness and readiness endpoints |

**Coverage by module:**

| Module | Stmts | Lines covered | Coverage |
|--------|-------|---------------|----------|
| `app/routes/categories.py` | 90 | 90 | 100% |
| `app/routes/net_worth.py` | 54 | 54 | 100% |
| `app/models.py` | 186 | 186 | 100% |
| `app/config.py` | 44 | 44 | 100% |
| `app/routes/auth.py` | 63 | 62 | 98% |
| `app/email.py` | 42 | 41 | 98% |
| `app/routes/household.py` | 200 | 193 | 96% |
| `app/household.py` | 19 | 18 | 95% |
| `app/routes/settings.py` | 365 | 342 | 94% |
| `app/routes/goals.py` | 218 | 202 | 93% |
| `app/routes/reports.py` | 116 | 106 | 91% |
| `app/routes/transactions.py` | 215 | 187 | 87% |
| `app/routes/accounts.py` | 136 | 116 | 85% |
| `app/routes/tags.py` | 111 | 94 | 85% |
| `app/categorizer.py` | 102 | 78 | 76% |
| `app/routes/budgets.py` | 271 | 189 | 70% |
| `app/routes/plaid.py` | 247 | 147 | 60% |
| **Total** | **2775** | **2324** | **84%** |

**Test infrastructure:**
- In-memory SQLite with per-test isolation (fresh tables for each test)
- Google OAuth ID token verification is mocked
- `get_current_user` dependency is overridden to inject a test user
- Factory helpers for creating users, accounts, transactions, households, budgets, goals, tags, and settings
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

**What's tested (301 tests across 32 files — 73% line coverage):**

| File | Tests | Coverage |
|------|-------|----------|
| `csv-utils` | 51 | CSV parsing, quoted fields, column role guessing (debit/credit), date normalization, row mapping |
| `bulk-csv-import-dialog` | 19 | Bulk upload, multi-account mapping, preview, import flow |
| `cashflow-bar-chart` | 17 | Bar chart rendering, drill-down, period switching, breadcrumbs |
| `settings-page` | 14 | All sections: profile, household, general, data management |
| `csv-import-dialog` | 14 | Upload step, auto-detection, debit/credit mapping, preview, import, results, errors, navigation |
| `transactions-page` | 12 | Title, add form, search, filter tabs, category/type filters, loading, empty states, approve, delete, badges, auto-categorize |
| `accounts-page` | 12 | Empty state, Add/Link buttons, manual vs Plaid account actions, add form, import/delete dialogs |
| `confirm-dialog` | 11 | Rendering, variants, callbacks, keyboard/click dismiss, ARIA attributes |
| `budgets-page` | 10 | Title, month navigation, copy from last month, add form, loading, totals, empty state |
| `goals-page` | 10 | Title, empty state, active/completed sections, progress bar, target date, create dialog, shared summary, delete confirm |
| `sidebar` | 10 | Brand, nav links, active state, user avatar, logout, hrefs |
| `invitation-banner` | 9 | Visibility, inviter details, accept/decline, dismiss, multiple invites |
| `reports-page` | 8 | Title, period selector, loading, summary cards, category bars, empty states, top merchants |
| `view-switcher` | 8 | Hidden when no household, labels, pictures, scope switching, fallbacks |
| `recurring-page` | 7 | Title, loading, empty state, recurring cards, summary, consistent/varies badges, sort dropdown |
| `connections-page` | 7 | Title, empty state, loading, connection cards, sync/disconnect buttons, confirm dialog, link account |
| `net-worth-history` | 6 | Loading, empty state with snapshot, chart rendering, change indicator, period selector |
| `credit-cards-widget` | 6 | Loading, empty, card list, total owed, utilization bar colors, no-limit handling |
| `recurring-widget` | 6 | Loading, empty, recurring detection, max 6 items, null merchant handling, sort by amount |
| `household-provider` | 6 | Load household/partner, scope persistence per user in localStorage, reset |
| `hooks` | 6 | `useFormatCurrency`, `useFormatCurrencyPrecise`, `useScope` |
| `auth-provider` | 6 | Loading state, login/logout, cache clearing, default context |
| `goals-snippet` | 6 | Loading, empty with "Set one" link, personal goals (max 3), shared summary, singular/plural, view all link |
| `net-worth-card` | 5 | Loading skeleton, net worth display, asset/liability breakdown, account count pluralization |
| `top-movers` | 5 | Loading, empty, investment+linked filter, trend icons, official name fallback |
| `budget-snippet` | 5 | Loading, empty with "Create one" link, personal mini bar, top 3 sort, view all link |
| `login-page` | 5 | Hero section, trust badges, feature cards, Google sign-in flow |
| `loans-widget` | 4 | Loading, empty, loan list, total remaining |
| `sync-button` | 4 | Idle state, click triggers API, syncing state (disabled), returns to idle after delay |
| `review-snippet` | 4 | Loading, empty "all caught up", transaction list, view all link |
| `link-account` | 4 | Idle button, token fetch on click, success message, pluralization |
| `auth-gate` | 4 | Loading spinner, unauthenticated shows login, authenticated renders sidebar + children, layout classes |

**Coverage by area:**

| Area | Statements | Lines | Branches |
|------|-----------|-------|----------|
| `components/` | 85% | 84% | 80% |
| `lib/` | 98% | 99% | 90% |
| `app/cashflow/` | 100% | 100% | 100% |
| `app/reports/` | 80% | 81% | 77% |
| `app/recurring/` | 78% | 77% | 68% |
| `app/login/` | 76% | 76% | 50% |
| `app/connections/` | 68% | 69% | 57% |
| `app/accounts/` | 61% | 61% | 63% |
| `app/transactions/` | 59% | 62% | 65% |
| `app/budgets/` | 53% | 55% | 45% |
| `app/goals/` | 41% | 43% | 45% |
| **Overall** | **73%** | **73%** | **71%** |

**Test infrastructure:**
- jsdom environment with global mocks for `next/image`, `next/link`, `next/navigation`
- Shared fixtures for users, households, invitations, and settings
- Mock API factory with `vi.hoisted()` for proper hoisting with `vi.mock`
- `renderWithProviders` wrapper with isolated `QueryClient` per test

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_POOL_SIZE` | No | SQLAlchemy connection pool size (default: `5`) |
| `DB_MAX_OVERFLOW` | No | SQLAlchemy pool overflow limit (default: `10`) |
| `PLAID_CLIENT_ID` | Yes | Plaid API client ID |
| `PLAID_SECRET` | Yes | Plaid API secret |
| `PLAID_ENV` | No | `sandbox` (default), `development`, or `production` |
| `ENCRYPTION_KEY` | Yes | Fernet key for encrypting Plaid access tokens |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `JWT_SECRET` | Yes | Secret for signing JWT session tokens |
| `SECURE_COOKIES` | Conditionally required | Must be `true` when `DEBUG=false` |
| `CORS_ORIGINS` | No | Comma-separated allowed frontend origins |
| `LLM_BASE_URL` | No | OpenAI-compatible API base URL (default: `https://api.openai.com/v1`) |
| `LLM_API_KEY` | No | API key for the LLM service |
| `LLM_MODEL` | No | Model name (default: `gpt-4o-mini`) |
| `SYNC_ENABLED` | No | Enable daily auto-sync (default: `true`) |
| `SYNC_HOUR` | No | Hour for daily sync in 24h format (default: `0`) |
| `SYNC_MINUTE` | No | Minute for daily sync (default: `0`) |
| `SYNC_TIMEZONE` | No | Timezone for sync schedule (default: `America/Toronto`) |
| `DEBUG` | No | Enable debug logging (default: `false`) |
| `RUN_SCHEDULER` | No | Enable APScheduler background job runner (default: `true`) |
| `RATE_LIMIT_ENABLED` | No | Enable API rate-limiting middleware (default: `true`) |
| `RATE_LIMIT_PER_MINUTE` | No | Default requests/minute for `/api/v1/*` (default: `120`) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | No | Requests/minute for `/api/v1/auth/*` (default: `30`) |
| `PLAID_RATE_LIMIT_PER_MINUTE` | No | Requests/minute for `/api/v1/plaid/*` (default: `60`) |
| `RATE_LIMIT_TRUST_PROXY` | No | Use `X-Forwarded-For` for client IP (default: `false`) |
| `RATE_LIMIT_BACKEND` | No | `memory` or `redis` (default: `memory`) |
| `REDIS_URL` | Required if Redis backend | Redis connection URL (default: `redis://redis:6379/0`) |
| `SMTP_HOST` | No | SMTP server hostname (empty = email disabled) |
| `SMTP_PORT` | No | SMTP server port (default: `587`) |
| `SMTP_USER` | No | SMTP auth username |
| `SMTP_PASSWORD` | No | SMTP auth password |
| `SMTP_FROM_EMAIL` | No | Sender email address |
| `SMTP_FROM_NAME` | No | Sender display name (default: `FinanceApp`) |
| `SMTP_USE_TLS` | No | Use STARTTLS (default: `true`) |
| `APP_URL` | No | Frontend URL for email links (default: `http://localhost:3000`) |

## Security

- Designed to run on `localhost` behind a VPN -- not exposed to the public internet
- Plaid access tokens are encrypted at rest with Fernet symmetric encryption
- JWT sessions use HttpOnly cookies (not accessible via JavaScript), with `Secure` in non-debug mode
- LLM API keys are never returned to the frontend
- All data queries are scoped to the authenticated user
- CORS is configurable via `CORS_ORIGINS`
- API applies baseline security headers on all responses
- Rate limiting can be run in-memory (single instance) or Redis-backed (multi-instance)

## Troubleshooting Notes

- **Cross-user data visible after account switch**: caused by stale React Query cache reused across sessions.
- **Mitigation in codebase**: `frontend/components/auth-provider.tsx` clears query cache on login, logout, and authenticated user-id changes.
- **Verification**: login as user A, view data, logout, login as user B, then refresh target pages and confirm only user B data is shown.
