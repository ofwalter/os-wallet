import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

type Db = ReturnType<typeof createDb>;
let instance: Db | undefined;

// Connect lazily so `next build` works without DATABASE_URL.
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= createDb();
    return Reflect.get(instance, prop, instance);
  },
});

export * from "./schema";
