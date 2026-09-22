import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, accounts, categories, transactions } from "@/lib/db";
import { listCategories, reviewCount } from "@/lib/queries";
import { ReviewItem } from "./review-item";

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
        plaidDetailed: transactions.plaidDetailed,
        plaidConfidence: transactions.plaidConfidence,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
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
  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Review</h1>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nothing to review."
            : `${total} transaction${total === 1 ? "" : "s"} need a category.` +
              (total > BATCH ? ` Showing the newest ${BATCH}.` : "")}
        </p>
      </div>
      <ul className="space-y-3">
        {rows.map((t) => (
          <ReviewItem key={t.id} tx={t} categories={options} />
        ))}
      </ul>
    </div>
  );
}
