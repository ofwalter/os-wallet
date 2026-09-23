"use client";

import { Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { removeItem, setAccountHidden } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Checked = the account shows up in balances and totals. */
export function VisibleAccountSwitch({ accountId, hidden, name }: { accountId: number; hidden: boolean; name: string }) {
  const [, startTransition] = useTransition();
  const [isHidden, setOptimistic] = useOptimistic(hidden);
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Switch
          aria-label={`Include ${name} in totals`}
          checked={!isHidden}
          onCheckedChange={(checked) =>
            startTransition(async () => {
              setOptimistic(!checked);
              const res = await setAccountHidden(accountId, !checked);
              if (!res.ok) toast.error("Couldn't update account");
            })
          }
        />
      </TooltipTrigger>
      <TooltipContent>{isHidden ? "Hidden from totals" : "Included in totals"}</TooltipContent>
    </Tooltip>
  );
}

export function RemoveItemButton({ itemId, name }: { itemId: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${name}`}
              onClick={() => setOpen(true)}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>Remove connection</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {name}?</DialogTitle>
            <DialogDescription>
              This disconnects the bank at Plaid and permanently deletes its accounts and
              transactions here, including manual categories. It frees one connection slot.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await removeItem(itemId);
                  if (res.ok) {
                    setOpen(false);
                    toast.success(`${name} removed`);
                  } else setError(res.error);
                })
              }
            >
              {pending ? "Removing…" : "Remove and delete data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
