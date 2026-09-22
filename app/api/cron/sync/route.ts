import { NextResponse } from "next/server";
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
  return NextResponse.json(run, { status: run.status === "error" ? 500 : 200 });
}
