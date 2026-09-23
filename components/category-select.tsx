"use client";

import { ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRule, recategorize, type RuleSuggestion } from "@/app/actions";
import { ColorDot } from "@/components/category-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatAmountRange } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CategoryOption = { id: number; name: string; color: string };

/** Offers "Always use X for Y?" as a toast action after a manual change. */
export function offerRule(suggestion: RuleSuggestion) {
  const range = formatAmountRange(suggestion.minAmount, suggestion.maxAmount);
  const target = range ? `“${suggestion.pattern}” payments of ${range}` : `“${suggestion.pattern}”`;
  toast.success(`Categorized as ${suggestion.categoryName}`, {
    description: `Always use ${suggestion.categoryName} for ${target}?`,
    duration: 9000,
    action: {
      label: "Always",
      onClick: async () => {
        const res = await createRule(suggestion);
        if (res.ok)
          toast.success("Rule created", {
            description:
              res.applied > 0
                ? `Applied to ${res.applied} other transaction${res.applied === 1 ? "" : "s"}.`
                : `Future ${target} transactions will use ${suggestion.categoryName}.`,
          });
        else toast.error("Couldn't create rule", { description: res.error });
      },
    },
  });
}

/** Inline category pill. After a change, offers "Always use X for Y?". */
export function CategorySelect({
  transactionId,
  categoryId,
  categories,
  className,
}: {
  transactionId: number;
  categoryId: number | null;
  categories: CategoryOption[];
  className?: string;
}) {
  const [value, setValue] = useState(categoryId);
  // Follow server updates (e.g. a merchant rule recategorized this row).
  const [lastProp, setLastProp] = useState(categoryId);
  if (categoryId !== lastProp) {
    setLastProp(categoryId);
    setValue(categoryId);
  }
  const [pending, startTransition] = useTransition();
  const byId = new Map(categories.map((c) => [c.id, c]));

  return (
    <Select<number>
      value={value}
      onValueChange={(next) => {
        if (next === null || next === value) return;
        const previous = value;
        setValue(next);
        startTransition(async () => {
          const res = await recategorize(transactionId, next);
          if (!res.ok) {
            setValue(previous);
            toast.error("Couldn't recategorize", { description: res.error });
          } else if (res.suggestion) offerRule(res.suggestion);
        });
      }}
      disabled={pending}
    >
      <SelectTrigger
        size="sm"
        aria-label="Category"
        className={cn(
          "h-7 max-w-full gap-1.5 rounded-full border-transparent bg-muted/70 px-2.5 text-xs font-medium hover:bg-muted dark:bg-muted/60 [&>svg:last-child]:hidden",
          className,
        )}
      >
        <SelectValue>
          {(v: number | null) => {
            const c = v === null ? undefined : byId.get(v);
            return (
              <span className="flex min-w-0 items-center gap-1.5">
                <ColorDot color={c?.color ?? "var(--muted-foreground)"} />
                <span className="truncate">{c?.name ?? "Uncategorized"}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-80 min-w-48">
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id} className="text-sm">
            <ColorDot color={c.color} />
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
