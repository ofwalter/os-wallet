"use client";

import { Loader2, Mic, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------- Playback: one clip at a time across the whole app ----------

type Playing = { key: string; phase: "loading" | "playing" } | null;

let playing: Playing = null;
let audio: HTMLAudioElement | null = null;
let abort: AbortController | null = null;
const listeners = new Set<() => void>();

function setPlaying(next: Playing) {
  playing = next;
  listeners.forEach((l) => l());
}

export function stopSpeaking() {
  abort?.abort();
  abort = null;
  if (audio) {
    audio.pause();
    URL.revokeObjectURL(audio.src);
    audio = null;
  }
  setPlaying(null);
}

/** Reads `text` aloud via /api/voice/speak. `key` identifies the clip so its button can show state. */
export async function speak(key: string, text: string) {
  stopSpeaking();
  const controller = new AbortController();
  abort = controller;
  setPlaying({ key, phase: "loading" });
  try {
    const res = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Couldn't play that");
    const blob = await res.blob();
    if (controller.signal.aborted) return;
    const el = new Audio(URL.createObjectURL(blob));
    el.onended = stopSpeaking;
    audio = el;
    await el.play();
    setPlaying({ key, phase: "playing" });
  } catch (err) {
    if (controller.signal.aborted) return;
    stopSpeaking();
    toast.error(err instanceof Error && err.name !== "NotAllowedError" ? err.message : "Couldn't play that");
  }
}

function usePlaying(): Playing {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => playing,
    () => null,
  );
}

export function SpeakButton({ id, text, className }: { id: string; text: string; className?: string }) {
  const p = usePlaying();
  const mine = p?.key === id ? p.phase : null;
  const label = mine ? "Stop" : "Read aloud";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={!text.trim()}
      onClick={() => (mine ? stopSpeaking() : speak(id, text))}
      className={cn("text-muted-foreground", mine && "text-brand", className)}
    >
      {mine === "loading" ? <Loader2 className="animate-spin" /> : mine === "playing" ? <Square /> : <Volume2 />}
    </Button>
  );
}

// ---------- Recording ----------

const MAX_RECORDING_MS = 60_000;

/** Tap to record, tap again to stop; the transcript is handed to `onText`. */
export function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Release the mic if the chat unmounts mid-recording.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    stopSpeaking();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access was blocked");
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearTimeout(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 1000) return setPhase("idle"); // an accidental tap
      setPhase("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't transcribe that");
        if (data.text) onText(data.text);
        else toast.error("Didn't catch that. Try again?");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't transcribe that");
      } finally {
        setPhase("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setPhase("recording");
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
  }

  const label = phase === "recording" ? "Stop recording" : phase === "transcribing" ? "Transcribing…" : "Ask by voice";
  return (
    <Button
      type="button"
      variant={phase === "recording" ? "destructive" : "ghost"}
      size="icon"
      aria-label={label}
      title={label}
      disabled={phase === "transcribing" || (disabled && phase === "idle")}
      onClick={() => (phase === "recording" ? recorder.current?.stop() : start())}
      className={cn(phase === "idle" && "text-muted-foreground")}
    >
      {phase === "transcribing" ? (
        <Loader2 className="animate-spin" />
      ) : phase === "recording" ? (
        <Square className="animate-pulse" />
      ) : (
        <Mic />
      )}
    </Button>
  );
}
