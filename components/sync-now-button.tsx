"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const res = await syncNow();
            setMessage(res.ok ? { text: res.summary, error: false } : { text: res.error, error: true });
          })
        }
      >
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {message && (
        <p className={message.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
