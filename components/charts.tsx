"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyWhole } from "@/lib/format";

// Chart tokens live in globals.css (--viz-*), validated for light and dark.
const SERIES_1 = "var(--viz-1)";
const SERIES_2 = "var(--viz-2)";
const NEGATIVE = "var(--viz-negative)";
const SURFACE = "var(--card)";
const GRID = "var(--border)";
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

const compactMoney = (n: number) =>
  Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;

type TooltipRow = { key: string; label: string; value: number; color: string; shape: "line" | "dot" };

function TooltipBox({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {title && <div className="mb-1 text-muted-foreground">{title}</div>}
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <span
            aria-hidden
            className={r.shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2 rounded-full"}
            style={{ backgroundColor: r.color }}
          />
          <strong className="tabular-nums">{formatMoney(r.value)}</strong>
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function LegendKey({ color, label, shape = "line" }: { color: string; label: string; shape?: "line" | "dot" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2 rounded-full"}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

// ---------- Spending by category (donut) ----------

export type DonutSlice = { id: number | null; name: string; color: string; total: number };

const MAX_SLICES = 5;
const REST_COLOR = "#a8a29e";

export function CategoryDonut({ data, from, to }: { data: DonutSlice[]; from: string; to: string }) {
  const router = useRouter();
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No spending yet this month.</p>;
  }

  // A donut only reads at a glance with a few slices; fold the tail.
  const head = data.slice(0, MAX_SLICES);
  const tail = data.slice(MAX_SLICES);
  const slices: DonutSlice[] = tail.length
    ? [...head, { id: -1, name: "Everything else", color: REST_COLOR, total: tail.reduce((s, d) => s + d.total, 0) }]
    : head;
  const grand = data.reduce((s, d) => s + d.total, 0);

  const hrefFor = (id: number | null) =>
    `/transactions?${new URLSearchParams({ from, to, category: id === null ? "none" : String(id) })}`;

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="name"
              innerRadius={58}
              outerRadius={86}
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive={false}
              onClick={(entry) => {
                const slice = entry.payload as DonutSlice;
                if (slice.id !== -1) router.push(hrefFor(slice.id));
              }}
              className="cursor-pointer"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as DonutSlice | undefined;
                return p ? (
                  <TooltipBox
                    rows={[{ key: p.name, label: `${p.name} · ${Math.round((p.total / grand) * 100)}%`, value: p.total, color: p.color, shape: "dot" }]}
                  />
                ) : null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="font-semibold">{formatMoneyWhole(grand)}</span>
        </div>
      </div>
      {/* Legend doubles as the table view; every category links to its transactions. */}
      <ul className="space-y-1 text-sm">
        {data.map((d, i) => (
          <li key={d.id ?? "none"} className="flex items-center justify-between gap-3">
            <Link href={hrefFor(d.id)} className="flex min-w-0 items-center gap-2 hover:underline">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: i < MAX_SLICES || tail.length === 0 ? d.color : REST_COLOR }}
              />
              <span className="truncate">{d.name}</span>
            </Link>
            <span className="tabular-nums text-muted-foreground">{formatMoney(d.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Daily cumulative spending (line) ----------

export type CumulativePoint = { day: number; thisMonth: number | null; lastMonth: number | null };

export function CumulativeSpendingChart({
  data,
  thisLabel,
  lastLabel,
}: {
  data: CumulativePoint[];
  thisLabel: string;
  lastLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4">
        <LegendKey color={SERIES_1} label={thisLabel} />
        <LegendKey color={SERIES_2} label={lastLabel} />
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compactMoney} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as CumulativePoint;
                const rows: TooltipRow[] = [];
                if (p.thisMonth !== null) rows.push({ key: "this", label: thisLabel, value: p.thisMonth, color: SERIES_1, shape: "line" });
                if (p.lastMonth !== null) rows.push({ key: "last", label: lastLabel, value: p.lastMonth, color: SERIES_2, shape: "line" });
                return <TooltipBox title={`Day ${label}`} rows={rows} />;
              }}
            />
            <Line
              dataKey="lastMonth"
              stroke={SERIES_2}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="thisMonth"
              stroke={SERIES_1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Net cash flow (bars) ----------

export type CashFlowPoint = { month: string; income: number; spending: number; net: number };

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; payload?: CashFlowPoint };

/** Bar with a 4px rounded data-end and a square baseline, for either sign. */
function SignedBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h === 0) return null;
  const r = Math.min(4, h, width / 2);
  const positive = (payload?.net ?? 0) >= 0;
  const right = x + width;
  const bottom = top + h;
  const d = positive
    ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${right - r} Q${right},${top} ${right},${top + r} V${bottom} Z`
    : `M${x},${top} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${right - r} Q${right},${bottom} ${right},${bottom - r} V${top} Z`;
  return <path d={d} fill={positive ? SERIES_1 : NEGATIVE} />;
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4">
        <LegendKey color={SERIES_1} label="Saved (income > spending)" shape="dot" />
        <LegendKey color={NEGATIVE} label="Overspent" shape="dot" />
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compactMoney} width={48} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as CashFlowPoint;
                return (
                  <TooltipBox
                    title={String(label)}
                    rows={[
                      { key: "net", label: "Net", value: p.net, color: p.net >= 0 ? SERIES_1 : NEGATIVE, shape: "dot" },
                      { key: "in", label: "Income", value: p.income, color: "transparent", shape: "dot" },
                      { key: "out", label: "Spending", value: p.spending, color: "transparent", shape: "dot" },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="net" maxBarSize={24} shape={SignedBar} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
