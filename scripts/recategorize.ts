// Re-applies merchant rules and the Plaid category map to every non-manual transaction.
// Run after changing lib/category-map.ts or the rule matching logic.
//   npm run db:recategorize -- --dry-run   # show what would change
//   npm run db:recategorize                # apply
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  // Imported after dotenv so lib/db sees DATABASE_URL.
  const { db, categories } = await import("../lib/db");
  const { recategorizeExisting } = await import("../lib/categorize");

  const dryRun = process.argv.includes("--dry-run");
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));
  const label = (id: number | null) => (id === null ? "(none)" : (nameOf.get(id) ?? `#${id}`));

  const changes = await recategorizeExisting({ dryRun });
  for (const { row, next } of changes) {
    const review = next.needsReview ? " [review]" : "";
    console.log(
      `${row.date}  ${row.amount.toFixed(2).padStart(10)}  ${(row.merchantName ?? row.name).slice(0, 32).padEnd(32)}` +
        `  ${label(row.categoryId)} → ${label(next.categoryId)}${review}`,
    );
  }
  console.log(`${dryRun ? "Would update" : "Updated"} ${changes.length} transactions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
