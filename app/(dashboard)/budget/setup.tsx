"use client";

import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createBudget } from "@/app/actions";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { BudgetDraft } from "@/lib/budget";
import { formatDateShort, formatMoneyWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

type Custom = { key: number; label: string; amount: string; pattern: string };

const STEPS = ["Income", "Bills", "Savings"] as const;
const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function BudgetSetup({ draft, daysInMonth }: { draft: BudgetDraft; daysInMonth: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);

  // Step 1
  const [income, setIncome] = useState(draft.income > 0 ? String(Math.round(draft.income)) : "");
  const [autoIncome, setAutoIncome] = useState(draft.income > 0);

  // Step 2
  const [picked, setPicked] = useState(
    () => new Set(draft.recurring.filter((b) => b.confidence === "high").map((b) => b.key)),
  );
  const [custom, setCustom] = useState<Custom[]>([]);

  // Step 3
  const incomeN = autoIncome ? draft.income : num(income);
  const fixedTotal = useMemo(
    () =>
      draft.recurring.filter((b) => picked.has(b.key)).reduce((s, b) => s + b.amount, 0) +
      custom.reduce((s, c) => s + num(c.amount), 0),
    [draft.recurring, picked, custom],
  );
  const maxSavings = Math.max(Math.floor((incomeN - fixedTotal) / 10) * 10, 0);
  const [savings, setSavings] = useState<number | null>(null);
  const savingsN = Math.min(savings ?? draft.suggestedSavings, maxSavings);
  const safe = incomeN - fixedTotal - savingsN;
  const [limitIds, setLimitIds] = useState<Set<number>>(new Set());
  // Categories already covered by a picked bill (rent) make poor soft limits.
  const billCategories = new Set(draft.recurring.filter((b) => picked.has(b.key)).map((b) => b.categoryId));
  const limitOptions = draft.categories.filter((c) => !billCategories.has(c.id));

  const finish = () =>
    startTransition(async () => {
      const res = await createBudget({
        settings: { monthlyIncome: autoIncome ? null : num(income), savingsGoal: savingsN },
        items: [
          ...draft.recurring
            .filter((b) => picked.has(b.key))
            .map((b) => ({
              kind: "fixed" as const,
              label: b.merchant,
              categoryId: b.categoryId,
              matchField: b.matchField,
              pattern: b.pattern,
              amount: b.amount,
              dueDay: Number(b.lastDate.slice(8, 10)),
            })),
          ...custom
            .filter((c) => c.label.trim() && num(c.amount) > 0)
            .map((c) => ({
              kind: "fixed" as const,
              label: c.label.trim(),
              pattern: c.pattern.trim() || null,
              amount: num(c.amount),
            })),
          ...draft.categories
            .filter((c) => limitIds.has(c.id) && !billCategories.has(c.id))
            .map((c) => ({ kind: "limit" as const, label: c.name, categoryId: c.id, amount: c.suggested })),
        ],
      });
      if (!res.ok) toast.error("Couldn't save", { description: res.error });
      else {
        toast.success("Budget ready");
        router.replace("/budget");
      }
    });

  const canNext = step !== 0 || incomeN > 0;

  return (
    <div className="surface mx-auto max-w-2xl overflow-hidden">
      {/* Stepper */}
      <ol className="flex items-center gap-2 border-b px-4 py-3 sm:px-6">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-xs font-medium">
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[0.625rem] font-semibold",
                i < step && "bg-brand text-brand-foreground",
                i === step && "bg-primary text-primary-foreground",
                i > step && "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn(i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
          </li>
        ))}
      </ol>

      <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        {step === 0 && (
          <>
            <StepTitle title="How much comes in each month?" hint="Take-home pay, after tax." />
            {draft.income > 0 && (
              <p className="text-sm text-muted-foreground">
                You averaged <span className="num font-semibold text-foreground">{formatMoneyWhole(draft.income)}</span> a
                month over the last {draft.months} month{draft.months === 1 ? "" : "s"}.
              </p>
            )}
            {draft.income > 0 && (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Switch checked={autoIncome} onCheckedChange={setAutoIncome} size="sm" />
                Use my recent average, and keep it updated
              </label>
            )}
            {(!autoIncome || draft.income <= 0) && (
              <MoneyInput value={income} onChange={setIncome} label="Monthly income" autoFocus />
            )}
          </>
        )}

        {step === 1 && (
          <>
            <StepTitle
              title="Your fixed bills"
              hint="Things that cost about the same every month. We found these in your history."
            />
            {draft.recurring.length === 0 && (
              <p className="text-sm text-muted-foreground">No repeating charges found yet. Add your own below.</p>
            )}
            <ul className={cn("divide-y rounded-xl border", draft.recurring.length + custom.length === 0 && "hidden")}>
              {draft.recurring.map((b) => {
                const on = picked.has(b.key);
                return (
                  <li key={b.key}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(b.key);
                            else next.delete(b.key);
                            return next;
                          })
                        }
                      />
                      <CategoryIcon name={b.categoryName} color={b.categoryColor} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{b.merchant}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {b.categoryName ?? "Uncategorized"} · {b.months} months · next ~{formatDateShort(b.nextExpected)}
                        </span>
                      </span>
                      <span className="num text-sm font-medium">{formatMoneyWhole(b.amount)}</span>
                    </label>
                  </li>
                );
              })}
              {custom.map((c) => (
                <li key={c.key} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_1fr_6rem_auto]">
                  <Input
                    value={c.label}
                    placeholder="Name (e.g. Rent)"
                    aria-label="Bill name"
                    onChange={(e) => setCustom((l) => l.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))}
                  />
                  <Input
                    value={c.pattern}
                    placeholder="Shows up as (optional)"
                    aria-label="Match text"
                    className="hidden sm:block"
                    onChange={(e) => setCustom((l) => l.map((x) => (x.key === c.key ? { ...x, pattern: e.target.value } : x)))}
                  />
                  <Input
                    value={c.amount}
                    inputMode="decimal"
                    placeholder="$0"
                    aria-label="Amount"
                    onChange={(e) => setCustom((l) => l.map((x) => (x.key === c.key ? { ...x, amount: e.target.value } : x)))}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove"
                    onClick={() => setCustom((l) => l.filter((x) => x.key !== c.key))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustom((l) => [...l, { key: Date.now(), label: "", amount: "", pattern: "" }])}
              >
                <Plus />
                Add a bill
              </Button>
              <p className="text-sm text-muted-foreground">
                Total <span className="num font-semibold text-foreground">{formatMoneyWhole(fixedTotal)}</span>/mo
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepTitle
              title="How much do you want to save?"
              hint={
                draft.suggestedSavings > 0
                  ? `At your usual spending you'd save about ${formatMoneyWhole(draft.suggestedSavings)} a month.`
                  : "Start small. You can change it any time."
              }
            />
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="num text-3xl font-semibold">{formatMoneyWhole(savingsN)}</span>
                <span className="text-xs text-muted-foreground">
                  {incomeN > 0 ? `${Math.round((savingsN / incomeN) * 100)}% of income` : ""}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(maxSavings, 10)}
                step={10}
                value={savingsN}
                onChange={(e) => setSavings(Number(e.target.value))}
                aria-label="Savings goal"
                className="w-full accent-[var(--brand)]"
              />
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="eyebrow">Safe to spend</p>
              <p className={cn("num mt-1 text-2xl font-semibold", safe < 0 && "text-negative")}>
                {formatMoneyWhole(safe)}
                <span className="text-sm font-normal text-muted-foreground"> /month</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {safe < 0
                  ? "Your bills and savings add up to more than your income. Check the income in step 1, or lower the savings goal."
                  : `About ${formatMoneyWhole(safe / daysInMonth)} a day for groceries, eating out, shopping and everything else.`}
              </p>
            </div>

            {limitOptions.length > 0 && (
              <div>
                <p className="eyebrow mb-2">Optional soft limits</p>
                <p className="mb-2 text-xs text-muted-foreground">Based on your 3-month average. Pick any you want to watch.</p>
                <div className="flex flex-wrap gap-1.5">
                  {limitOptions.slice(0, 10).map((c) => {
                    const on = limitIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setLimitIds((prev) => {
                            const next = new Set(prev);
                            if (on) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-xs transition-all hover:border-foreground/20",
                          on && "border-brand/50 ring-2 ring-brand/15",
                        )}
                      >
                        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                        <span className="text-muted-foreground tabular-nums">{formatMoneyWhole(c.suggested)}</span>
                        {on && <Check className="size-3 text-brand" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 sm:px-6">
        <Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Next
            <ArrowRight />
          </Button>
        ) : (
          <Button disabled={pending} onClick={finish}>
            <Check />
            Save budget
          </Button>
        )}
      </div>
    </div>
  );
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function MoneyInput({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative max-w-56">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        aria-label={label}
        placeholder="0"
        autoFocus={autoFocus}
        className="h-10 pl-6 text-lg font-semibold tabular-nums md:text-lg"
      />
    </div>
  );
}
