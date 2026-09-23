import {
  ArrowLeftRight,
  Banknote,
  Car,
  CircleDashed,
  CircleHelp,
  Clapperboard,
  Coffee,
  Fuel,
  Gift,
  HeartPulse,
  House,
  Plane,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  dining: UtensilsCrossed,
  coffee: Coffee,
  gas: Fuel,
  transport: Car,
  "rent/housing": House,
  housing: House,
  rent: House,
  utilities: Zap,
  subscriptions: Repeat,
  shopping: ShoppingBag,
  travel: Plane,
  "health/fitness": HeartPulse,
  health: HeartPulse,
  entertainment: Clapperboard,
  "personal care": Sparkles,
  gifts: Gift,
  fees: Receipt,
  other: CircleDashed,
  income: Banknote,
  transfers: ArrowLeftRight,
  uncategorized: CircleHelp,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return CircleHelp;
  return ICONS[name.toLowerCase()] ?? Tag;
}

/** Soft tinted tile with the category's icon: the row "avatar" used across lists. */
export function CategoryIcon({
  name,
  color,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const c = color ?? "#94a3b8";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-[1.05rem]",
        size === "lg" && "size-11 [&_svg]:size-5",
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${c} 14%, transparent)`, color: c }}
    >
      {createElement(categoryIcon(name), { strokeWidth: 2 })}
    </span>
  );
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
