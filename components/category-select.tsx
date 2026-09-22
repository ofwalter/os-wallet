"use client";

import { useState, useTransition } from "react";
import { createRule, recategorize, type RuleSuggestion } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CategoryOption = { id: number; name: string };

export const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** Inline category dropdown. After a change, offers "Always use X for Y?". */
export function CategorySelect({
  transactionId,
  categoryId,
  categories,
}: {
  transactionId: number;
  categoryId: number | null;
  categories: CategoryOption[];
}) {
  const [value, setValue] = useState(categoryId);
  // Follow server updates (e.g. a merchant rule recategorized this row).
  const [lastProp, setLastProp] = useState(categoryId);
  if (categoryId !== lastProp) {
    setLastProp(categoryId);
    setValue(categoryId);
  }
  const [suggestion, setSuggestion] = useState<RuleSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <select
        aria-label="Category"
        className={cn(selectClass, "w-40")}
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          setValue(next);
          startTransition(async () => {
            const res = await recategorize(transactionId, next);
            if (res.ok) {
              setSuggestion(res.suggestion);
              setError(null);
            } else setError(res.error);
          });
        }}
      >
        {value === null && <option value="">Uncategorized</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {suggestion && (
        <RulePrompt suggestion={suggestion} onDone={() => setSuggestion(null)} />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function RulePrompt({
  suggestion,
  onDone,
}: {
  suggestion: RuleSuggestion;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <span>
        Always use <strong className="text-foreground">{suggestion.categoryName}</strong> for{" "}
        <strong className="text-foreground">{suggestion.pattern}</strong>?
      </span>
      <Button
        size="xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await createRule(suggestion);
            onDone();
          })
        }
      >
        Yes
      </Button>
      <Button size="xs" variant="ghost" disabled={pending} onClick={onDone}>
        No
      </Button>
    </div>
  );
}
