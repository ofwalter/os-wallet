"use client";

import { useState, useTransition } from "react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function HideAccountSwitch({ accountId, hidden }: { accountId: number; hidden: boolean }) {
  const [pending, startTransition] = useTransition();
  const id = `hide-${accountId}`;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Hidden
      </Label>
      <Switch
        id={id}
        checked={hidden}
        disabled={pending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            await setAccountHidden(accountId, checked);
          })
        }
      />
    </div>
  );
}

export function RemoveItemButton({ itemId, name }: { itemId: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Remove
      </Button>
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
                  if (res.ok) setOpen(false);
                  else setError(res.error);
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
