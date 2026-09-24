import "server-only";

// Minimal OpenRouter client (OpenAI-compatible chat completions). No SDK: the
// surface we need is one endpoint, and fetch keeps it out of client bundles.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5-nano";
const TIMEOUT_MS = 60_000;

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type Usage = { promptTokens: number; completionTokens: number };

export type ChatOptions = {
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "none" | "required";
  maxTokens?: number;
  /** Reasoning tokens cost money; plain rewrites need none, tool picking needs a little. */
  reasoning?: "minimal" | "low" | "medium";
};

export type ChatResult = { content: string; toolCalls: ToolCall[]; usage: Usage };

export const aiModel = () => process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

function body(opts: ChatOptions, stream: boolean) {
  return JSON.stringify({
    model: aiModel(),
    messages: opts.messages,
    tools: opts.tools?.length ? opts.tools : undefined,
    tool_choice: opts.tools?.length ? (opts.toolChoice ?? "auto") : undefined,
    reasoning: { effort: opts.reasoning ?? "minimal" },
    max_tokens: opts.maxTokens ?? 1000,
    stream,
    usage: { include: true },
  });
}

async function post(payload: string): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://os-wallet.vercel.app",
          "X-Title": "os-wallet",
        },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Network blip (DNS, connect timeout): one retry.
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 1) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const toUsage = (u: { prompt_tokens?: number; completion_tokens?: number } | undefined): Usage => ({
  promptTokens: u?.prompt_tokens ?? 0,
  completionTokens: u?.completion_tokens ?? 0,
});

/** One non-streaming completion. */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const res = await post(body(opts, false));
  const json = await res.json();
  if (json.error) throw new Error(`OpenRouter: ${json.error.message ?? "error"}`);
  const msg = json.choices?.[0]?.message ?? {};
  return { content: msg.content ?? "", toolCalls: msg.tool_calls ?? [], usage: toUsage(json.usage) };
}

/**
 * Streaming completion. Text deltas go to `onText` as they arrive; tool-call
 * fragments are stitched together and returned with the final usage.
 */
export async function chatStream(opts: ChatOptions, onText: (delta: string) => void): Promise<ChatResult> {
  const res = await post(body(opts, true));
  if (!res.body) throw new Error("OpenRouter: empty stream");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  let content = "";
  let usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const calls: ToolCall[] = [];

  const handle = (line: string) => {
    // SSE: "data: {...}" lines; ": comments" are keep-alives.
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(`OpenRouter: ${chunk.error.message ?? "error"}`);
    if (chunk.usage) usage = toUsage(chunk.usage);
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) {
      content += delta.content;
      onText(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const i = tc.index ?? 0;
      calls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].function.name += tc.function.name;
      if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl).trim());
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer.trim());

  return { content, toolCalls: calls.filter(Boolean), usage };
}
