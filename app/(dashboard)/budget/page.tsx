import { connection } from "next/server";
import { CalendarClock, Check, ChevronDown, Compass, PiggyBank, RotateCcw, Scale, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Money, StatusChip } from "@/components/transaction-bits";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { guidanceTips } from "@/lib/ai/guidance";
import { generateWeeklyInsight, latestInsight } from "@/lib/ai/insight";
import { getBudgetDraft, getBudgetSetup, getBudgetStatus, type BudgetStatus } from "@/lib/budget";
import { daysInMonth, monthLabel, todayISO } from "@/lib/dates";
import { formatDateShort, formatMoneyWhole, formatRelative } from "@/lib/format";
import { listCategories } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  AddDetectedButton,
  DeleteItemButton,
  EditAmountsButton,
  ItemDialog,
  RefreshInsightButton,
} from "./budget-controls";
import { BudgetSetup } from "./setup";

export const metadata = { title: "Budget" };

export default async function BudgetPage({ searchParams }: PageProps<"/budget">) {
  await connection(); // always render per request
  const sp = await searchParams;
  const today = todayISO();
  const status = await getBudgetStatus(today);

  if (!status || sp.setup === "1") {
    const draft = await getBudgetDraft(today);
    const [y, m] = today.split("-").map(Number);
    return (
      <div>
        <PageHeader
          eyebrow="Budget"
          title={status ? "Start over" : "Build your budget"}
          description="Three quick steps. We've filled in numbers from your history; adjust anything."
          actions={
            status && (
              <Link href="/budget" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
            )
          }
        />
        {draft.months === 0 && draft.recurring.length === 0 ? (
          <div className="surface mx-auto mb-4 max-w-2xl">
            <EmptyState
              icon={PiggyBank}
              title="Not much history yet"
              description="Budgets work best after a month or two of synced transactions. You can still set one up by hand."
              className="py-8"
            />
          </div>
        ) : null}
        <BudgetSetup draft={draft} daysInMonth={daysInMonth(y, m)} />
      </div>
    );
  }

  const s = status;
  // Not awaited: the tips stream into each guideline row when ready.
  const tips = guidanceTips(s);
  const [setup, cats, insight] = await Promise.all([getBudgetSetup(), listCategories(), weeklyInsight()]);
  const expenseCats = cats.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <PageHeader
        eyebrow={monthLabel(today, "long")}
        title="Budget"
        description="What's safe to spend after bills and savings."
        actions={
          <>
            <EditAmountsButton
              monthlyIncome={setup.settings?.monthlyIncome ?? null}
              averageIncome={s.averageIncome}
              savingsGoal={s.savingsGoal}
            />
            <Link href="/budget?setup=1" className={buttonVariants({ variant: "ghost" })}>
              <RotateCcw />
              Start over
            </Link>
          </>
        }
      />

      <Hero s={s} />

      {/* ---------- KPI strip ---------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 xl:grid-cols-4">
        <Kpi label={s.incomeIsAverage ? "Income (3-mo average)" : "Income"}>
          <Money value={s.income} className="text-2xl leading-none font-semibold" />
        </Kpi>
        <Kpi label="Fixed bills">
          <Money value={s.fixedTotal} className="text-2xl leading-none font-semibold" />
          <p className="text-xs text-muted-foreground">
            {s.fixed.filter((f) => f.paid).length} of {s.fixed.length} paid
          </p>
        </Kpi>
        <Kpi label="Savings goal">
          <Money value={s.savingsGoal} className="text-2xl leading-none font-semibold" />
          <p className="text-xs text-muted-foreground">
            {s.income > 0 ? `${Math.round((s.savingsGoal / s.income) * 100)}% of income` : "—"}
          </p>
        </Kpi>
        <Kpi label="Projected savings">
          <span
            className={cn(
              "num text-2xl leading-none font-semibold",
              s.projectedSavings < s.savingsGoal && "text-negative",
            )}
          >
            {s.projectedSavings < 0 ? "−" : ""}
            {formatMoneyWhole(Math.abs(s.projectedSavings))}
          </span>
          <p className="text-xs text-muted-foreground">
            {s.projectedSavings >= s.savingsGoal
              ? "On track for your goal"
              : `${formatMoneyWhole(s.savingsGoal - s.projectedSavings)} short at this pace`}
          </p>
        </Kpi>
      </div>

      <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-5">
        <Guidelines s={s} tips={tips} categories={expenseCats} />

        <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-2">
          {/* ---------- Weekly check-in ---------- */}
          <Card className="gap-0 px-5 sm:px-6 sm:py-6">
            <CardHeading
              title="Weekly check-in"
              subtitle={insight ? `Written ${formatRelative(insight.createdAt)}` : "A short note each Monday"}
              action={<RefreshInsightButton />}
            />
            <p className="mt-3 text-sm leading-relaxed">
              {insight?.content ?? "Your first check-in will show up here after the next daily sync."}
            </p>
          </Card>

          <FixedBills s={s} categories={expenseCats} />
        </div>
      </div>
    </div>
  );
}

type CategoryOption = { id: number; name: string };

/* ---------- Spending guidelines ---------- */

function Guidelines({
  s,
  tips,
  categories,
}: {
  s: BudgetStatus;
  tips: Promise<Record<string, string>>;
  categories: CategoryOption[];
}) {
  const pace = s.day / s.daysInMonth;
  const assigned = s.guidelines.reduce((sum, g) => sum + g.amount, 0);
  const trimmedBy = s.guidelines
    .filter((g) => g.source === "suggested" && g.usual - g.amount >= 5)
    .reduce((sum, g) => sum + (g.usual - g.amount), 0);

  return (
    <Card className="gap-0 px-5 sm:px-6 sm:py-6 lg:col-span-3">
      <CardHeading
        title="Spending guidelines"
        subtitle={
          s.safeToSpend > 0
            ? `How to split ${formatMoneyWhole(s.safeToSpend)} of flexible spending this month`
            : "What to aim for in each category"
        }
        action={<ItemDialog kind="limit" trigger="add" categories={categories} />}
      />

      {s.safeToSpend <= 0 ? (
        <EmptyState
          icon={Scale}
          title="Nothing left to split"
          description="Your fixed bills and savings goal use up your whole income. Lower the savings goal or check your income to get guidelines."
          className="py-8"
        />
      ) : s.guidelines.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No spending history yet"
          description="Guidelines come from your last three months. They'll show up after a few syncs, or you can set a limit yourself."
          className="py-8"
        />
      ) : (
        <>
          <Allocation s={s} />
          {trimmedBy >= 5 && (
            <p className="mt-3 text-xs text-muted-foreground">
              To hit your savings goal, these trim{" "}
              <span className="num font-medium text-foreground">{formatMoneyWhole(trimmedBy)}</span> off your usual
              spending, mostly from wants.
              {assigned > s.safeToSpend + 5 &&
                ` Even so they come to ${formatMoneyWhole(assigned - s.safeToSpend)} more than you have, so your savings goal may be too high.`}
            </p>
          )}

          <ul className="mt-4 divide-y">
            {s.guidelines.map((g) => {
              const ratio = g.amount > 0 ? g.spent / g.amount : g.spent > 0 ? 1.01 : 0;
              const over = g.spent > g.amount;
              const ahead = !over && ratio > pace + 0.1;
              const tone = over ? "bg-negative" : ahead ? "bg-warning" : "bg-positive";
              const trim = g.usual - g.amount;
              return (
                <li key={g.categoryId} className="group py-3.5 first:pt-1 last:pb-0">
                  <div className="flex items-start gap-3">
                    <CategoryIcon name={g.name} color={g.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/transactions?category=${g.categoryId}&from=${s.month}-01`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {g.name}
                        </Link>
                        {g.source === "limit" ? (
                          <StatusChip tone="brand">Your limit</StatusChip>
                        ) : trim >= 5 ? (
                          <StatusChip>{formatMoneyWhole(trim)} under usual</StatusChip>
                        ) : null}
                        <div className="-my-1 flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
                          <ItemDialog
                            kind="limit"
                            trigger="edit"
                            categories={categories}
                            item={{
                              id: g.limitId,
                              kind: "limit",
                              label: g.name,
                              amount: g.amount,
                              categoryId: g.categoryId,
                              matchField: null,
                              pattern: null,
                            }}
                          />
                          {g.limitId !== null && <DeleteItemButton id={g.limitId} label={g.name} reset />}
                        </div>
                      </div>
                      <Suspense fallback={<Skeleton className="mt-1.5 h-3 w-3/4 max-w-64" />}>
                        <Tip tips={tips} id={g.categoryId} />
                      </Suspense>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-semibold">
                        {formatMoneyWhole(g.amount)}
                        <span className="font-normal text-muted-foreground">/mo</span>
                      </p>
                      <p className="num text-xs text-muted-foreground">~{formatMoneyWhole(g.weekly)}/wk</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3 pl-10">
                    <Bar ratio={ratio} marker={pace} tone={tone} className="h-1.5 flex-1" />
                    <span className="num w-28 shrink-0 text-right text-[0.6875rem] text-muted-foreground">
                      {over ? (
                        <span className="font-medium text-negative">{formatMoneyWhole(g.spent - g.amount)} over</span>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">{formatMoneyWhole(g.spent)}</span> spent
                        </>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {s.unassigned >= 5 && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
              <span>
                <span className="num font-medium text-foreground">{formatMoneyWhole(s.unassigned)}</span> unassigned,
                a cushion for anything outside these categories.
              </span>
            </p>
          )}
        </>
      )}
    </Card>
  );
}

async function Tip({ tips, id }: { tips: Promise<Record<string, string>>; id: number }) {
  const tip = (await tips)[String(id)];
  if (!tip) return null;
  return <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{tip}</p>;
}

/** One bar showing how safe-to-spend is split across categories. */
function Allocation({ s }: { s: BudgetStatus }) {
  const assigned = s.guidelines.reduce((sum, g) => sum + g.amount, 0);
  const total = Math.max(s.safeToSpend, assigned);
  if (total <= 0) return null;
  return (
    <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
      {s.guidelines
        .filter((g) => g.amount > 0)
        .map((g) => (
          <span
            key={g.categoryId}
            className="h-full min-w-1"
            style={{ width: `${(g.amount / total) * 100}%`, backgroundColor: g.color }}
            title={`${g.name}: ${formatMoneyWhole(g.amount)}`}
          />
        ))}
      {s.unassigned > 0 && (
        <span
          className="h-full flex-1 bg-muted"
          title={`Unassigned: ${formatMoneyWhole(s.unassigned)}`}
        />
      )}
    </div>
  );
}

/* ---------- Fixed bills (compact) ---------- */

function FixedBills({ s, categories }: { s: BudgetStatus; categories: CategoryOption[] }) {
  const paidCount = s.fixed.filter((f) => f.paid).length;
  // Unpaid first with the soonest due on top; paid ones sink.
  const bills = [...s.fixed].sort(
    (a, b) => Number(!!a.paid) - Number(!!b.paid) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"),
  );

  return (
    <Card className="gap-0 px-5 sm:px-6 sm:py-6">
      <CardHeading
        title="Fixed bills"
        subtitle={
          s.fixed.length
            ? `${formatMoneyWhole(s.fixedTotal)}/mo · ${paidCount} of ${s.fixed.length} paid`
            : "Same every month, set aside first"
        }
        action={<ItemDialog kind="fixed" trigger="add" categories={categories} />}
      />

      {s.fixed.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No fixed bills"
          description="Add rent, subscriptions, and other monthly costs."
          className="py-6"
        />
      ) : (
        <>
          <Bar ratio={s.fixedTotal > 0 ? s.fixedPaid / s.fixedTotal : 0} tone="bg-brand" className="mt-3 h-1.5" />
          <ul className="-mx-2 mt-3 space-y-0.5">
            {bills.map((f) => (
              <li
                key={f.id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
              >
                <CategoryIcon name={f.categoryName} color={f.categoryColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", f.paid && "text-muted-foreground")}>{f.label}</p>
                  <p className="truncate text-[0.6875rem] text-muted-foreground">
                    {f.paid
                      ? `Paid ${formatDateShort(f.paid.date)}`
                      : f.dueDate
                        ? `Due ~${formatDateShort(f.dueDate)}`
                        : f.pattern
                          ? "Not seen yet this month"
                          : "Not tracked"}
                  </p>
                </div>
                {f.paid ? (
                  <Check className="size-3.5 shrink-0 text-brand" strokeWidth={3} aria-label="Paid" />
                ) : (
                  f.dueDate && f.dueDate < s.today && <StatusChip tone="warning">Late?</StatusChip>
                )}
                <span className="num w-14 shrink-0 text-right text-sm font-medium">{formatMoneyWhole(f.amount)}</span>
                <div className="-mr-1 flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
                  <ItemDialog
                    kind="fixed"
                    trigger="edit"
                    categories={categories}
                    item={{
                      id: f.id,
                      kind: "fixed",
                      label: f.label,
                      amount: f.amount,
                      categoryId: f.categoryId,
                      matchField: f.matchField,
                      pattern: f.pattern,
                    }}
                  />
                  <DeleteItemButton id={f.id} label={f.label} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {s.newRecurring.length > 0 && (
        <details className="group/found mt-4 rounded-xl border border-dashed">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <Sparkles className="size-3.5 text-brand" />
            {s.newRecurring.length} repeating charge{s.newRecurring.length === 1 ? "" : "s"} not in your budget
            <ChevronDown className="ml-auto size-3.5 text-muted-foreground transition-transform group-open/found:rotate-180" />
          </summary>
          <ul className="divide-y border-t border-dashed">
            {s.newRecurring.slice(0, 6).map((b) => (
              <li key={b.key} className="flex items-center gap-2.5 px-3 py-2">
                <CategoryIcon name={b.categoryName} color={b.categoryColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.merchant}</p>
                  <p className="truncate text-[0.6875rem] text-muted-foreground">
                    {b.months === 1 ? "Charged once so far" : `${b.months} months in a row`} · next ~
                    {formatDateShort(b.nextExpected)}
                  </p>
                </div>
                <span className="num text-sm font-medium">{formatMoneyWhole(b.amount)}</span>
                <AddDetectedButton bill={b} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** This week's check-in; written on first visit if the cron hasn't made one yet. */
async function weeklyInsight() {
  const latest = await latestInsight();
  if (latest) return latest;
  try {
    return await generateWeeklyInsight();
  } catch (err) {
    console.error("insight failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function Hero({ s }: { s: BudgetStatus }) {
  const ratio = s.safeToSpend > 0 ? s.flexSpent / s.safeToSpend : s.flexSpent > 0 ? 1.01 : 0;
  const pace = s.day / s.daysInMonth;
  const diff = s.expectedByNow - s.flexSpent;
  const over = s.remaining < 0;
  const tone = over ? "bg-negative" : ratio > pace + 0.1 ? "bg-warning" : "bg-positive";
  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{over ? "Over budget by" : "Left to spend this month"}</p>
          <Money value={Math.abs(s.remaining)} className={cn("text-4xl font-semibold sm:text-5xl", over && "text-negative")} />
          <p className="text-sm text-muted-foreground">
            {over ? (
              "Spending more now eats into your savings goal."
            ) : (
              <>
                About <span className="num font-semibold text-foreground">{formatMoneyWhole(s.perDayLeft)}</span> a day
                for the next {s.daysLeft} day{s.daysLeft === 1 ? "" : "s"}.
              </>
            )}
          </p>
        </div>
        <div className="text-sm sm:text-right">
          <p className={cn("font-medium", diff >= 0 ? "text-positive" : "text-negative")}>
            {Math.abs(diff) < 5
              ? "Right on pace"
              : diff > 0
                ? `${formatMoneyWhole(diff)} under pace`
                : `${formatMoneyWhole(-diff)} over pace`}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatMoneyWhole(s.flexSpent)} of {formatMoneyWhole(s.safeToSpend)} flexible spending used
          </p>
        </div>
      </div>
      <Bar ratio={ratio} marker={pace} tone={tone} className="mt-5 h-2.5" />
      <div className="mt-2 flex justify-between text-[0.6875rem] text-muted-foreground">
        <span>Day {s.day}</span>
        <span>{s.daysInMonth - s.day} days left</span>
      </div>
    </div>
  );
}

/** Progress bar with a tick where an even pace would be today. */
function Bar({ ratio, marker, tone, className }: { ratio: number; marker?: number; tone: string; className?: string }) {
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-muted", className)}>
      <span className={cn("absolute inset-y-0 left-0 rounded-full transition-all", tone)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      {marker !== undefined && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-foreground/40"
          style={{ left: `calc(${Math.min(marker, 1) * 100}% - 1px)` }}
          title="Even pace for today"
        />
      )}
    </div>
  );
}

function CardHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-heading text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
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
