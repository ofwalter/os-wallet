"use client";

import { useState, useTransition } from "react";
import { confirmCategory, createRule, recategorize } from "@/app/actions";
import { Amount } from "@/components/transaction-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReviewTx = {
  id: number;
  date: string;
  amount: number;
  merchantName: string | null;
  name: string;
  pending: boolean;
  plaidDetailed: string | null;
  plaidConfidence: string | null;
  categoryId: number | null;
  categoryName: string | null;
  accountName: string;
};

export function ReviewItem({
  tx,
  categories,
}: {
  tx: ReviewTx;
  categories: { id: number; name: string; color: string }[];
}) {
  const merchant = tx.merchantName ?? tx.name;
  const [alwaysUse, setAlwaysUse] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (categoryId: number) =>
    startTransition(async () => {
      const res = await recategorize(tx.id, categoryId);
      if (!res.ok) return setError(res.error);
      if (alwaysUse && res.suggestion) {
        const rule = await createRule(res.suggestion);
        if (!rule.ok) setError(rule.error);
      }
    });

  return (
    <li className={cn("rounded-xl border p-4 transition-opacity", pending && "opacity-50")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium">
            {merchant}
            {tx.pending && <Badge variant="outline">Pending</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDate(tx.date)} · {tx.accountName}
            {tx.merchantName && tx.merchantName !== tx.name && ` · ${tx.name}`}
          </div>
          <div className="text-xs text-muted-foreground">
            Currently <strong className="text-foreground">{tx.categoryName ?? "Uncategorized"}</strong>
            {tx.plaidDetailed && ` · Plaid: ${tx.plaidDetailed}`}
            {tx.plaidConfidence && ` (${tx.plaidConfidence.toLowerCase().replace("_", " ")} confidence)`}
          </div>
        </div>
        <Amount amount={tx.amount} className="text-lg font-medium" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => choose(c.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50",
              c.id === tx.categoryId && "border-foreground",
            )}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={alwaysUse}
            onChange={(e) => setAlwaysUse(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Always use this category for “{merchant}”
        </label>
        {tx.categoryId !== null && (
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() =>
              alwaysUse
                ? choose(tx.categoryId!)
                : startTransition(async () => void (await confirmCategory(tx.id)))
            }
          >
            Looks right
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}
