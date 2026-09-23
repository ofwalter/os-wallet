"use client";

import { Check, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmCategory, createRule, recategorize } from "@/app/actions";
import { CategoryIcon } from "@/components/category-icon";
import { Amount, StatusChip } from "@/components/transaction-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isPeerToPeer, peerAmountRange } from "@/lib/category-map";
import { formatAmountRange, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReviewTx = {
  id: number;
  date: string;
  amount: number;
  merchantName: string | null;
  name: string;
  pending: boolean;
  plaidPrimary: string | null;
  plaidDetailed: string | null;
  plaidConfidence: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string;
};

type Option = { id: number; name: string; color: string; kind: "expense" | "income" | "transfer" };

const title = (s: string) =>
  s
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase());

/** "FOOD_AND_DRINK" + "FOOD_AND_DRINK_COFFEE" → "Food and drink › Coffee". */
function plaidLabel(primary: string | null, detailed: string | null): string | null {
  if (!detailed && !primary) return null;
  if (primary && detailed?.startsWith(`${primary}_`)) {
    return `${title(primary)} › ${title(detailed.slice(primary.length + 1))}`;
  }
  return title(detailed ?? primary!);
}

export function ReviewItem({ tx, categories }: { tx: ReviewTx; categories: Option[] }) {
  const merchant = tx.merchantName ?? tx.name;
  // A payment to a person only gets a rule when I opt in, and then only for similar amounts.
  const peer = isPeerToPeer(tx.plaidDetailed);
  const range = peer ? peerAmountRange(tx.amount) : null;
  const [alwaysUse, setAlwaysUse] = useState(!peer);
  const [filed, setFiled] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const plaid = plaidLabel(tx.plaidPrimary, tx.plaidDetailed);
  const confidence = tx.plaidConfidence?.toLowerCase().replace("_", " ");

  const choose = (categoryId: number) =>
    startTransition(async () => {
      const name = categories.find((c) => c.id === categoryId)?.name ?? "category";
      const res = await recategorize(tx.id, categoryId);
      if (!res.ok) {
        toast.error("Couldn't save", { description: res.error });
        return;
      }
      if (alwaysUse && res.suggestion) {
        const rule = await createRule(res.suggestion);
        if (!rule.ok) toast.error("Saved, but the rule failed", { description: rule.error });
        else
          toast.success(`${merchant} → ${name}`, {
            description:
              rule.applied > 0
                ? `Rule created and applied to ${rule.applied} more transaction${rule.applied === 1 ? "" : "s"}.`
                : "Rule created for future transactions.",
          });
      } else toast.success(`${merchant} → ${name}`);
      setFiled(name);
    });

  const confirm = () =>
    alwaysUse && tx.categoryId !== null
      ? choose(tx.categoryId)
      : startTransition(async () => {
          const res = await confirmCategory(tx.id);
          if (res.ok) setFiled(tx.categoryName ?? "category");
        });

  if (filed) {
    return (
      <li className="surface flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground duration-300 animate-in fade-in-0">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-positive/15 text-positive">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <span className="truncate">
          <span className="font-medium text-foreground">{merchant}</span> filed as {filed}
        </span>
      </li>
    );
  }

  const groups: { label: string; items: Option[] }[] = [
    { label: "Spending", items: categories.filter((c) => c.kind === "expense") },
    { label: "Income & transfers", items: categories.filter((c) => c.kind !== "expense") },
  ];

  return (
    <li className={cn("surface overflow-hidden transition-opacity", pending && "pointer-events-none opacity-60")}>
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        <CategoryIcon name={tx.categoryName ?? "Uncategorized"} color={tx.categoryColor} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-heading text-base font-semibold tracking-tight">{merchant}</p>
                {tx.pending && <StatusChip>Pending</StatusChip>}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(tx.date)} · {tx.accountName}
                {tx.merchantName && tx.merchantName !== tx.name && ` · ${tx.name}`}
              </p>
            </div>
            <Amount amount={tx.amount} className="num shrink-0 text-lg font-semibold" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Currently <span className="font-medium text-foreground">{tx.categoryName ?? "Uncategorized"}</span>
            </span>
            {plaid && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3 text-brand" />
                Plaid: {plaid}
                {confidence && <span className="opacity-80">({confidence} confidence)</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t bg-muted/30 px-4 py-4 sm:px-5">
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.label}>
                <p className="eyebrow mb-2">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((c) => {
                    const current = c.id === tx.categoryId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={pending}
                        onClick={() => choose(c.id)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-xs transition-all hover:-translate-y-px hover:border-foreground/20 hover:shadow-sm active:translate-y-0 disabled:opacity-50",
                          current && "border-brand/50 ring-2 ring-brand/15",
                        )}
                      >
                        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                        {current && <Check className="size-3 text-brand" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
        )}

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-w-0 cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
            <Switch checked={alwaysUse} onCheckedChange={setAlwaysUse} size="sm" />
            <span className="truncate">
              Always use for <span className="font-medium text-foreground">“{merchant}”</span>
              {range && (
                <>
                  {" "}
                  payments of{" "}
                  <span className="num font-medium text-foreground">
                    {formatAmountRange(range.minAmount, range.maxAmount)}
                  </span>
                </>
              )}
            </span>
          </label>
          {tx.categoryId !== null && (
            <Button size="sm" onClick={confirm} disabled={pending} className="self-start sm:self-auto">
              <Check />
              Looks right
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
