import { connection } from "next/server";
import { CalendarClock, Check, PiggyBank, RotateCcw, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Money, StatusChip } from "@/components/transaction-bits";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const [setup, cats, insight] = await Promise.all([getBudgetSetup(), listCategories(), weeklyInsight()]);
  const expenseCats = cats.filter((c) => c.kind === "expense").map((c) => ({ id: c.id, name: c.name }));
  const s = status;

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

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-5">
        {/* ---------- Fixed bills ---------- */}
        <Card className="gap-0 px-5 sm:px-6 sm:py-6 lg:col-span-3">
          <CardHeading
            title="Fixed bills"
            subtitle="Same every month, set aside first"
            action={<ItemDialog kind="fixed" trigger="add" categories={expenseCats} />}
          />
          {s.fixed.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No fixed bills"
              description="Add rent, subscriptions, and other monthly costs."
              className="py-8"
            />
          ) : (
            <ul className="mt-3 divide-y rounded-xl border">
              {s.fixed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                  <CategoryIcon name={f.categoryName} color={f.categoryColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
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
                    <StatusChip tone="brand">
                      <Check className="mr-0.5 size-2.5" strokeWidth={3} />
                      Paid
                    </StatusChip>
                  ) : (
                    f.dueDate && f.dueDate < s.today && <StatusChip tone="warning">Late?</StatusChip>
                  )}
                  <span className="num w-16 text-right text-sm font-medium">{formatMoneyWhole(f.amount)}</span>
                  <div className="flex">
                    <ItemDialog
                      kind="fixed"
                      trigger="edit"
                      categories={expenseCats}
                      item={{
                        id: f.id,
                        kind: "fixed",
                        label: f.label,
                        amount: f.amount,
                        categoryId: null,
                        matchField: f.matchField,
                        pattern: f.pattern,
                      }}
                    />
                    <DeleteItemButton id={f.id} label={f.label} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {s.newRecurring.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow mb-1.5 inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-brand" />
                Repeating charges not in your budget
              </p>
              <ul className="divide-y rounded-xl border border-dashed">
                {s.newRecurring.slice(0, 6).map((b) => (
                  <li key={b.key} className="flex items-center gap-3 px-3 py-2.5">
                    <CategoryIcon name={b.categoryName} color={b.categoryColor} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.merchant}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.months} months in a row · next ~{formatDateShort(b.nextExpected)}
                      </p>
                    </div>
                    <span className="num text-sm font-medium">{formatMoneyWhole(b.amount)}</span>
                    <AddDetectedButton bill={b} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

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

          {/* ---------- Category limits ---------- */}
          <Card className="gap-0 px-5 sm:px-6 sm:py-6">
            <CardHeading
              title="Category limits"
              subtitle="Soft caps, not counting fixed bills"
              action={<ItemDialog kind="limit" trigger="add" categories={expenseCats} />}
            />
            {s.limits.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No limits"
                description="Optional. Add one for a category you want to keep an eye on."
                className="py-6"
              />
            ) : (
              <ul className="mt-4 space-y-4">
                {s.limits.map((l) => {
                  const ratio = l.limit > 0 ? l.spent / l.limit : 0;
                  const pace = s.day / s.daysInMonth;
                  const tone = ratio > 1 ? "bg-negative" : ratio > pace + 0.1 ? "bg-warning" : "bg-positive";
                  return (
                    <li key={l.id} className="group">
                      <div className="mb-1.5 flex items-center gap-2">
                        <CategoryIcon name={l.categoryName} color={l.categoryColor} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          <span className="font-medium text-foreground">{formatMoneyWhole(l.spent)}</span> /{" "}
                          {formatMoneyWhole(l.limit)}
                        </span>
                        <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
                          <ItemDialog
                            kind="limit"
                            trigger="edit"
                            categories={expenseCats}
                            item={{
                              id: l.id,
                              kind: "limit",
                              label: l.label,
                              amount: l.limit,
                              categoryId: l.categoryId,
                              matchField: null,
                              pattern: null,
                            }}
                          />
                          <DeleteItemButton id={l.id} label={l.label} />
                        </div>
                      </div>
                      <Bar ratio={ratio} marker={pace} tone={tone} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
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
function Bar({ ratio, marker, tone, className }: { ratio: number; marker: number; tone: string; className?: string }) {
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-muted", className)}>
      <span className={cn("absolute inset-y-0 left-0 rounded-full transition-all", tone)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      <span
        aria-hidden
        className="absolute inset-y-0 w-0.5 bg-foreground/40"
        style={{ left: `calc(${Math.min(marker, 1) * 100}% - 1px)` }}
        title="Even pace for today"
      />
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
