"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { syncNow } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SyncNowButton({
  variant = "default",
  className,
}: {
  variant?: "default" | "icon";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const id = toast.loading("Syncing with your banks…");
      const res = await syncNow();
      if (res.ok) toast.success("Sync complete", { id, description: res.summary });
      else toast.error("Sync failed", { id, description: res.error });
    });

  const icon = <RefreshCw className={cn(pending && "animate-spin")} />;

  if (variant === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Sync now"
              disabled={pending}
              onClick={run}
              className={className}
            />
          }
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent>Sync now</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button variant="outline" disabled={pending} onClick={run} className={className}>
      {icon}
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
