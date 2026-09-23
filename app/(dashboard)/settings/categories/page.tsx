import { connection } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db, categories, merchantRules, transactions } from "@/lib/db";
import { listCategories } from "@/lib/queries";
import { CategoriesTabs } from "./category-controls";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await connection(); // always render per request
  const [cats, rules, usage] = await Promise.all([
    listCategories(),
    db
      .select({
        id: merchantRules.id,
        matchField: merchantRules.matchField,
        pattern: merchantRules.pattern,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(merchantRules)
      .innerJoin(categories, eq(merchantRules.categoryId, categories.id))
      .orderBy(asc(merchantRules.pattern)),
    db
      .select({ id: transactions.categoryId, n: count() })
      .from(transactions)
      .groupBy(transactions.categoryId),
  ]);
  const usageById = Object.fromEntries(usage.flatMap((u) => (u.id === null ? [] : [[u.id, u.n]])));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Categories"
        description="Organize how spending is grouped, and manage the rules that categorize merchants automatically."
      />
      <CategoriesTabs categories={cats} rules={rules} usage={usageById} />
    </div>
  );
}
