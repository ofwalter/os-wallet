import { Badge } from "@/components/ui/badge";
import type { Transaction } from "@/lib/db/schema";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Plaid amounts: positive = outflow (spending), negative = inflow. */
export function Amount({ amount, className }: { amount: number; className?: string }) {
  const inflow = amount < 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        inflow && "text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {inflow ? `+${formatMoney(-amount)}` : formatMoney(amount)}
    </span>
  );
}

const SOURCE_LABEL: Record<Transaction["categorySource"], string> = {
  plaid: "Plaid",
  rule: "Rule",
  manual: "Manual",
};

export function SourceBadge({ source }: { source: Transaction["categorySource"] }) {
  return (
    <Badge variant={source === "manual" ? "default" : source === "rule" ? "secondary" : "outline"}>
      {SOURCE_LABEL[source]}
    </Badge>
  );
}
