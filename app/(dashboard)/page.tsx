import { connection } from "next/server";
import Link from "next/link";
import {
  CashFlowChart,
  CategoryDonut,
  CumulativeSpendingChart,
  type CashFlowPoint,
  type CumulativePoint,
} from "@/components/charts";
import { SyncNowButton } from "@/components/sync-now-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  daysInMonth,
  monthEnd,
  monthLabel,
  monthStart,
  sameDayLastMonth,
  todayISO,
} from "@/lib/dates";
import { formatDateTime, formatMoney, formatMoneyWhole } from "@/lib/format";
import {
  dailySpending,
  lastSyncRun,
  monthlyCashFlow,
  reviewCount,
  spendingBetween,
  spendingByCategory,
  visibleAccountBalances,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const maxDuration = 300; // "Sync now" runs here

function cumulative(
  daily: { date: string; total: number }[],
  days: number,
  upToDay = days,
): (number | null)[] {
  const byDay = new Map(daily.map((d) => [Number(d.date.slice(8, 10)), d.total]));
  let running = 0;
  return Array.from({ length: days }, (_, i) => {
    if (i + 1 > upToDay) return null;
    running += byDay.get(i + 1) ?? 0;
    return Math.round(running * 100) / 100;
  });
}

const BALANCE_GROUPS = [
  { key: "cash", label: "Cash", types: ["depository"] },
  { key: "credit", label: "Credit", types: ["credit"] },
  { key: "other", label: "Other", types: null },
] as const;
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export default async function OverviewPage() {
  await connection(); // always render per request
  const today = todayISO();
  const thisStart = monthStart(today);
  const thisEnd = monthEnd(today);
  const lastStart = monthStart(today, -1);
  const lastEnd = monthEnd(lastStart);
  const lastSameDay = sameDayLastMonth(today);
  const flowStart = monthStart(today, -5);

  const [
    spentThis,
    spentLastToDate,
    spentLastTotal,
    byCategory,
    dailyThis,
    dailyLast,
    flows,
    balances,
    lastRun,
    toReview,
  ] = await Promise.all([
    spendingBetween(thisStart, thisEnd),
    spendingBetween(lastStart, lastSameDay),
    spendingBetween(lastStart, lastEnd),
    spendingByCategory(thisStart, thisEnd),
    dailySpending(thisStart, thisEnd),
    dailySpending(lastStart, lastEnd),
    monthlyCashFlow(flowStart, thisEnd),
    visibleAccountBalances(),
    lastSyncRun(),
    reviewCount(),
  ]);

  // Cumulative lines, day 1..N; "this month" stops at today.
  const [ty, tm] = thisStart.split("-").map(Number);
  const [ly, lm] = lastStart.split("-").map(Number);
  const days = Math.max(daysInMonth(ty, tm), daysInMonth(ly, lm));
  const thisCum = cumulative(dailyThis, daysInMonth(ty, tm), Number(today.slice(8, 10)));
  const lastCum = cumulative(dailyLast, daysInMonth(ly, lm));
  const cumulativeData: CumulativePoint[] = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    thisMonth: thisCum[i] ?? null,
    lastMonth: lastCum[i] ?? null,
  }));

  const flowByMonth = new Map(flows.map((f) => [f.month, f]));
  const cashFlow: CashFlowPoint[] = Array.from({ length: 6 }, (_, i) => {
    const start = monthStart(today, i - 5);
    const f = flowByMonth.get(start.slice(0, 7));
    const income = f?.income ?? 0;
    const spending = f?.spending ?? 0;
    return { month: monthLabel(start), income, spending, net: income - spending };
  });

  const signed = (type: string, balance: number | null) =>
    (balance ?? 0) * (LIABILITY_TYPES.has(type) ? -1 : 1);
  const groups = BALANCE_GROUPS.map((g) => {
    const list = balances.filter((a) =>
      g.types === null
        ? a.type !== "depository" && a.type !== "credit"
        : (g.types as readonly string[]).includes(a.type),
    );
    return { ...g, accounts: list, total: list.reduce((s, a) => s + signed(a.type, a.currentBalance), 0) };
  }).filter((g) => g.accounts.length > 0);
  const netWorth = groups.reduce((s, g) => s + g.total, 0);

  const delta = spentThis - spentLastToDate;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Spent in {monthLabel(today, "long")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-semibold">{formatMoneyWhole(spentThis)}</div>
            <p className="text-xs text-muted-foreground">
              {formatMoneyWhole(Math.abs(delta))} {delta > 0 ? "more" : "less"} than this point last
              month ({formatMoneyWhole(spentLastToDate)})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Spent in {monthLabel(lastStart, "long")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatMoneyWhole(spentLastTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Needs review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-semibold">{toReview}</div>
            {toReview > 0 && (
              <Link href="/review" className="text-xs text-muted-foreground underline">
                Open review queue
              </Link>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Last sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lastRun ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  {formatDateTime(lastRun.startedAt)}
                  <Badge variant={lastRun.status === "success" ? "secondary" : lastRun.status === "running" ? "outline" : "destructive"}>
                    {lastRun.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lastRun.trigger} · +{lastRun.added} / ~{lastRun.modified} / −{lastRun.removed}
                </p>
                {lastRun.error && (
                  <p className="line-clamp-3 whitespace-pre-line text-xs text-destructive">{lastRun.error}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Never synced</p>
            )}
            <SyncNowButton />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={byCategory} from={thisStart} to={thisEnd} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cumulative spending</CardTitle>
          </CardHeader>
          <CardContent>
            <CumulativeSpendingChart
              data={cumulativeData}
              thisLabel={monthLabel(today, "long")}
              lastLabel={monthLabel(lastStart, "long")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net cash flow, last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart data={cashFlow} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <CardTitle>Balances</CardTitle>
            <span className="text-sm">
              Net <strong className="tabular-nums">{formatMoney(netWorth)}</strong>
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No accounts yet. <Link href="/settings/accounts" className="underline">Link a bank</Link>.
              </p>
            )}
            {groups.map((g) => (
              <div key={g.key}>
                <div className="flex justify-between border-b pb-1 text-sm font-medium">
                  <span>{g.label}</span>
                  <span className="tabular-nums">{formatMoney(g.total)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {g.accounts.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 text-muted-foreground">
                      <span className="truncate">
                        {a.name}
                        {a.mask && ` ••${a.mask}`}
                        <span className="text-xs"> · {a.institutionName}</span>
                      </span>
                      <span className={cn("tabular-nums", LIABILITY_TYPES.has(a.type) && "text-foreground")}>
                        {formatMoney(signed(a.type, a.currentBalance))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
