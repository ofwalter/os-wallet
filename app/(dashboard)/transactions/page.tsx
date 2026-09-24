import { connection } from "next/server";
import { and, asc, count, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, SearchX } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { CategorySelect } from "@/components/category-select";
import { TransactionActions } from "@/components/exclude-toggle";
import { EmptyState, PageHeader } from "@/components/page-header";
import { TransactionFilters, type TxFilters } from "@/components/transaction-filters";
import { Amount, SourceBadge, StatusChip } from "@/components/transaction-bits";
import { buttonVariants } from "@/components/ui/button";
import { db, accounts, categories, transactions } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { formatDayHeading, formatMoney } from "@/lib/format";
import { listCategories } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Transactions" };

const PAGE_SIZE = 50;

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s: string | undefined): s is string => !!s && /^\d+$/.test(s);

type SortKey = "date" | "merchant" | "category" | "account" | "amount";
type SortDir = "asc" | "desc";
// Direction used on the first click of each column.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  merchant: "asc",
  category: "asc",
  account: "asc",
  amount: "desc",
};
const isSortKey = (s: string | undefined): s is SortKey => !!s && s in DEFAULT_DIR;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  await connection(); // always render per request
  const sp = await searchParams;
  const f: TxFilters = {
    from: str(sp.from),
    to: str(sp.to),
    account: str(sp.account),
    category: str(sp.category),
    q: str(sp.q),
    review: str(sp.review),
    sort: str(sp.sort),
    dir: str(sp.dir),
  };
  const sort: SortKey = isSortKey(f.sort) ? f.sort : "date";
  const dir: SortDir = f.dir === "asc" || f.dir === "desc" ? f.dir : DEFAULT_DIR[sort];
  // Keep the URL canonical: default sort/direction stay out of the query string.
  f.sort = sort === "date" ? undefined : sort;
  f.dir = dir === DEFAULT_DIR[sort] ? undefined : dir;
  const page = Math.max(1, Number(str(sp.page)) || 1);

  const where: SQL[] = [];
  if (isDate(f.from)) where.push(gte(transactions.date, f.from));
  if (isDate(f.to)) where.push(lte(transactions.date, f.to));
  if (isId(f.account)) where.push(eq(transactions.accountId, Number(f.account)));
  if (f.category === "none") where.push(isNull(transactions.categoryId));
  else if (isId(f.category)) where.push(eq(transactions.categoryId, Number(f.category)));
  if (f.review === "1") where.push(eq(transactions.needsReview, true));
  if (f.q) {
    where.push(
      sql`position(lower(${f.q}) in lower(coalesce(${transactions.merchantName}, '') || ' ' || ${transactions.name})) > 0`,
    );
  }
  const condition = where.length ? and(...where) : undefined;
  const order = dir === "asc" ? asc : desc;
  const sortExpr = {
    date: transactions.date,
    merchant: sql`lower(coalesce(${transactions.merchantName}, ${transactions.name}))`,
    category: sql`lower(coalesce(${categories.name}, 'zzz'))`,
    account: sql`lower(${accounts.name})`,
    amount: transactions.amount,
  }[sort];
  // Summary sums skip pending and excluded rows, like the dashboard totals.
  const counts = sql`not ${transactions.pending} and not ${transactions.excluded}`;

  const [rows, [summary], cats, accts] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        merchantName: transactions.merchantName,
        name: transactions.name,
        pending: transactions.pending,
        excluded: transactions.excluded,
        needsReview: transactions.needsReview,
        categoryId: transactions.categoryId,
        categorySource: transactions.categorySource,
        categoryName: categories.name,
        categoryColor: categories.color,
        accountName: accounts.name,
        accountMask: accounts.mask,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(condition)
      .orderBy(order(sortExpr), desc(transactions.date), desc(transactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        total: count(),
        out: sql<number>`coalesce(sum(case when ${counts} and ${transactions.amount} > 0 then ${transactions.amount} end), 0)::float8`,
        in: sql<number>`coalesce(sum(case when ${counts} and ${transactions.amount} < 0 then -${transactions.amount} end), 0)::float8`,
      })
      .from(transactions)
      .where(condition),
    listCategories(),
    db
      .select({ id: accounts.id, name: accounts.name, mask: accounts.mask })
      .from(accounts)
      .orderBy(asc(accounts.name)),
  ]);
  const total = summary.total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryOptions = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const today = todayISO();

  const href = (patch: Partial<TxFilters> & { page?: string }) => {
    const params = new URLSearchParams(
      Object.entries({ ...f, ...patch }).filter((e): e is [string, string] => !!e[1]),
    );
    return params.size ? `/transactions?${params}` : "/transactions";
  };
  const pageHref = (p: number) => href({ page: p > 1 ? String(p) : undefined });
  const sortHref = (key: SortKey) => {
    const nextDir = key === sort ? (dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[key];
    return href({
      sort: key === "date" ? undefined : key,
      dir: nextDir === DEFAULT_DIR[key] ? undefined : nextDir,
    });
  };
  const sortHeader = (key: SortKey, label: string, className?: string) => (
    <SortHeader href={sortHref(key)} label={label} active={sort === key} dir={dir} className={className} />
  );

  // Sorted by date: group the page by day. Otherwise: one flat list with the date on each row.
  const byDate = sort === "date";
  const days: { date: string; rows: typeof rows; net: number }[] = [];
  for (const r of rows) {
    const last = days.at(-1);
    if (last && (!byDate || last.date === r.date)) last.rows.push(r);
    else days.push({ date: r.date, rows: [r], net: 0 });
  }
  for (const d of days) d.net = d.rows.reduce((s, r) => s + (r.pending || r.excluded ? 0 : r.amount), 0);

  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={`${total.toLocaleString()} transaction${total === 1 ? "" : "s"}${f.q || f.category || f.account || f.from || f.to || f.review ? " match your filters" : ""}`}
      />

      <TransactionFilters filters={f} today={today} accounts={accts} categories={categoryOptions} />

      <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-lg">
        <Stat label="Money out" value={formatMoney(summary.out)} />
        <Stat label="Money in" value={`+${formatMoney(summary.in)}`} className="text-positive" />
        <Stat
          label="Net"
          value={`${summary.in - summary.out >= 0 ? "+" : "−"}${formatMoney(Math.abs(summary.in - summary.out))}`}
        />
      </div>

      <div className="surface mt-4 overflow-clip">
        {rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No transactions match"
            description="Try a different search, or clear your filters."
            action={
              <Link href="/transactions" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <>
            {/* Column headings (desktop) */}
            <div className="hidden grid-cols-[minmax(0,1fr)_11rem_10rem_7.5rem_2.25rem] items-center gap-4 border-b bg-muted/40 px-5 py-2.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase md:grid">
              <span className="flex items-center gap-3">
                {sortHeader("date", "Date")}
                {sortHeader("merchant", "Merchant")}
              </span>
              {sortHeader("category", "Category")}
              {sortHeader("account", "Account")}
              {sortHeader("amount", "Amount", "justify-self-end")}
              <span />
            </div>
            {days.map((d) => (
              <section key={d.date}>
                {byDate && (
                  <div className="sticky top-14 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-2 backdrop-blur md:px-5 lg:top-0">
                    <h2 className="font-sans text-xs font-semibold tracking-normal text-foreground">
                      {formatDayHeading(d.date, today)}
                    </h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {d.net > 0 ? formatMoney(d.net) : d.net < 0 ? `+${formatMoney(-d.net)}` : ""}
                    </span>
                  </div>
                )}
                <ul className="divide-y">
                  {d.rows.map((t) => {
                    const merchant = t.merchantName ?? t.name;
                    return (
                      <li
                        key={t.id}
                        className={cn(
                          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_11rem_10rem_7.5rem_2.25rem] md:gap-4 md:px-5",
                          t.excluded && "opacity-55",
                        )}
                      >
                        <div className="contents md:flex md:min-w-0 md:items-center md:gap-3">
                          <CategoryIcon name={t.categoryName ?? "Uncategorized"} color={t.categoryColor} />
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{merchant}</span>
                              {t.pending && <StatusChip>Pending</StatusChip>}
                              {t.needsReview && <StatusChip tone="warning">Review</StatusChip>}
                              {t.excluded && <StatusChip>Excluded</StatusChip>}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {!byDate && <span>{formatDayHeading(t.date, today)} · </span>}
                              <span className="md:hidden">
                                {t.accountName}
                                {t.accountMask && ` ••${t.accountMask}`}
                                {t.merchantName && t.merchantName !== t.name && " · "}
                              </span>
                              {t.merchantName && t.merchantName !== t.name && t.name}
                            </p>
                          </div>
                        </div>

                        <Amount amount={t.amount} className="justify-self-end text-sm md:order-4" />

                        <div className="col-span-3 flex min-w-0 items-center gap-2 pl-12 md:order-2 md:col-span-1 md:pl-0">
                          <CategorySelect
                            transactionId={t.id}
                            categoryId={t.categoryId}
                            categories={categoryOptions}
                            className="min-w-0"
                          />
                          <SourceBadge source={t.categorySource} className="md:hidden" />
                          <span className="ml-auto md:hidden">
                            <TransactionActions transactionId={t.id} excluded={t.excluded} merchant={merchant} />
                          </span>
                        </div>

                        <div className="hidden min-w-0 text-sm text-muted-foreground md:order-3 md:block">
                          <p className="truncate">{t.accountName}</p>
                          <p className="flex items-center gap-1.5 text-xs">
                            {t.accountMask && <span className="font-mono">••{t.accountMask}</span>}
                            <SourceBadge source={t.categorySource} />
                          </p>
                        </div>

                        <div className="hidden md:order-5 md:block">
                          <TransactionActions transactionId={t.id} excluded={t.excluded} merchant={merchant} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs sm:inline">
              Page {page} of {pages}
            </span>
            <PageLink href={pageHref(page - 1)} disabled={page <= 1} label="Previous page">
              <ChevronLeft />
            </PageLink>
            <PageLink href={pageHref(page + 1)} disabled={page >= pages} label="Next page">
              <ChevronRight />
            </PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  href,
  label,
  active,
  dir,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  dir: SortDir;
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn(
        "group inline-flex w-fit items-center gap-1 uppercase transition-colors hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      <Icon className={cn("size-3", !active && "opacity-40 group-hover:opacity-100")} />
    </Link>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="surface px-3 py-2.5 sm:px-4">
      <p className="text-[0.6875rem] font-medium text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 truncate text-sm font-semibold sm:text-base", className)}>{value}</p>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-40")}>
        {children}
      </span>
    );
  return (
    <Link href={href} aria-label={label} className={buttonVariants({ variant: "outline", size: "icon" })}>
      {children}
    </Link>
  );
}
