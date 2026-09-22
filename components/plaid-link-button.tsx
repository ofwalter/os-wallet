"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnEvent,
  type PlaidLinkOnSuccess,
} from "react-plaid-link";
import { markReconnected } from "@/app/actions";
import { Button } from "@/components/ui/button";

type Props =
  | { mode: "new"; linkedInstitutionIds: string[]; disabled?: boolean }
  | { mode: "update"; itemId: number };

type Message = { text: string; error: boolean };

export function PlaidLinkButton(props: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const exitRef = useRef<(() => void) | null>(null);

  const itemId = props.mode === "update" ? props.itemId : undefined;
  // A string keeps the callback below stable across renders.
  const linkedKey = props.mode === "new" ? props.linkedInstitutionIds.join("|") : "";

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setToken(null);
      setBusy(true);
      try {
        if (itemId !== undefined) {
          const res = await markReconnected(itemId);
          setMessage(res.ok ? { text: "Reconnected.", error: false } : { text: res.error, error: true });
        } else {
          setMessage({ text: "Linking and pulling transactions…", error: false });
          const res = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_token: publicToken,
              institution_name: metadata.institution?.name,
            }),
          });
          const body = await res.json();
          if (!res.ok) setMessage({ text: body.error ?? "Linking failed", error: true });
          else
            setMessage({
              text:
                `Linked ${body.institutionName ?? "bank"}: ${body.added} transactions so far.` +
                (body.added < 10 ? " History can take a while to arrive; the daily sync picks up the rest." : "") +
                (body.syncError ? ` (Initial sync: ${body.syncError})` : ""),
              error: false,
            });
        }
      } finally {
        setBusy(false);
        router.refresh();
      }
    },
    [itemId, router],
  );

  // Warn and bail out *before* credentials are entered, so no duplicate Item is created.
  const onEvent = useCallback<PlaidLinkOnEvent>(
    (eventName, metadata) => {
      if (
        eventName === "SELECT_INSTITUTION" &&
        metadata.institution_id &&
        linkedKey.split("|").includes(metadata.institution_id)
      ) {
        setMessage({
          text: `${metadata.institution_name ?? "That bank"} is already linked. Use Reconnect on it instead of linking again.`,
          error: true,
        });
        exitRef.current?.();
      }
    },
    [linkedKey],
  );

  const { open, ready, exit } = usePlaidLink({
    token,
    onSuccess,
    onEvent,
    onExit: () => setToken(null),
  });
  useEffect(() => {
    exitRef.current = () => exit({ force: true });
  }, [exit]);

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId !== undefined ? { itemId } : {}),
      });
      const body = await res.json();
      if (!res.ok) setMessage({ text: body.error ?? "Could not start Plaid Link", error: true });
      else setToken(body.link_token);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !!token || (props.mode === "new" && props.disabled);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant={props.mode === "new" ? "default" : "outline"}
        disabled={disabled}
        onClick={start}
      >
        {busy ? "Working…" : props.mode === "new" ? "Link a bank" : "Reconnect"}
      </Button>
      {message && (
        <p className={message.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
