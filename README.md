# OS Wallet

Single-user personal finance dashboard: Plaid → Neon Postgres → Next.js on Vercel.
The full spec is in `CLAUDE.md`.

## Local setup (Sandbox)

1. `npm install`
2. Create a Neon database (Vercel Marketplace → Neon, or neon.tech) and copy its connection string.
3. `cp .env.example .env.local` and fill it in:
   - `PLAID_CLIENT_ID`, `PLAID_SECRET` (the **sandbox** secret), `PLAID_ENV=sandbox`
   - `DATABASE_URL`
   - `ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`: each `openssl rand -hex 32`
   - `DASHBOARD_PASSWORD_HASH`: `npm run hash-password -- "your password"`.
     In `.env.local`, use the escaped (`\$`) line it prints, because Next.js expands `$` in env files.
4. `npm run db:migrate && npm run db:seed`
5. `npm run dev`, then log in, go to **Accounts → Link a bank**, and use `user_good` / `pass_good`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` | Next.js dev server / production build |
| `npm run db:generate` | Generate a migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` | Insert default categories (idempotent) |
| `npm run hash-password -- "pw"` | Print a bcrypt hash for `DASHBOARD_PASSWORD_HASH` |

## Deploying (build step 9)

1. Push to GitHub, import into Vercel, and add the Neon integration (it injects `DATABASE_URL`).
2. Set the other env vars in Vercel. Paste the **unescaped** password hash there.
3. Run `npm run db:migrate && npm run db:seed` against the production database.
4. Set the production `PLAID_SECRET` and `PLAID_ENV=production`. Then link real banks one at a time.
   Keep Sandbox data out of production: use a separate Neon branch/database for local
   Sandbox work. (Removing a Sandbox Item after switching environments still deletes it locally.)
5. The cron in `vercel.json` hits `/api/cron/sync` daily at 13:00 UTC. Vercel sends
   `Authorization: Bearer $CRON_SECRET` automatically. To test manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/sync`

## Layout

- `proxy.ts`: password gate (Next 16 renamed `middleware.ts` to `proxy.ts`)
- `lib/sync.ts`: `/transactions/sync` loop, upserts, balances, and `sync_runs` logging
- `lib/categorize.ts` + `lib/category-map.ts`: rules → Plaid map → "Other"
- `lib/crypto.ts`: AES-256-GCM for Plaid access tokens
- `app/api/plaid/*`: link token (new or update mode) and token exchange with duplicate check
- `app/actions.ts`: server actions for sync, recategorize, rules, categories, and accounts
