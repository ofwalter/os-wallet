import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent, type AgentEvent } from "@/lib/ai/agent";
import { requireAuth } from "@/lib/auth";

export const maxDuration = 60;

const Body = z.object({
  conversationId: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(2000),
});

// Streams newline-delimited JSON events (see AgentEvent) while Agent works.
export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runAgent(parsed.data, emit);
      } catch (err) {
        console.error("agent failed:", err instanceof Error ? err.message : err);
        emit({ type: "error", message: "Agent ran into a problem. Try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
