"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnEvent,
  type PlaidLinkOnSuccess,
} from "react-plaid-link";
import { toast } from "sonner";
import { markReconnected } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = { className?: string } & (
  | { mode: "new"; linkedInstitutionIds: string[]; disabled?: boolean }
  | { mode: "update"; itemId: number }
);

export function PlaidLinkButton(props: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
          const id = toast.loading("Reconnecting and syncing…");
          const res = await markReconnected(itemId);
          if (res.ok) toast.success("Reconnected", { id });
          else toast.error("Reconnect issue", { id, description: res.error });
        } else {
          const id = toast.loading("Linking and pulling transactions…");
          const res = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_token: publicToken,
              institution_name: metadata.institution?.name,
            }),
          });
          const body = await res.json();
          if (!res.ok) toast.error("Linking failed", { id, description: body.error ?? "Unknown error" });
          else
            toast.success(`Linked ${body.institutionName ?? "bank"}`, {
              id,
              duration: 10000,
              description:
                `${body.added} transactions so far.` +
                (body.added < 10 ? " History can take a while to arrive; the daily sync picks up the rest." : "") +
                (body.syncError ? ` Initial sync: ${body.syncError}` : ""),
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
        toast.warning(`${metadata.institution_name ?? "That bank"} is already linked`, {
          description: "Use Reconnect on it instead of linking again — a duplicate would use another connection slot.",
          duration: 10000,
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
    try {
      const res = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId !== undefined ? { itemId } : {}),
      });
      const body = await res.json();
      if (!res.ok) toast.error("Could not start Plaid Link", { description: body.error });
      else setToken(body.link_token);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !!token || (props.mode === "new" && props.disabled);
  return props.mode === "new" ? (
    <Button disabled={disabled} onClick={start} className={cn("bg-brand text-brand-foreground hover:bg-brand/90", props.className)}>
      <Plus />
      {busy ? "Opening…" : "Link a bank"}
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled={disabled} onClick={start} className={props.className}>
      <RefreshCw className={cn(busy && "animate-spin")} />
      {busy ? "Working…" : "Reconnect"}
    </Button>
  );
}
