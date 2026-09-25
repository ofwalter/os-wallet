import "server-only";

// Minimal ElevenLabs client: text-to-speech and speech-to-text. No SDK, same
// reasoning as openrouter.ts — two endpoints, fetch is enough.

const API = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_flash_v2_5"; // cheapest/fastest; eleven_multilingual_v2 sounds a bit better
const STT_MODEL = "scribe_v1";
const TIMEOUT_MS = 30_000;

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

/** Markdown the chat renders means nothing out loud; drop it so it isn't read as symbols. */
export function speakable(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Returns an MP3 stream of `text` read aloud. */
export async function textToSpeech(text: string): Promise<ReadableStream<Uint8Array>> {
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!voice) throw new Error("ELEVENLABS_VOICE_ID is not set");
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: speakable(text), model_id: TTS_MODEL }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.body;
}

/** Transcribes a short recording (webm/ogg/mp4 from MediaRecorder all work). */
export async function speechToText(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("model_id", STT_MODEL);
  form.append("file", audio, "recording");
  form.append("tag_audio_events", "false");
  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
