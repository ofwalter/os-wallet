"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { addCategory, deleteRule, moveCategory, updateCategory } from "@/app/actions";
import { selectClass } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/db/schema";

type Kind = Category["kind"];

function KindSelect({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <select
      aria-label="Kind"
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value as Kind)}
    >
      <option value="expense">Expense</option>
      <option value="income">Income</option>
      <option value="transfer">Transfer</option>
    </select>
  );
}

export function CategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [kind, setKind] = useState<Kind>(category.kind);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name !== category.name || color !== category.color || kind !== category.kind;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Failed"));
    });

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${category.name} color`}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <KindSelect value={kind} onChange={setKind} />
        {dirty && (
          <Button size="sm" disabled={pending} onClick={() => run(() => updateCategory(category.id, { name, color, kind }))}>
            Save
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Move up"
          disabled={pending || isFirst}
          onClick={() => run(() => moveCategory(category.id, "up"))}
        >
          <ArrowUp />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Move down"
          disabled={pending || isLast}
          onClick={() => run(() => moveCategory(category.id, "down"))}
        >
          <ArrowDown />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function AddCategoryForm() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2a78d6");
  const [kind, setKind] = useState<Kind>("expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-1 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await addCategory({ name, color, kind });
          if (res.ok) {
            setName("");
            setError(null);
          } else setError(res.error);
        });
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="New category color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          placeholder="New category"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <KindSelect value={kind} onChange={setKind} />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

export function DeleteRuleButton({ ruleId }: { ruleId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Delete rule"
      disabled={pending}
      onClick={() => startTransition(async () => void (await deleteRule(ruleId)))}
    >
      <Trash2 />
    </Button>
  );
}
