"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/segmented";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney, formatMoneyCompact, formatMoneyWhole, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CashFlowPoint = { month: string; label: string; income: number; spending: number; net: number };

type Range = "6" | "12";
type View = "net" | "split";

const SAVED = "var(--chart-1)";
const OVERSPENT = "var(--viz-negative)";

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; payload?: CashFlowPoint };

/** Bar with a rounded data-end and a square baseline, for either sign. */
function SignedBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h === 0) return null;
  const r = Math.min(5, h, width / 2);
  const positive = (payload?.net ?? 0) >= 0;
  const right = x + width;
  const bottom = top + h;
  const d = positive
    ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${right - r} Q${right},${top} ${right},${top + r} V${bottom} Z`
    : `M${x},${top} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${right - r} Q${right},${bottom} ${right},${bottom - r} V${top} Z`;
  return <path d={d} fill={positive ? SAVED : OVERSPENT} />;
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const [range, setRange] = useState<Range>("6");
  const [view, setView] = useState<View>("net");
  const points = data.slice(-Number(range));

  const income = points.reduce((s, p) => s + p.income, 0);
  const spending = points.reduce((s, p) => s + p.spending, 0);
  const net = income - spending;
  const rate = income > 0 ? net / income : null;

  const config: ChartConfig =
    view === "net"
      ? { net: { label: "Net" } }
      : {
          income: { label: "Income", color: "var(--chart-3)" },
          spending: { label: "Spending", color: "var(--chart-1)" },
        };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">Cash flow</h2>
          <p className="text-xs text-muted-foreground">Income minus spending, transfers excluded</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="Chart view"
            value={view}
            onChange={setView}
            options={[
              { value: "net", label: "Net" },
              { value: "split", label: "In vs out" },
            ]}
          />
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: "6", label: "6M" },
              { value: "12", label: "12M" },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-xs">
        <div>
          <p className="text-muted-foreground">Net</p>
          <p className={cn("num mt-0.5 text-base font-semibold", net < 0 && "text-negative")}>
            {net >= 0 ? "+" : "−"}
            {formatMoneyWhole(Math.abs(net))}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Avg / month</p>
          <p className="num mt-0.5 text-base font-semibold">
            {formatMoneyWhole(net / Math.max(points.length, 1))}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Savings rate</p>
          <p className="num mt-0.5 text-base font-semibold">{rate === null ? "—" : formatPercent(rate)}</p>
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[240px] w-full flex-1">
        {view === "net" ? (
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={formatMoneyCompact} width={52} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as CashFlowPoint | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/60 bg-popover/95 px-2.5 py-2 text-xs shadow-xl backdrop-blur-sm">
                    <div className="font-medium">{p.label}</div>
                    <Row color={p.net >= 0 ? SAVED : OVERSPENT} label={p.net >= 0 ? "Saved" : "Overspent"} value={formatMoney(Math.abs(p.net))} strong />
                    <Row color="var(--chart-3)" label="Income" value={formatMoney(p.income)} />
                    <Row color="var(--chart-1)" label="Spending" value={formatMoney(p.spending)} muted />
                  </div>
                );
              }}
            />
            <Bar dataKey="net" maxBarSize={36} shape={SignedBar} isAnimationActive={false} />
          </BarChart>
        ) : (
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={formatMoneyCompact} width={52} />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltipContent valueFormatter={formatMoney} className="min-w-44" />}
            />
            <Bar dataKey="income" fill="var(--color-income)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="spending" fill="var(--color-spending)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <ChartLegend content={<ChartLegendContent className="pt-3" />} />
          </BarChart>
        )}
      </ChartContainer>

      {view === "net" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ backgroundColor: SAVED }} />
            Saved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ backgroundColor: OVERSPENT }} />
            Overspent
          </span>
        </div>
      )}
    </div>
  );
}

function Row({
  color,
  label,
  value,
  strong,
  muted,
}: {
  color: string;
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color, opacity: muted ? 0.9 : 1 }} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums text-foreground", strong ? "font-semibold" : "font-medium")}>{value}</span>
    </div>
  );
}
