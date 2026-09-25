"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { AgentMark } from "@/components/agent-mark";
import { Button } from "@/components/ui/button";
import { MicButton, SpeakButton, speak } from "@/components/voice";
import type { AgentEvent } from "@/lib/ai/agent";
import { stripTrailingOffer } from "@/lib/ai/format";
import { cn } from "@/lib/utils";

type Message = { id: number | string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What did I spend this month?",
  "Biggest expenses last month",
  "What are my subscriptions?",
  "Am I on budget?",
];

export function Chat({
  conversationId,
  initialMessages,
}: {
  conversationId: number | null;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const idRef = useRef(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const setAnswer = (fn: (prev: string) => string) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, content: fn(last.content) }];
    });

  /** `voice`: the question was spoken, so read the answer back when it's done. */
  async function send(text: string, { voice = false } = {}) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setStatus("Thinking…");
    const answerId = `a${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u${Date.now()}`, role: "user", content: message },
      { id: answerId, role: "assistant", content: "" },
    ]);
    let answer = "";
    let failed = false;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: idRef.current ?? undefined, message }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "You're signed out. Reload the page." : "Request failed");

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      const handle = (e: AgentEvent) => {
        if (e.type === "conversation") {
          idRef.current = e.id;
          window.history.replaceState(null, "", `/agent?c=${e.id}`);
        } else if (e.type === "status") setStatus(e.text);
        else if (e.type === "reset") {
          answer = "";
          setAnswer(() => "");
        } else if (e.type === "text") {
          setStatus(null);
          answer += e.delta;
          setAnswer((prev) => prev + e.delta);
        } else if (e.type === "error") {
          failed = true;
          setAnswer(() => e.message);
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) handle(JSON.parse(line));
        }
      }
      if (voice && !failed && answer.trim()) speak(String(answerId), stripTrailingOffer(answer));
    } catch (err) {
      setAnswer(() => (err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      setBusy(false);
      setStatus(null);
      router.refresh(); // updates the chat list
      inputRef.current?.focus();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="surface flex h-[calc(100dvh-17rem)] min-h-[26rem] flex-col overflow-hidden lg:h-[calc(100dvh-14rem)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/15">
              <AgentMark className="size-10" strokeWidth={1.5} mood="idle" />
            </span>
            <div className="space-y-1">
              <p className="font-heading font-semibold tracking-tight">Agent here. What do you want to know?</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Ask things like “How much have I spent at Trader Joe’s this year?”
              </p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="inline-flex h-8 items-center rounded-full border bg-card px-3 text-xs font-medium shadow-xs transition-all hover:-translate-y-px hover:border-foreground/20 hover:shadow-sm active:translate-y-0"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {m.content}
                  </p>
                ) : (
                  <div className="flex max-w-[92%] gap-2.5">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <AgentMark
                        className="size-5"
                        strokeWidth={1.9}
                        mood={i !== messages.length - 1 ? "still" : busy ? "thinking" : "idle"}
                      />
                    </span>
                    <div className="min-w-0 pt-1 text-sm leading-relaxed">
                      {m.content ? (
                        busy && i === messages.length - 1 ? (
                          <Formatted text={m.content} />
                        ) : (
                          <>
                            <Formatted text={stripTrailingOffer(m.content)} />
                            <SpeakButton id={String(m.id)} text={stripTrailingOffer(m.content)} className="mt-1 -ml-1.5" />
                          </>
                        )
                      ) : busy && i === messages.length - 1 ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <TypingDots />
                          {status}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t bg-muted/30 p-3 sm:p-4"
      >
        <div className="flex items-end gap-2 rounded-xl border bg-card p-1.5 pl-3 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Ask about your spending…"
            aria-label="Message"
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none field-sizing-content placeholder:text-muted-foreground"
          />
          <MicButton disabled={busy} onText={(t) => send(t, { voice: true })} />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
            <ArrowUp />
          </Button>
        </div>
      </form>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-pulse rounded-full bg-brand/70" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

/** Tiny formatter for the model's replies: paragraphs, "- " bullets, and **bold**. */
function Formatted({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+\.)\s+/.test(line);
    if (!line.trim()) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    const content = bullet ? line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "") : line;
    if (last && last.list === bullet && last.lines.length) last.lines.push(content);
    else blocks.push({ list: bullet, lines: [content] });
  }
  return (
    <div className="space-y-2">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.list ? (
            <ul key={i} className="list-disc space-y-0.5 pl-4 marker:text-muted-foreground">
              {b.lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Inline text={l} />
                </Fragment>
              ))}
            </p>
          ),
        )}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
