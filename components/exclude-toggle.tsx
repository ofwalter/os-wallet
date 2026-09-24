"use client";

import { CalendarPlus, Eye, EyeOff, MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { addBillFromTransaction, setExcluded } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Per-row "…" menu: exclude/include in totals, add as a budget bill, and jump to the merchant's history. */
export function TransactionActions({
  transactionId,
  excluded,
  merchant,
}: {
  transactionId: number;
  excluded: boolean;
  merchant: string;
}) {
  const [, startTransition] = useTransition();
  const [isExcluded, setOptimistic] = useOptimistic(excluded);

  const toggle = () =>
    startTransition(async () => {
      const next = !isExcluded;
      setOptimistic(next);
      const res = await setExcluded(transactionId, next);
      if (res.ok) toast(next ? "Excluded from totals" : "Included in totals");
      else toast.error("Couldn't update transaction");
    });

  const addBill = () =>
    startTransition(async () => {
      const res = await addBillFromTransaction(transactionId);
      if (res.ok) toast.success(`${res.label} added to your fixed bills`);
      else toast.error(res.error);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="Transaction actions" className="text-muted-foreground" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={toggle}>
          {isExcluded ? <Eye /> : <EyeOff />}
          {isExcluded ? "Include in totals" : "Exclude from totals"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={addBill}>
          <CalendarPlus />
          Add to budget as a bill
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`/transactions?q=${encodeURIComponent(merchant)}`} />}>
          <Search />
          <span className="truncate">All from {merchant}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
