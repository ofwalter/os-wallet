import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Defense in depth for server actions and routes (proxy.ts is the primary gate). */
export async function requireAuth(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) throw new Error("Unauthorized");
}
