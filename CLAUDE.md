# Personal Finance Dashboard — Project Spec

## Goal
Single-user personal finance dashboard. Pulls transactions and balances from my bank
accounts via Plaid once daily, categorizes them using Plaid's built-in categories plus my
own merchant rules, stores everything in Postgres, and shows spending and cash-flow views.
Hosted on Vercel. Only I use it.

## Constraints
- Plaid free trial: Production keys, **max 10 connections (Items)**. No OAuth registration
  needed; bank access is automatic on the trial.
- Every successful Plaid Link creates an Item and uses one of the 10. Never create
  duplicate Items for the same bank:
  - Before linking, check whether that institution is already linked and warn me.
  - Use Link **update mode** to fix broken connections (ITEM_LOGIN_REQUIRED), never re-link.
  - Build and test everything in **Sandbox** first. Sandbox Items do not count.
- Vercel Hobby plan: cron runs once per day. Keep the sync job short.

## Stack
- Next.js (App Router, TypeScript), deployed on Vercel
- Neon Postgres (via Vercel Marketplace) + Drizzle ORM + drizzle-kit migrations
- Plaid: `plaid` Node SDK server-side, `react-plaid-link` client-side
- Tailwind + shadcn/ui, Recharts for charts
- Vercel Cron for the daily sync

## Environment variables
```
PLAID_CLIENT_ID=
PLAID_SECRET=              # sandbox or production secret, matching PLAID_ENV
PLAID_ENV=sandbox          # sandbox | production
DATABASE_URL=              # injected by Neon integration
ENCRYPTION_KEY=            # openssl rand -hex 32
SESSION_SECRET=            # openssl rand -hex 32
CRON_SECRET=               # openssl rand -hex 32
DASHBOARD_PASSWORD_HASH=   # bcrypt hash of my password
OPENROUTER_API_KEY=        # assistant + weekly budget check-in (server only)
OPENROUTER_MODEL=          # default openai/gpt-5-nano
```
Add a `.env.example` with these keys (no values) and a small script
`scripts/hash-password.ts` that prints a bcrypt hash for a given password.

## Auth (single user)
- No auth provider. Password gate in Next.js middleware.
- `/login` checks the password against `DASHBOARD_PASSWORD_HASH` and sets a signed,
  httpOnly, secure, sameSite=lax cookie (30-day expiry) using `SESSION_SECRET`.
- Middleware protects every route except `/login` and `/api/cron/*`.
- `/api/cron/*` requires `Authorization: Bearer ${CRON_SECRET}`.

## Security
- Encrypt Plaid access tokens at rest with AES-256-GCM using `ENCRYPTION_KEY`.
- Access tokens never leave the server and are never logged.
- All Plaid calls happen in server routes or server actions only.

## Database schema
**plaid_items**: id, item_id (unique), access_token_encrypted, institution_id,
institution_name, sync_cursor, status ('ok' | 'login_required' | 'error'),
last_error, created_at, updated_at

**accounts**: id, plaid_account_id (unique), item_id FK, name, official_name, mask,
type, subtype, current_balance, available_balance, credit_limit, hidden bool, updated_at

**transactions**: id, plaid_transaction_id (unique), account_id FK, date,
authorized_date, amount (Plaid sign: positive = money out), merchant_name, name,
plaid_primary, plaid_detailed, plaid_confidence, category_id FK,
category_source ('plaid' | 'rule' | 'manual'), needs_review bool, pending bool,
excluded bool, created_at, updated_at

**categories**: id, name (unique), kind ('expense' | 'income' | 'transfer'), color, sort_order

Seed categories: Groceries, Dining, Coffee, Gas, Transport, Rent/Housing, Utilities,
Subscriptions, Shopping, Travel, Health/Fitness, Entertainment, Personal Care, Gifts,
Fees, Other (all expense), Income (income), Transfers (transfer)

**merchant_rules**: id, match_field ('merchant_name' | 'name'), pattern
(case-insensitive contains), category_id FK, created_at

**sync_runs**: id, trigger ('cron' | 'manual'), started_at, finished_at, added,
modified, removed, status, error

## Plaid integration
- `POST /api/plaid/link-token`: create a link token with products `["transactions"]`,
  country `US`, and `transactions: { days_requested: 730 }` (2 years of history;
  can only be set at link time). Accept an optional item id to create an
  update-mode token instead.
- `POST /api/plaid/exchange`: exchange public_token for access_token, encrypt and store
  the Item, fetch and store accounts, then run an initial sync for that Item.
- Duplicate check: before opening Link for a new bank, and again on exchange, compare
  institution_id against existing Items. If already linked, warn me, and on exchange
  call /item/remove on the new duplicate.
- `/transactions/sync` with the stored cursor per Item. Loop while `has_more`.
  Upsert added and modified, delete removed, save the new cursor only after the loop
  finishes. Handle `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` by restarting from
  the last saved cursor.
- Refresh balances with `/accounts/get` during each sync (not /accounts/balance/get,
  which costs more calls and isn't needed daily).
- On `ITEM_LOGIN_REQUIRED`, set the Item status to 'login_required' and show a
  "Reconnect" button (update mode) in the UI.
- Initial history can take a while to become available after linking. If the first sync
  returns little data, that's expected; the daily cron picks up the rest.

## Categorization (no external AI)
Precedence during sync, only for transactions where category_source is not 'manual':
1. **merchant_rules** match (check merchant_name, then name) → source = 'rule'
2. **Plaid mapping** from `lib/category-map.ts` → source = 'plaid'.
   Match the detailed category first, then primary, else "Other".
3. Fallback "Other" → needs_review = true

Also set needs_review = true when Plaid's confidence_level is LOW or UNKNOWN.

Starting map (extend as needed):
- FOOD_AND_DRINK_GROCERIES → Groceries
- FOOD_AND_DRINK_COFFEE → Coffee
- FOOD_AND_DRINK (other) → Dining
- TRANSPORTATION_GAS → Gas
- TRANSPORTATION (other) → Transport
- TRAVEL → Travel
- RENT_AND_UTILITIES_RENT → Rent/Housing
- RENT_AND_UTILITIES (other) → Utilities
- GENERAL_MERCHANDISE → Shopping
- ENTERTAINMENT → Entertainment
- PERSONAL_CARE → Personal Care
- MEDICAL → Health/Fitness
- BANK_FEES → Fees
- INCOME → Income
- TRANSFER_IN, TRANSFER_OUT, LOAN_PAYMENTS_CREDIT_CARD_PAYMENT → Transfers
- everything else → Other

Manual changes:
- Recategorizing a transaction sets source = 'manual' and needs_review = false.
  Manual categories are never overwritten by later syncs.
- After a manual change, offer "Always use <category> for <merchant>?" If yes, create
  a merchant_rule and apply it to existing non-manual transactions from that merchant.

## Totals rules
- Transfers (kind = 'transfer') are excluded from spending and income totals.
- Pending transactions are shown but excluded from totals until posted.
- `excluded = true` lets me hide one-off transactions from totals.
- Plaid amounts: positive = outflow, negative = inflow. Display outflows as spending.

## Daily sync: `/api/cron/sync`
`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 13 * * *" }] }
```
(13:00 UTC ≈ 6am Pacific)

Steps:
1. Insert a sync_runs row.
2. For each Item with status 'ok': run /transactions/sync, refresh balances, categorize
   new and modified transactions. One Item failing must not stop the others.
3. Update the sync_runs row with counts, status, and error.

The same logic lives in `lib/sync.ts` and also backs a "Sync now" button (trigger = 'manual').

## Pages
1. **/** (Overview)
   - This month's spending vs last month (and the same point last month)
   - Spending by category (donut), click-through to filtered transactions
   - Daily cumulative spending line: this month vs last month
   - Net cash flow (income − spending) for the last 6 months (bar)
   - Account balances grouped by type (cash, credit, other), plus net total
   - Last sync time and status, "Sync now" button, review queue count
2. **/transactions**
   - Table: date, merchant, amount, account, category (inline dropdown), source badge
   - Filters: date range, account, category, text search, needs_review only
   - Pagination (50 per page)
3. **/review**
   - Queue of needs_review transactions with a one-click category picker and the
     "always use for this merchant" option
4. **/settings/accounts**
   - "Link a bank" button (Plaid Link) with the connection count shown as X/10
   - Linked institutions with status, "Reconnect" (update mode), and "Remove"
     (calls /item/remove, deletes local data after confirmation)
   - Toggle to hide individual accounts
5. **/settings/categories**
   - Add, rename, recolor, and reorder categories
   - View and delete merchant rules

## Build order
1. Scaffold Next.js, Drizzle, Neon, schema, migrations, category seed
2. Password gate middleware and login page
3. Plaid Link, token exchange, duplicate check, accounts page (Sandbox,
   test login `user_good` / `pass_good`)
4. `lib/sync.ts` with transactions/sync, upserts, balances, and the "Sync now" button
5. Category mapping, merchant rules, manual recategorize
6. Cron route, `vercel.json`, sync_runs logging
7. Overview dashboard and charts
8. Transactions page and review queue
9. Deploy to Vercel, set production env vars, switch `PLAID_ENV=production`,
   link real banks one at a time

## Definition of done
- I can log in, link a real bank, and see 2 years of categorized transactions.
- The cron runs daily and sync_runs shows successful runs.
- Fixing a category in the review queue creates a rule that applies going forward.
- No access tokens or secrets appear in client bundles or logs.
