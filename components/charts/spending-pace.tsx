"use client";

import { useId, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/segmented";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney, formatMoneyCompact, formatMoneyWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

type Compare = "last" | "avg";

export type PaceSeries = {
  /** Cumulative spend for this month, null after today. */
  thisMonth: (number | null)[];
  lastMonth: (number | null)[];
  /** Cumulative average of the previous three months. */
  avg3: (number | null)[];
  today: number; // day of month
  daysThisMonth: number;
  thisLabel: string;
  lastLabel: string;
};

export function SpendingPace({ data }: { data: PaceSeries }) {
  const gradId = useId().replace(/:/g, "");
  const [compare, setCompare] = useState<Compare>("last");
  const compareSeries = compare === "last" ? data.lastMonth : data.avg3;
  const compareLabel = compare === "last" ? data.lastLabel : "3-month average";

  const days = Math.max(data.thisMonth.length, compareSeries.length);
  const points = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    current: data.thisMonth[i] ?? null,
    compare: compareSeries[i] ?? null,
  }));

  const spent = data.thisMonth[data.today - 1] ?? 0;
  const compareAtDay =
    compareSeries[Math.min(data.today, compareSeries.length) - 1] ?? 0;
  const compareTotal = compareSeries.at(-1) ?? 0;
  const diff = spent - compareAtDay;
  const projected = data.today > 0 ? (spent / data.today) * data.daysThisMonth : 0;

  const config: ChartConfig = {
    current: { label: data.thisLabel, color: "var(--chart-1)" },
    compare: { label: compareLabel, color: "var(--chart-2)" },
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">Spending pace</h2>
          <p className="text-xs text-muted-foreground">
            {Math.abs(diff) < 1 ? (
              "Right on pace"
            ) : (
              <>
                <span className={cn("font-semibold", diff > 0 ? "text-negative" : "text-positive")}>
                  {formatMoneyWhole(Math.abs(diff))} {diff > 0 ? "more" : "less"}
                </span>{" "}
                than {compare === "last" ? "last month" : "your average"} by day {data.today}
              </>
            )}
          </p>
        </div>
        <Segmented
          label="Compare with"
          value={compare}
          onChange={setCompare}
          options={[
            { value: "last", label: "Last month" },
            { value: "avg", label: "3-mo avg" },
          ]}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-xs">
        <div>
          <p className="text-muted-foreground">Spent so far</p>
          <p className="num mt-0.5 text-base font-semibold">{formatMoneyWhole(spent)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">On pace for</p>
          <p className="num mt-0.5 text-base font-semibold">{formatMoneyWhole(projected)}</p>
        </div>
        <div>
          <p className="truncate text-muted-foreground">{compare === "last" ? data.lastLabel.split(" ")[0] : "Avg month"}</p>
          <p className="num mt-0.5 text-base font-semibold">{formatMoneyWhole(compareTotal)}</p>
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[220px] w-full flex-1">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-current)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-current)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            ticks={[1, 8, 15, 22, days]}
          />
          <YAxis tickLine={false} axisLine={false} tickFormatter={formatMoneyCompact} width={52} />
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                indicator="line"
                valueFormatter={formatMoney}
                labelFormatter={(_, payload) => `Day ${payload?.[0]?.payload?.day ?? ""}`}
                className="min-w-44"
              />
            }
          />
          <Line
            dataKey="compare"
            type="monotone"
            stroke="var(--color-compare)"
            strokeWidth={2}
            strokeOpacity={0.9}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          <Area
            dataKey="current"
            type="monotone"
            stroke="var(--color-current)"
            strokeWidth={2.25}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {data.today > 0 && (
            <ReferenceDot
              x={data.today}
              y={spent}
              r={4.5}
              fill="var(--color-current)"
              stroke="var(--card)"
              strokeWidth={2.5}
            />
          )}
        </ComposedChart>
      </ChartContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-chart-1" />
          {data.thisLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-chart-2" />
          {compareLabel}
        </span>
      </div>
    </div>
  );
}
