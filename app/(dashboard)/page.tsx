import { connection } from "next/server";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleCheck,
  CreditCard,
  Inbox,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { CashFlowChart, type CashFlowPoint } from "@/components/charts/cash-flow";
import { SpendingBreakdown } from "@/components/charts/spending-breakdown";
import { SpendingPace, type PaceSeries } from "@/components/charts/spending-pace";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SyncNowButton } from "@/components/sync-now-button";
import { Amount, DeltaPill, Money } from "@/components/transaction-bits";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  APP_TIMEZONE,
  daysInMonth,
  monthEnd,
  monthLabel,
  monthStart,
  sameDayLastMonth,
  todayISO,
} from "@/lib/dates";
import { formatDateShort, formatMoney, formatMoneyWhole } from "@/lib/format";
import {
  dailySpending,
  flowBetween,
  monthlyCashFlow,
  recentTransactions,
  reviewCount,
  spendingByCategoryMonth,
  visibleAccountBalances,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const maxDuration = 300; // "Sync now" runs here

function cumulative(
  daily: Map<string, number>,
  month: string,
  upToDay?: number,
): (number | null)[] {
  const [y, m] = month.split("-").map(Number);
  const days = daysInMonth(y, m);
  let running = 0;
  return Array.from({ length: days }, (_, i) => {
    if (upToDay !== undefined && i + 1 > upToDay) return null;
    running += daily.get(`${month}-${String(i + 1).padStart(2, "0")}`) ?? 0;
    return Math.round(running * 100) / 100;
  });
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: APP_TIMEZONE }).format(new Date()),
  );
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const BALANCE_GROUPS: { key: string; label: string; icon: LucideIcon; match: (type: string) => boolean }[] = [
  { key: "cash", label: "Cash", icon: Wallet, match: (t) => t === "depository" },
  { key: "credit", label: "Credit cards", icon: CreditCard, match: (t) => t === "credit" },
  { key: "investment", label: "Investments", icon: TrendingUp, match: (t) => t === "investment" },
  { key: "loan", label: "Loans", icon: Landmark, match: (t) => t === "loan" },
  {
    key: "other",
    label: "Other",
    icon: PiggyBank,
    match: (t) => !["depository", "credit", "investment", "loan"].includes(t),
  },
];
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export default async function OverviewPage() {
  await connection(); // always render per request
  const today = todayISO();
  const thisStart = monthStart(today);
  const thisEnd = monthEnd(today);
  const lastStart = monthStart(today, -1);
  const lastEnd = monthEnd(lastStart);
  const lastSameDay = sameDayLastMonth(today);
  const yearStart = monthStart(today, -11);

  const [flowThis, flowLastToDate, flowLast, byCategoryMonth, daily, flows, balances, recent, toReview] =
    await Promise.all([
      flowBetween(thisStart, thisEnd),
      flowBetween(lastStart, lastSameDay),
      flowBetween(lastStart, lastEnd),
      spendingByCategoryMonth(yearStart, thisEnd),
      dailySpending(monthStart(today, -3), thisEnd),
      monthlyCashFlow(yearStart, thisEnd),
      visibleAccountBalances(),
      recentTransactions(7),
      reviewCount(),
    ]);

  // ----- Pace: cumulative this month vs last month and the prior-3-month average.
  const dailyMap = new Map(daily.map((d) => [d.date, d.total]));
  const todayDay = Number(today.slice(8, 10));
  const prior = [-1, -2, -3].map((d) => cumulative(dailyMap, monthStart(today, d).slice(0, 7)));
  const maxLen = Math.max(...prior.map((p) => p.length));
  const avg3 = Array.from({ length: maxLen }, (_, i) => {
    // Shorter months hold their final total for the missing days.
    const vals = prior.map((p) => p[Math.min(i, p.length - 1)] ?? 0);
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
  });
  const pace: PaceSeries = {
    thisMonth: cumulative(dailyMap, thisStart.slice(0, 7), todayDay),
    lastMonth: prior[0],
    avg3,
    today: todayDay,
    daysThisMonth: daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7))),
    thisLabel: monthLabel(today, "long"),
    lastLabel: monthLabel(lastStart, "long"),
  };

  // ----- Cash flow: last 12 months, zero-filled.
  const months = Array.from({ length: 12 }, (_, i) => monthStart(today, i - 11).slice(0, 7));
  const flowByMonth = new Map(flows.map((f) => [f.month, f]));
  const cashFlow: CashFlowPoint[] = months.map((m) => {
    const f = flowByMonth.get(m);
    const income = f?.income ?? 0;
    const spending = f?.spending ?? 0;
    return { month: m, label: monthLabel(`${m}-01`), income, spending, net: income - spending };
  });

  // ----- Balances.
  const signed = (type: string, balance: number | null) =>
    (balance ?? 0) * (LIABILITY_TYPES.has(type) ? -1 : 1);
  const groups = BALANCE_GROUPS.map((g) => {
    const list = balances.filter((a) => g.match(a.type));
    return { ...g, accounts: list, total: list.reduce((s, a) => s + signed(a.type, a.currentBalance), 0) };
  }).filter((g) => g.accounts.length > 0);
  const netWorth = groups.reduce((s, g) => s + g.total, 0);
  const assets = groups.filter((g) => g.total > 0).reduce((s, g) => s + g.total, 0);
  const liabilities = groups.filter((g) => g.total < 0).reduce((s, g) => s - g.total, 0);

  const net = flowThis.income - flowThis.spending;

  return (
    <div>
      <PageHeader
        eyebrow={new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })}
        title={greeting()}
        description="Here's where your money stands this month."
        actions={
          <>
            {toReview > 0 && (
              <Link href="/review" className={buttonVariants({ variant: "outline" })}>
                <Inbox />
                Review {toReview}
              </Link>
            )}
            <SyncNowButton className="hidden lg:inline-flex" />
          </>
        }
      />

      {/* ---------- KPI strip ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={`Spent in ${monthLabel(today, "short")}`} className="col-span-2 sm:col-span-1">
          <div className="flex flex-wrap items-center gap-2">
            <Money value={flowThis.spending} className="text-[1.75rem] leading-none font-semibold sm:text-3xl" />
            <DeltaPill current={flowThis.spending} previous={flowLastToDate.spending} goodWhenDown />
          </div>
          <p className="text-xs text-muted-foreground">
            vs {formatMoneyWhole(flowLastToDate.spending)} by this day last month
          </p>
        </Kpi>
        <Kpi label="Income" className="col-span-2 sm:col-span-1">
          <div className="flex flex-wrap items-center gap-2">
            <Money value={flowThis.income} className="text-[1.75rem] leading-none font-semibold sm:text-3xl" />
            <DeltaPill current={flowThis.income} previous={flowLastToDate.income} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatMoneyWhole(flowLast.income)} in all of {monthLabel(lastStart, "short")}
          </p>
        </Kpi>
        <Kpi label="Net this month">
          <span className={cn("num text-2xl leading-none font-semibold sm:text-3xl", net < 0 && "text-negative")}>
            {net >= 0 ? "+" : "−"}
            {formatMoneyWhole(Math.abs(net))}
          </span>
          <p className="text-xs text-muted-foreground">{net >= 0 ? "Saved so far" : "Spent more than earned"}</p>
        </Kpi>
        <Kpi label="Net worth">
          <span className="num text-2xl leading-none font-semibold sm:text-3xl">{formatMoneyWhole(netWorth)}</span>
          <p className="text-xs text-muted-foreground">
            {balances.length} account{balances.length === 1 ? "" : "s"}
          </p>
        </Kpi>
      </div>

      {/* ---------- Breakdown (the main chart) ---------- */}
      <Card className="mt-4 px-5 sm:mt-6 sm:px-6 sm:py-6">
        <SpendingBreakdown rows={byCategoryMonth} months={months} today={today} />
      </Card>

      {/* ---------- Pace + balances ---------- */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-5">
        <Card className="px-5 sm:px-6 sm:py-6 lg:col-span-3">
          <SpendingPace data={pace} />
        </Card>

        <Card className="gap-0 px-5 sm:px-6 sm:py-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">Balances</h2>
              <p className="text-xs text-muted-foreground">Net worth across visible accounts</p>
            </div>
            <Link
              href="/settings/accounts"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Manage <ArrowRight className="size-3" />
            </Link>
          </div>

          {groups.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No accounts yet"
              description="Link a bank to see balances here."
              action={
                <Link href="/settings/accounts" className={buttonVariants({ size: "sm" })}>
                  Link a bank
                </Link>
              }
              className="py-8"
            />
          ) : (
            <>
              <Money value={netWorth} className="mt-4 text-3xl font-semibold" />
              {assets + liabilities > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                    <span className="h-full rounded-l-full bg-chart-1" style={{ width: `${(assets / (assets + liabilities)) * 100}%` }} />
                    <span className="h-full flex-1 rounded-r-full" style={{ backgroundColor: "var(--viz-negative)" }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-chart-1" /> Assets{" "}
                      <span className="font-medium text-foreground tabular-nums">{formatMoneyWhole(assets)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: "var(--viz-negative)" }} /> Liabilities{" "}
                      <span className="font-medium text-foreground tabular-nums">{formatMoneyWhole(liabilities)}</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-4">
                {groups.map((g) => (
                  <div key={g.key}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="eyebrow inline-flex items-center gap-1.5">
                        <g.icon className="size-3.5" />
                        {g.label}
                      </span>
                      <span className="text-xs font-semibold tabular-nums">{formatMoney(g.total)}</span>
                    </div>
                    <ul className="divide-y rounded-xl border">
                      {g.accounts.map((a) => {
                        const utilization =
                          a.type === "credit" && a.creditLimit && a.creditLimit > 0
                            ? Math.min((a.currentBalance ?? 0) / a.creditLimit, 1)
                            : null;
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {a.name}
                                {a.mask && <span className="ml-1.5 font-mono text-xs text-muted-foreground">••{a.mask}</span>}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {a.institutionName}
                                {utilization !== null && ` · ${Math.round(utilization * 100)}% utilized`}
                              </p>
                            </div>
                            <span className={cn("shrink-0 text-sm font-medium tabular-nums", LIABILITY_TYPES.has(a.type) && "text-muted-foreground")}>
                              {formatMoney(signed(a.type, a.currentBalance))}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ---------- Cash flow + recent ---------- */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-5">
        <Card className="px-5 sm:px-6 sm:py-6 lg:col-span-3">
          <CashFlowChart data={cashFlow} />
        </Card>

        <Card className="gap-0 px-5 sm:px-6 sm:py-6 lg:col-span-2">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">Recent activity</h2>
              <p className="text-xs text-muted-foreground">Latest transactions</p>
            </div>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              See all <ArrowUpRight className="size-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing yet" description="Transactions appear after your first sync." className="py-8" />
          ) : (
            <ul className="-mx-2">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/transactions?q=${encodeURIComponent(t.merchantName ?? t.name)}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <CategoryIcon name={t.categoryName ?? "Uncategorized"} color={t.categoryColor} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.merchantName ?? t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDateShort(t.date)} · {t.categoryName ?? "Uncategorized"}
                        {t.pending && " · Pending"}
                      </p>
                    </div>
                    <Amount amount={t.amount} className="text-sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("surface flex flex-col gap-2.5 p-4 sm:p-5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
