import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Transaction } from "@/lib/db/schema";
import { formatMoney, formatPercent, splitMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Plaid amounts: positive = outflow (spending), negative = inflow. */
export function Amount({ amount, className }: { amount: number; className?: string }) {
  const inflow = amount < 0;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        inflow && "text-positive",
        className,
      )}
    >
      {inflow ? `+${formatMoney(-amount)}` : formatMoney(amount)}
    </span>
  );
}

/** Large money figure with de-emphasized cents. */
export function Money({
  value,
  className,
  centsClassName,
}: {
  value: number;
  className?: string;
  centsClassName?: string;
}) {
  const [whole, cents] = splitMoney(value);
  return (
    <span className={cn("num", className)}>
      {whole}
      <span className={cn("text-[0.6em] text-muted-foreground", centsClassName)}>{cents}</span>
    </span>
  );
}

/**
 * Change vs a comparison value. `goodWhenDown` flips the color for spending,
 * where going down is the good direction.
 */
export function DeltaPill({
  current,
  previous,
  goodWhenDown = false,
  className,
}: {
  current: number;
  previous: number;
  goodWhenDown?: boolean;
  className?: string;
}) {
  if (previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  const up = change >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums",
        Math.abs(change) < 0.005
          ? "bg-muted text-muted-foreground"
          : good
            ? "bg-positive/12 text-positive"
            : "bg-negative/12 text-negative",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {formatPercent(Math.abs(change))}
    </span>
  );
}

const SOURCE_LABEL: Record<Transaction["categorySource"], string> = {
  plaid: "Auto",
  rule: "Rule",
  manual: "Manual",
};

const SOURCE_TITLE: Record<Transaction["categorySource"], string> = {
  plaid: "Categorized from Plaid's category",
  rule: "Categorized by one of your merchant rules",
  manual: "You set this category",
};

export function SourceBadge({
  source,
  className,
}: {
  source: Transaction["categorySource"];
  className?: string;
}) {
  return (
    <span
      title={SOURCE_TITLE[source]}
      className={cn(
        "inline-flex h-[1.125rem] items-center rounded-md px-1.5 text-[0.625rem] font-semibold tracking-wide uppercase",
        source === "manual" && "bg-brand/10 text-brand",
        source === "rule" && "bg-chart-3/12 text-positive",
        source === "plaid" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function StatusChip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "brand";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] items-center rounded-md px-1.5 text-[0.625rem] font-semibold tracking-wide uppercase",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "warning" && "bg-warning/15 text-amber-700 dark:text-warning",
        tone === "brand" && "bg-brand/10 text-brand",
        className,
      )}
    >
      {children}
    </span>
  );
}
