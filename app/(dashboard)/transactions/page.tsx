import { connection } from "next/server";
import { and, asc, count, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { CategorySelect, selectClass } from "@/components/category-select";
import { ExcludeToggle } from "@/components/exclude-toggle";
import { Amount, SourceBadge } from "@/components/transaction-bits";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, accounts, transactions } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listCategories } from "@/lib/queries";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type Filters = {
  from?: string;
  to?: string;
  account?: string;
  category?: string;
  q?: string;
  review?: string;
  page?: string;
};

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s: string | undefined): s is string => !!s && /^\d+$/.test(s);

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  await connection(); // always render per request
  const sp = await searchParams;
  const f: Filters = {
    from: str(sp.from),
    to: str(sp.to),
    account: str(sp.account),
    category: str(sp.category),
    q: str(sp.q),
    review: str(sp.review),
    page: str(sp.page),
  };
  const page = Math.max(1, Number(f.page) || 1);

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

  const [rows, [{ total }], cats, accts] = await Promise.all([
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
        accountName: accounts.name,
        accountMask: accounts.mask,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(condition)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(transactions).where(condition),
    listCategories(),
    db
      .select({ id: accounts.id, name: accounts.name, mask: accounts.mask })
      .from(accounts)
      .orderBy(asc(accounts.name)),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryOptions = cats.map((c) => ({ id: c.id, name: c.name }));

  const pageHref = (p: number) => {
    const params = new URLSearchParams(
      Object.entries({ ...f, page: String(p) }).filter((e): e is [string, string] => !!e[1]),
    );
    return `/transactions?${params}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={f.from} className="w-36" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={f.to} className="w-36" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Account</span>
          <select name="account" defaultValue={f.account ?? ""} className={cn(selectClass, "w-44")}>
            <option value="">All accounts</option>
            {accts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.mask ? ` ••${a.mask}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Category</span>
          <select name="category" defaultValue={f.category ?? ""} className={cn(selectClass, "w-40")}>
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Search</span>
          <Input name="q" defaultValue={f.q} placeholder="Merchant or description" className="w-52" />
        </label>
        <label className="flex h-8 items-center gap-2">
          <input
            type="checkbox"
            name="review"
            value="1"
            defaultChecked={f.review === "1"}
            className="size-4 accent-primary"
          />
          Needs review
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
        <Link href="/transactions" className={buttonVariants({ size: "sm", variant: "ghost" })}>
          Clear
        </Link>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Source</TableHead>
            <TableHead title="Exclude from totals">Excl.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No transactions match.
              </TableCell>
            </TableRow>
          )}
          {rows.map((t) => (
            <TableRow key={t.id} className={t.excluded ? "opacity-60" : undefined}>
              <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
              <TableCell className="max-w-64">
                <div className="flex items-center gap-2">
                  <span className="truncate">{t.merchantName ?? t.name}</span>
                  {t.pending && <Badge variant="outline">Pending</Badge>}
                  {t.needsReview && <Badge variant="secondary">Review</Badge>}
                </div>
                {t.merchantName && t.merchantName !== t.name && (
                  <div className="truncate text-xs text-muted-foreground">{t.name}</div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Amount amount={t.amount} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {t.accountName}
                {t.accountMask && ` ••${t.accountMask}`}
              </TableCell>
              <TableCell>
                <CategorySelect
                  transactionId={t.id}
                  categoryId={t.categoryId}
                  categories={categoryOptions}
                />
              </TableCell>
              <TableCell>
                <SourceBadge source={t.categorySource} />
              </TableCell>
              <TableCell>
                <ExcludeToggle transactionId={t.id} excluded={t.excluded} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total.toLocaleString()} transactions · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={pageHref(page + 1)} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
