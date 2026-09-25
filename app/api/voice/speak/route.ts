import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { textToSpeech } from "@/lib/elevenlabs";

const Body = z.object({ text: z.string().trim().min(1).max(2000) });

// Reads text aloud; streams MP3 back as ElevenLabs produces it.
export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const audio = await textToSpeech(parsed.data.text);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("tts failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't generate audio" }, { status: 502 });
  }
}
