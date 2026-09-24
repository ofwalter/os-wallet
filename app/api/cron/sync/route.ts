import { NextResponse } from "next/server";
import { generateWeeklyInsight } from "@/lib/ai/insight";
import { safeEqual } from "@/lib/session";
import { runSync } from "@/lib/sync";

export const maxDuration = 300;

// Vercel Cron sends GET with `Authorization: Bearer ${CRON_SECRET}`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await runSync("cron");

  // Weekly budget check-in: a no-op on days that already have this week's.
  try {
    await generateWeeklyInsight();
  } catch (err) {
    console.error("weekly insight failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json(run, { status: run.status === "error" ? 500 : 200 });
}
