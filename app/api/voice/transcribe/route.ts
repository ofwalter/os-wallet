import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { speechToText } from "@/lib/elevenlabs";

// Vercel caps request bodies at 4.5 MB; a minute of Opus is well under that.
const MAX_BYTES = 4 * 1024 * 1024;

// Turns a recorded question into text for the Agent chat.
export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Invalid recording" }, { status: 400 });
  }

  try {
    return NextResponse.json({ text: await speechToText(audio) });
  } catch (err) {
    console.error("stt failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't transcribe that" }, { status: 502 });
  }
}
