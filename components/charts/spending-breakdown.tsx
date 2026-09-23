"use client";

import { ArrowUpRight, ChartColumn, ChartPie, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { CategoryIcon } from "@/components/category-icon";
import { Segmented } from "@/components/segmented";
import { Money } from "@/components/transaction-bits";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { monthEnd, monthLabel } from "@/lib/dates";
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CategoryMonthRow = {
  month: string; // YYYY-MM
  id: number | null;
  name: string;
  color: string;
  total: number;
};

type Period = "this" | "last" | "3m" | "6m" | "ytd" | "12m";
type View = "donut" | "trend";

const PERIODS: { value: Period; label: string; short?: string }[] = [
  { value: "this", label: "This month", short: "This mo" },
  { value: "last", label: "Last month", short: "Last mo" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "12m", label: "12M" },
];

// A donut reads at a glance only with a few slices; fold the tail.
const MAX_SLICES = 6;
const REST_KEY = "rest";
const REST_COLOR = "var(--muted-foreground)";
const LEGEND_PREVIEW = 8;

type Slice = { key: string; id: number | null; name: string; color: string; total: number };

const keyOf = (id: number | null) => (id === null ? "cnone" : `c${id}`);

function periodMonths(period: Period, months: string[]): string[] {
  const n = months.length;
  switch (period) {
    case "this":
      return months.slice(n - 1);
    case "last":
      return months.slice(n - 2, n - 1);
    case "3m":
      return months.slice(n - 3);
    case "6m":
      return months.slice(n - 6);
    case "12m":
      return months;
    case "ytd": {
      const year = months[n - 1].slice(0, 4);
      return months.filter((m) => m.startsWith(year));
    }
  }
}

function fold(visible: Slice[]): Slice[] {
  if (visible.length <= MAX_SLICES + 1) return visible;
  const head = visible.slice(0, MAX_SLICES);
  const tail = visible.slice(MAX_SLICES);
  return [
    ...head,
    {
      key: REST_KEY,
      id: -1,
      name: `${tail.length} more`,
      color: REST_COLOR,
      total: tail.reduce((s, d) => s + d.total, 0),
    },
  ];
}

export function SpendingBreakdown({
  rows,
  months,
  today,
}: {
  rows: CategoryMonthRow[];
  /** Oldest → newest "YYYY-MM"; the last one is the current month. */
  months: string[];
  today: string;
}) {
  const [period, setPeriod] = useState<Period>("this");
  const [view, setView] = useState<View>("donut");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const selectedMonths = useMemo(() => periodMonths(period, months), [period, months]);
  const from = `${selectedMonths[0]}-01`;
  const to = selectedMonths.at(-1) === months.at(-1) ? today : monthEnd(`${selectedMonths.at(-1)}-01`);

  // Totals per category over the selected period, largest first.
  const all: Slice[] = useMemo(() => {
    const set = new Set(selectedMonths);
    const byKey = new Map<string, Slice>();
    for (const r of rows) {
      if (!set.has(r.month)) continue;
      const key = keyOf(r.id);
      const s = byKey.get(key) ?? { key, id: r.id, name: r.name, color: r.color, total: 0 };
      s.total += r.total;
      byKey.set(key, s);
    }
    return [...byKey.values()].filter((s) => s.total > 0.005).sort((a, b) => b.total - a.total);
  }, [rows, selectedMonths]);

  const visible = all.filter((s) => !hidden.has(s.key));
  const slices = fold(visible);
  const total = visible.reduce((s, d) => s + d.total, 0);
  const grandTotal = all.reduce((s, d) => s + d.total, 0);
  const tailKeys = new Set(visible.slice(slices.length === visible.length ? visible.length : MAX_SLICES).map((s) => s.key));

  const focusKey = hovered ?? pinned;
  const focusSlice =
    focusKey === null
      ? null
      : (slices.find((s) => s.key === focusKey) ?? visible.find((s) => s.key === focusKey) ?? null);
  const focusInDonut = (key: string) =>
    focusKey === null || key === focusKey || (key === REST_KEY && tailKeys.has(focusKey));

  const hrefFor = (id: number | null) =>
    `/transactions?${new URLSearchParams({ from, to, category: id === null ? "none" : String(id) })}`;

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const only = (key: string) => setHidden(new Set(all.filter((s) => s.key !== key).map((s) => s.key)));

  const legend = expanded ? all : all.slice(0, LEGEND_PREVIEW);
  const periodLabel = PERIODS.find((p) => p.value === period)!.label;
  const rangeLabel =
    selectedMonths.length === 1
      ? monthLabel(`${selectedMonths[0]}-01`, "long")
      : `${monthLabel(`${selectedMonths[0]}-01`)} – ${monthLabel(`${selectedMonths.at(-1)}-01`, "long")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">Where your money went</h2>
          <p className="text-xs text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="Period"
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setPinned(null);
            }}
            options={PERIODS}
            className="min-w-0"
          />
          <Segmented
            label="Chart type"
            value={view}
            onChange={setView}
            options={[
              { value: "donut", label: <span className="sr-only">Breakdown</span>, icon: ChartPie, title: "Breakdown" },
              { value: "trend", label: <span className="sr-only">Monthly trend</span>, icon: ChartColumn, title: "Monthly trend" },
            ]}
            className="shrink-0"
          />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="flex h-60 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center">
          <p className="text-sm font-medium">No spending in this period</p>
          <p className="text-xs text-muted-foreground">Try a longer range, or sync your banks.</p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
          {view === "donut" ? (
            <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
              <ChartContainer config={{}} className="aspect-square h-full w-full">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="name"
                    innerRadius="72%"
                    outerRadius="100%"
                    paddingAngle={slices.length > 1 ? 1.5 : 0}
                    cornerRadius={6}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive
                    animationDuration={500}
                    onMouseEnter={(_, i) => setHovered(slices[i]?.key ?? null)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(_, i) => {
                      const k = slices[i]?.key;
                      if (k && k !== REST_KEY) setPinned((p) => (p === k ? null : k));
                    }}
                    className="cursor-pointer outline-none"
                  >
                    {slices.map((s) => (
                      <Cell
                        key={s.key}
                        fill={s.color}
                        className="transition-opacity duration-200"
                        opacity={focusInDonut(s.key) ? 1 : 0.22}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                {focusSlice && total > 0 ? (
                  <>
                    <span className="flex max-w-full items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: focusSlice.color }} />
                      <span className="truncate">{focusSlice.name}</span>
                    </span>
                    <Money value={focusSlice.total} className="mt-1 text-2xl font-semibold sm:text-[1.75rem]" />
                    <span className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatPercent(focusSlice.total / total, 1)} of spending
                    </span>
                    {pinned === focusSlice.key && focusSlice.key !== REST_KEY && (
                      <Link
                        href={hrefFor(focusSlice.id)}
                        className="pointer-events-auto mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-brand hover:underline"
                      >
                        View transactions <ArrowUpRight className="size-3" />
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium text-muted-foreground">
                      {hidden.size ? "Selected spending" : "Total spent"}
                    </span>
                    <Money value={total} className="mt-1 text-2xl font-semibold sm:text-[1.75rem]" />
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {visible.length} categor{visible.length === 1 ? "y" : "ies"}
                      {hidden.size > 0 && ` · ${formatPercent(total / grandTotal)} of total`}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <TrendChart
              rows={rows}
              months={selectedMonths.length >= 3 ? selectedMonths : months.slice(-6)}
              visible={visible}
              focusKey={focusKey}
            />
          )}

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{periodLabel} · tap a category to hide it</span>
              {hidden.size > 0 && (
                <Button size="xs" variant="ghost" onClick={() => setHidden(new Set())} className="-mr-2 text-muted-foreground">
                  <RotateCcw />
                  Show all
                </Button>
              )}
            </div>
            <ul className="-mx-2 space-y-0.5" onMouseLeave={() => setHovered(null)}>
              {legend.map((s) => {
                const off = hidden.has(s.key);
                const share = total > 0 && !off ? s.total / total : 0;
                const barShare = all[0] ? s.total / all[0].total : 0;
                return (
                  <li key={s.key} className="group relative">
                    <button
                      type="button"
                      onClick={() => toggle(s.key)}
                      onDoubleClick={() => only(s.key)}
                      onMouseEnter={() => !off && setHovered(s.key)}
                      aria-pressed={!off}
                      title={off ? `Show ${s.name}` : `Hide ${s.name} (double-click to show only this)`}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 pr-10 text-left transition-colors hover:bg-muted/70",
                        focusKey === s.key && "bg-muted/70",
                      )}
                    >
                      <CategoryIcon
                        name={s.name}
                        color={off ? "var(--muted-foreground)" : s.color}
                        size="sm"
                        className={cn(off && "opacity-50")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className={cn("truncate text-sm font-medium", off && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                            {s.name}
                          </span>
                          <span className={cn("shrink-0 text-sm font-medium tabular-nums", off && "text-muted-foreground")}>
                            {formatMoney(s.total)}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(barShare * 100, 1.5)}%`,
                                backgroundColor: off ? "var(--muted-foreground)" : s.color,
                                opacity: off ? 0.3 : 1,
                              }}
                            />
                          </span>
                          <span className="w-10 shrink-0 text-right text-[0.6875rem] text-muted-foreground tabular-nums">
                            {off ? "—" : formatPercent(share, share < 0.1 ? 1 : 0)}
                          </span>
                        </span>
                      </span>
                    </button>
                    <span className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
                      <Link
                        href={hrefFor(s.id)}
                        aria-label={`View ${s.name} transactions`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2">
              {all.length > LEGEND_PREVIEW ? (
                <Button size="xs" variant="ghost" onClick={() => setExpanded((e) => !e)} className="-ml-2 text-muted-foreground">
                  {expanded ? "Show fewer" : `Show all ${all.length} categories`}
                </Button>
              ) : (
                <span />
              )}
              {visible.length > 1 && hidden.size === 0 && (
                <span className="hidden text-[0.6875rem] text-muted-foreground sm:inline">
                  Double-click a category to isolate it
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendChart({
  rows,
  months,
  visible,
  focusKey,
}: {
  rows: CategoryMonthRow[];
  months: string[];
  visible: Slice[];
  focusKey: string | null;
}) {
  const series = fold(visible);
  const inHead = new Set(series.map((s) => s.key));
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.name, color: s.color }]),
  );
  const visibleKeys = new Set(visible.map((s) => s.key));

  const data = months.map((m) => {
    const point: Record<string, number | string> = { month: monthLabel(`${m}-01`) };
    for (const s of series) point[s.key] = 0;
    for (const r of rows) {
      if (r.month !== m) continue;
      const k = keyOf(r.id);
      if (!visibleKeys.has(k)) continue;
      const target = inHead.has(k) ? k : REST_KEY;
      point[target] = (point[target] as number) + r.total;
    }
    return point;
  });

  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={formatMoneyCompact} width={52} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={<ChartTooltipContent valueFormatter={formatMoney} className="min-w-44" />}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="spend"
            fill={`var(--color-${s.key})`}
            stroke="var(--card)"
            strokeWidth={1.5}
            radius={i === series.length - 1 ? [5, 5, 0, 0] : 0}
            fillOpacity={focusKey === null || focusKey === s.key ? 1 : 0.25}
            isAnimationActive={false}
          />
        ))}
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1 pt-4" />} />
      </BarChart>
    </ChartContainer>
  );
}
