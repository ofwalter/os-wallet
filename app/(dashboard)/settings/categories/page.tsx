import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, categories, merchantRules } from "@/lib/db";
import { listCategories } from "@/lib/queries";
import { AddCategoryForm, CategoryRow, DeleteRuleButton } from "./category-controls";

export default async function CategoriesPage() {
  await connection(); // always render per request
  const [cats, rules] = await Promise.all([
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
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {cats.map((c, i) => (
              <CategoryRow key={c.id} category={c} isFirst={i === 0} isLast={i === cats.length - 1} />
            ))}
          </ul>
          <AddCategoryForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Merchant rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Recategorize a transaction and choose “Always use” to create one.
            </p>
          ) : (
            <ul className="divide-y">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {r.matchField === "merchant_name" ? "Merchant" : "Description"} contains{" "}
                    </span>
                    <strong>{r.pattern}</strong>
                    <span className="text-muted-foreground"> → </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: r.categoryColor }}
                      />
                      {r.categoryName}
                    </span>
                  </div>
                  <DeleteRuleButton ruleId={r.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
