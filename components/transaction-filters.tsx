"use client";

import { Inbox, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ColorDot } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { monthEnd, monthStart } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type TxFilters = {
  from?: string;
  to?: string;
  account?: string;
  category?: string;
  q?: string;
  review?: string;
};

type Preset = "all" | "this" | "last" | "30d" | "90d" | "ytd" | "custom";

function shiftDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function presetRange(p: Preset, today: string): { from?: string; to?: string } {
  switch (p) {
    case "this":
      return { from: monthStart(today), to: monthEnd(today) };
    case "last": {
      const s = monthStart(today, -1);
      return { from: s, to: monthEnd(s) };
    }
    case "30d":
      return { from: shiftDays(today, -29), to: today };
    case "90d":
      return { from: shiftDays(today, -89), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return {};
  }
}

const PRESET_LABEL: Record<Preset, string> = {
  all: "All time",
  this: "This month",
  last: "Last month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  custom: "Custom range",
};

function detectPreset(f: TxFilters, today: string): Preset {
  if (!f.from && !f.to) return "all";
  for (const p of ["this", "last", "30d", "90d", "ytd"] as const) {
    const r = presetRange(p, today);
    if (r.from === f.from && r.to === f.to) return p;
  }
  return "custom";
}

export function TransactionFilters({
  filters,
  today,
  accounts,
  categories,
}: {
  filters: TxFilters;
  today: string;
  accounts: { id: number; name: string; mask: string | null }[];
  categories: { id: number; name: string; color: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [customOpen, setCustomOpen] = useState(false);
  const preset = customOpen ? "custom" : detectPreset(filters, today);

  const apply = (patch: Partial<TxFilters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams(
      Object.entries(next).filter((e): e is [string, string] => !!e[1]),
    );
    startTransition(() => router.push(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
  };

  // Debounced search.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const t = setTimeout(() => applyRef.current({ q: q.trim() || undefined }), 350);
    return () => clearTimeout(t);
  }, [q, filters.q]);

  // Follow external navigation (e.g. "All from merchant").
  const [lastQ, setLastQ] = useState(filters.q);
  if (filters.q !== lastQ) {
    setLastQ(filters.q);
    setQ(filters.q ?? "");
  }

  const activeCount = [filters.from || filters.to, filters.account, filters.category, filters.review].filter(Boolean).length;
  const anyActive = activeCount > 0 || !!filters.q;

  const accountById = new Map(accounts.map((a) => [String(a.id), a]));
  const categoryById = new Map(categories.map((c) => [String(c.id), c]));

  const dateSelect = (
    <Select<Preset>
      value={preset}
      onValueChange={(p) => {
        if (!p) return;
        if (p === "custom") return setCustomOpen(true);
        setCustomOpen(false);
        apply(presetRange(p, today));
      }}
    >
      <SelectTrigger className="h-9 w-full md:w-40" aria-label="Date range">
        <SelectValue>{(v: Preset) => PRESET_LABEL[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PRESET_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const customInputs = preset === "custom" && (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label="From"
        defaultValue={filters.from}
        max={filters.to}
        onChange={(e) => apply({ from: e.target.value || undefined })}
        className="h-9 w-full md:w-38"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To"
        defaultValue={filters.to}
        min={filters.from}
        onChange={(e) => apply({ to: e.target.value || undefined })}
        className="h-9 w-full md:w-38"
      />
    </div>
  );

  const accountSelect = (
    <Select<string>
      value={filters.account ?? "all"}
      onValueChange={(v) => apply({ account: v && v !== "all" ? v : undefined })}
    >
      <SelectTrigger className="h-9 w-full md:w-44" aria-label="Account">
        <SelectValue>
          {(v: string) => {
            const a = accountById.get(v);
            return a ? (
              <span className="truncate">
                {a.name}
                {a.mask && <span className="text-muted-foreground"> ••{a.mask}</span>}
              </span>
            ) : (
              "All accounts"
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-56">
        <SelectItem value="all">All accounts</SelectItem>
        <SelectSeparator />
        {accounts.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            {a.name}
            {a.mask && <span className="text-muted-foreground">••{a.mask}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const categorySelect = (
    <Select<string>
      value={filters.category ?? "all"}
      onValueChange={(v) => apply({ category: v && v !== "all" ? v : undefined })}
    >
      <SelectTrigger className="h-9 w-full md:w-44" aria-label="Category">
        <SelectValue>
          {(v: string) => {
            if (v === "none") return "Uncategorized";
            const c = categoryById.get(v);
            return c ? (
              <span className="flex min-w-0 items-center gap-2">
                <ColorDot color={c.color} />
                <span className="truncate">{c.name}</span>
              </span>
            ) : (
              "All categories"
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-80 min-w-52">
        <SelectItem value="all">All categories</SelectItem>
        <SelectItem value="none">Uncategorized</SelectItem>
        <SelectSeparator />
        {categories.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            <ColorDot color={c.color} />
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const reviewToggle = (
    <Button
      variant="outline"
      aria-pressed={filters.review === "1"}
      onClick={() => apply({ review: filters.review === "1" ? undefined : "1" })}
      className={cn(
        "h-9 justify-start",
        filters.review === "1" && "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand dark:border-brand/40 dark:bg-brand/15",
      )}
    >
      <Inbox />
      Needs review
    </Button>
  );

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchants"
            aria-label="Search"
            className="h-9 bg-card pl-9 dark:bg-card"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Desktop: inline controls */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {dateSelect}
          {customInputs}
          {accountSelect}
          {categorySelect}
          {reviewToggle}
        </div>

        {/* Mobile: controls in a bottom sheet */}
        <Sheet>
          <SheetTrigger render={<Button variant="outline" className="h-9 md:hidden" />}>
            <SlidersHorizontal />
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-brand text-[0.625rem] font-semibold text-brand-foreground">
                {activeCount}
              </span>
            )}
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-safe rounded-t-2xl">
            <SheetHeader className="pb-0">
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow down your transactions.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-4">
              <FieldLabel label="Date">{dateSelect}</FieldLabel>
              {customInputs}
              <FieldLabel label="Account">{accountSelect}</FieldLabel>
              <FieldLabel label="Category">{categorySelect}</FieldLabel>
              {reviewToggle}
            </div>
            <SheetFooter className="flex-row">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setCustomOpen(false);
                  setQ("");
                  apply({ from: undefined, to: undefined, account: undefined, category: undefined, review: undefined, q: undefined });
                }}
              >
                Reset
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {anyActive && (
          <Button
            variant="ghost"
            className="h-9 text-muted-foreground"
            onClick={() => {
              setCustomOpen(false);
              setQ("");
              startTransition(() => router.push(pathname, { scroll: false }));
            }}
          >
            <X />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
