// Seeds the default categories. Safe to re-run: existing names are left alone.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { categories } from "../lib/db/schema";
import { SEED_CATEGORIES } from "../lib/categories-seed";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!));
  const inserted = await db
    .insert(categories)
    .values(SEED_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })))
    .onConflictDoNothing({ target: categories.name })
    .returning({ name: categories.name });
  console.log(`Seeded ${inserted.length} new categories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
