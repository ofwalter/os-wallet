"use client";

import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteBudgetItem, regenerateInsight, saveBudgetSettings, upsertBudgetItem } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatMoneyWhole } from "@/lib/format";
import { MoneyInput } from "./setup";

type Res = { ok: boolean; error?: string };
const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Res>, success?: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else {
        if (success) toast.success(success);
        after?.();
      }
    });
  return [pending, run] as const;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{label}</p>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EditAmountsButton({
  monthlyIncome,
  averageIncome,
  savingsGoal,
}: {
  monthlyIncome: number | null;
  averageIncome: number;
  savingsGoal: number;
}) {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(monthlyIncome === null);
  const [income, setIncome] = useState(String(Math.round(monthlyIncome ?? averageIncome)));
  const [savings, setSavings] = useState(String(Math.round(savingsGoal)));
  const [pending, run] = useRun();

  const save = () => {
    const i = num(income);
    const s = num(savings);
    if ((!auto && Number.isNaN(i)) || Number.isNaN(s)) return toast.error("Enter valid amounts");
    run(() => saveBudgetSettings({ monthlyIncome: auto ? null : i, savingsGoal: s }), "Budget updated", () =>
      setOpen(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil />
        Edit amounts
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Income and savings</DialogTitle>
          <DialogDescription>Safe to spend = income − fixed bills − savings.</DialogDescription>
        </DialogHeader>
        <Field label="Monthly income">
          <label className="mb-2 flex cursor-pointer items-center gap-2.5 text-sm">
            <Switch checked={auto} onCheckedChange={setAuto} size="sm" />
            Use my 3-month average ({formatMoneyWhole(averageIncome)})
          </label>
          {!auto && <MoneyInput value={income} onChange={setIncome} label="Monthly income" />}
        </Field>
        <Field label="Savings goal per month">
          <MoneyInput value={savings} onChange={setSavings} label="Savings goal" />
        </Field>
        <DialogFooter>
          <Button disabled={pending} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CategoryOption = { id: number; name: string };

export type EditableItem = {
  id: number;
  kind: "fixed" | "limit";
  label: string;
  amount: number;
  categoryId: number | null;
  matchField: "merchant_name" | "name" | null;
  pattern: string | null;
};

export function ItemDialog({
  kind,
  item,
  categories,
  trigger,
}: {
  kind: "fixed" | "limit";
  item?: EditableItem;
  categories: CategoryOption[];
  trigger: "add" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(item?.label ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [pattern, setPattern] = useState(item?.pattern ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(item?.categoryId ?? null);
  const [pending, run] = useRun();

  const save = () => {
    const a = num(amount);
    if (Number.isNaN(a) || a <= 0) return toast.error("Enter an amount");
    const catName = categories.find((c) => c.id === categoryId)?.name;
    if (kind === "limit" && !catName) return toast.error("Pick a category");
    const name = kind === "limit" ? catName! : label.trim();
    if (!name) return toast.error("Give it a name");
    run(
      () =>
        upsertBudgetItem(item?.id ?? null, {
          kind,
          label: name,
          amount: a,
          categoryId,
          matchField: item?.matchField ?? "merchant_name",
          pattern: kind === "fixed" ? pattern.trim() || null : null,
        }),
      item ? "Saved" : "Added",
      () => {
        setOpen(false);
        if (!item) {
          setLabel("");
          setAmount("");
          setPattern("");
          setCategoryId(null);
        }
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger === "add" ? (
            <Button variant="outline" size="sm" />
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item?.label}`} />
          )
        }
      >
        {trigger === "add" ? (
          <>
            <Plus />
            {kind === "fixed" ? "Add bill" : "Add limit"}
          </>
        ) : (
          <Pencil />
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit" : "Add"} {kind === "fixed" ? "fixed bill" : "category limit"}
          </DialogTitle>
          <DialogDescription>
            {kind === "fixed"
              ? "A cost that's about the same every month, like rent or a subscription."
              : "A soft monthly cap. You'll see a bar fill up as you spend."}
          </DialogDescription>
        </DialogHeader>
        {kind === "fixed" ? (
          <>
            <Field label="Name">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rent" />
            </Field>
            <Field label="Monthly amount">
              <MoneyInput value={amount} onChange={setAmount} label="Amount" />
            </Field>
            <Field label="Shows up on statements as" hint="Used to mark the bill paid. Leave blank to skip tracking.">
              <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. Netflix" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Category">
              <Select<number> value={categoryId} onValueChange={(v) => setCategoryId(v)}>
                <SelectTrigger aria-label="Category" className="w-full">
                  <SelectValue placeholder="Pick a category">
                    {(v: number | null) => categories.find((c) => c.id === v)?.name ?? "Pick a category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Monthly limit">
              <MoneyInput value={amount} onChange={setAmount} label="Limit" />
            </Field>
          </>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={save}>
            {item ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteItemButton({ id, label }: { id: number; label: string }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${label}`}
      disabled={pending}
      onClick={() => run(() => deleteBudgetItem(id), `Removed ${label}`)}
      className="text-muted-foreground"
    >
      <Trash2 />
    </Button>
  );
}

export function AddDetectedButton({
  bill,
}: {
  bill: {
    merchant: string;
    amount: number;
    categoryId: number | null;
    matchField: "merchant_name" | "name";
    pattern: string;
    lastDate: string;
  };
}) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        run(
          () =>
            upsertBudgetItem(null, {
              kind: "fixed",
              label: bill.merchant,
              amount: bill.amount,
              categoryId: bill.categoryId,
              matchField: bill.matchField,
              pattern: bill.pattern,
              dueDay: Number(bill.lastDate.slice(8, 10)),
            }),
          `${bill.merchant} added to fixed bills`,
        )
      }
    >
      <Plus />
      Add
    </Button>
  );
}

export function RefreshInsightButton() {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Refresh check-in"
      title="Refresh check-in"
      disabled={pending}
      onClick={() => run(regenerateInsight, "Check-in updated")}
      className="text-muted-foreground"
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
    </Button>
  );
}
