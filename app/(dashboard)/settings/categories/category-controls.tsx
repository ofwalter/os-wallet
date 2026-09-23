"use client";

import { ArrowDown, ArrowRight, ArrowUp, Plus, Search, Trash2, Wand2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCategory, deleteRule, moveCategory, updateCategory } from "@/app/actions";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Category } from "@/lib/db/schema";
import { formatAmountRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = Category["kind"];
type Rule = {
  id: number;
  matchField: "merchant_name" | "name";
  pattern: string;
  minAmount: number | null;
  maxAmount: number | null;
  categoryName: string;
  categoryColor: string;
};

const KIND_LABEL: Record<Kind, string> = { expense: "Spending", income: "Income", transfer: "Transfer" };
const KIND_SECTIONS: { kind: Kind; title: string; hint: string }[] = [
  { kind: "expense", title: "Spending", hint: "Counted in spending totals and charts" },
  { kind: "income", title: "Income", hint: "Counted as income in cash flow" },
  { kind: "transfer", title: "Transfers", hint: "Left out of spending and income totals" },
];

export function CategoriesTabs({
  categories,
  rules,
  usage,
}: {
  categories: Category[];
  rules: Rule[];
  usage: Record<number, number>;
}) {
  return (
    <Tabs defaultValue="categories" className="gap-4">
      <TabsList className="h-9">
        <TabsTrigger value="categories" className="px-3">
          Categories
          <span className="text-xs text-muted-foreground tabular-nums">{categories.length}</span>
        </TabsTrigger>
        <TabsTrigger value="rules" className="px-3">
          Merchant rules
          <span className="text-xs text-muted-foreground tabular-nums">{rules.length}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="categories" className="space-y-4">
        <AddCategoryForm />
        {KIND_SECTIONS.map((section) => {
          const list = categories.filter((c) => c.kind === section.kind);
          if (list.length === 0) return null;
          return (
            <section key={section.kind} className="surface overflow-hidden">
              <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3 sm:px-5">
                <h2 className="font-heading text-sm font-semibold">{section.title}</h2>
                <p className="truncate text-xs text-muted-foreground">{section.hint}</p>
              </header>
              <ul className="divide-y">
                {list.map((c, i) => (
                  <CategoryRow
                    key={`${c.id}-${c.name}-${c.color}-${c.kind}`}
                    category={c}
                    uses={usage[c.id] ?? 0}
                    isFirst={i === 0}
                    isLast={i === list.length - 1}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </TabsContent>

      <TabsContent value="rules">
        <RulesList rules={rules} />
      </TabsContent>
    </Tabs>
  );
}

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label
      className="relative inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 ring-border transition hover:ring-foreground/30"
      title="Change color"
    >
      <span className="size-5 rounded-full shadow-inner" style={{ backgroundColor: value }} />
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function KindSelect({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <Select<Kind> value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label="Kind" className="h-8 w-28 shrink-0 text-xs">
        <SelectValue>{(v: Kind) => KIND_LABEL[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <SelectItem key={k} value={k}>
            {KIND_LABEL[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategoryRow({
  category,
  uses,
  isFirst,
  isLast,
}: {
  category: Category;
  uses: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [kind, setKind] = useState<Kind>(category.kind);
  const [pending, startTransition] = useTransition();
  const dirty = name !== category.name || color !== category.color || kind !== category.kind;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Failed");
      else if (success) toast.success(success);
    });

  const save = () => run(() => updateCategory(category.id, { name, color, kind }), "Category saved");

  return (
    <li className={cn("flex flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-5", pending && "opacity-60")}>
      <CategoryIcon name={name} color={color} size="sm" className="hidden sm:inline-flex" />
      <ColorSwatch value={color} onChange={setColor} label={`${category.name} color`} />
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
          className="h-8 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
        />
      </form>
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums md:inline">
        {uses.toLocaleString()} txn{uses === 1 ? "" : "s"}
      </span>
      <KindSelect value={kind} onChange={setKind} />
      <div className="flex shrink-0 items-center gap-0.5">
        {dirty ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setName(category.name);
                setColor(category.color);
                setKind(category.kind);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={pending || !name.trim()} onClick={save}>
              Save
            </Button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </li>
  );
}

const NEW_COLORS = ["#5b4ff0", "#1baf7a", "#eb6834", "#2a78d6", "#e87ba4", "#eda100", "#0891b2", "#9333ea"];

function AddCategoryForm() {
  const [name, setName] = useState("");
  const [color, setColor] = useState(NEW_COLORS[0]);
  const [kind, setKind] = useState<Kind>("expense");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="surface flex flex-wrap items-center gap-2 p-3 sm:flex-nowrap sm:gap-3 sm:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await addCategory({ name, color, kind });
          if (res.ok) {
            toast.success(`Added ${name.trim()}`);
            setName("");
            setColor(NEW_COLORS[(NEW_COLORS.indexOf(color) + 1) % NEW_COLORS.length]);
          } else toast.error(res.error);
        });
      }}
    >
      <ColorSwatch value={color} onChange={setColor} label="New category color" />
      <Input
        placeholder="New category name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="h-8 min-w-0 flex-1"
      />
      <KindSelect value={kind} onChange={setKind} />
      <Button type="submit" size="sm" disabled={pending || !name.trim()} className="h-8">
        <Plus />
        Add
      </Button>
    </form>
  );
}

function RulesList({ rules }: { rules: Rule[] }) {
  const [q, setQ] = useState("");
  const shown = rules.filter(
    (r) =>
      r.pattern.toLowerCase().includes(q.toLowerCase()) || r.categoryName.toLowerCase().includes(q.toLowerCase()),
  );

  if (rules.length === 0) {
    return (
      <div className="surface">
        <EmptyState
          icon={Wand2}
          title="No rules yet"
          description="Recategorize a transaction and choose “Always” to teach OS Wallet how to file that merchant."
          className="py-16"
        />
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules" className="h-8 pl-8" />
        </div>
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Rules run on every sync, before Plaid&apos;s categories.
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No rules match “{q}”.</p>
      ) : (
        <ul className="divide-y">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-xs text-muted-foreground">
                  {r.matchField === "merchant_name" ? "Merchant" : "Description"} contains
                </span>
                <span className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
                  {r.pattern}
                </span>
                {formatAmountRange(r.minAmount, r.maxAmount) && (
                  <span className="text-xs text-muted-foreground">
                    for <span className="num text-foreground">{formatAmountRange(r.minAmount, r.maxAmount)}</span>
                  </span>
                )}
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: r.categoryColor }} />
                  {r.categoryName}
                </span>
              </div>
              <DeleteRuleButton ruleId={r.id} pattern={r.pattern} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteRuleButton({ ruleId, pattern }: { ruleId: number; pattern: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete rule for ${pattern}`}
      disabled={pending}
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      onClick={() =>
        startTransition(async () => {
          const res = await deleteRule(ruleId);
          if (res.ok) toast.success("Rule deleted", { description: `“${pattern}” will no longer be auto-categorized.` });
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
