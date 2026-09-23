import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, PartyPopper } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { db, accounts, categories, transactions } from "@/lib/db";
import { listCategories, reviewCount } from "@/lib/queries";
import { ReviewItem } from "./review-item";

export const metadata = { title: "Review" };

const BATCH = 50;

export default async function ReviewPage() {
  await connection(); // always render per request
  const [rows, total, cats] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        merchantName: transactions.merchantName,
        name: transactions.name,
        pending: transactions.pending,
        plaidPrimary: transactions.plaidPrimary,
        plaidDetailed: transactions.plaidDetailed,
        plaidConfidence: transactions.plaidConfidence,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        accountName: accounts.name,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.needsReview, true))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(BATCH),
    reviewCount(),
    listCategories(),
  ]);
  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Review"
        description={
          total === 0
            ? "Every transaction has a category you trust."
            : `${total} transaction${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} a quick look.` +
              (total > BATCH ? ` Showing the newest ${BATCH}.` : "")
        }
        actions={
          total > 0 && (
            <span className="inline-flex h-8 items-center gap-2 rounded-full bg-brand/10 px-3 text-sm font-semibold text-brand tabular-nums">
              {total} left
            </span>
          )
        }
      />

      {rows.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={PartyPopper}
            title="All caught up"
            description="New transactions that Plaid isn't sure about will land here after each sync."
            action={
              <Link href="/transactions" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Browse transactions <ArrowRight />
              </Link>
            }
            className="py-20"
          />
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Pick a category to file a transaction. With “Always” on, a merchant rule is created so future ones are
            categorized automatically.
          </p>
          <ul className="space-y-3">
            {rows.map((t) => (
              <ReviewItem key={t.id} tx={t} categories={options} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
