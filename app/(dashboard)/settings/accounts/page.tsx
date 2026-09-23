import { connection } from "next/server";
import { asc } from "drizzle-orm";
import {
  CircleAlert,
  CreditCard,
  Landmark,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { db, accounts, plaidItems, type PlaidItem } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { MAX_ITEMS } from "@/lib/plaid";
import { cn } from "@/lib/utils";
import { RemoveItemButton, VisibleAccountSwitch } from "./account-controls";

export const metadata = { title: "Accounts" };
export const maxDuration = 300; // Reconnect runs a sync

const STATUS: Record<PlaidItem["status"], { label: string; dot: string; text: string }> = {
  ok: { label: "Connected", dot: "bg-positive", text: "text-positive" },
  login_required: { label: "Login required", dot: "bg-warning", text: "text-amber-700 dark:text-warning" },
  error: { label: "Error", dot: "bg-negative", text: "text-negative" },
};

const TYPE_ICON: Record<string, LucideIcon> = {
  depository: Wallet,
  credit: CreditCard,
  investment: TrendingUp,
  loan: Landmark,
};

// A stable tint per institution, so each bank reads as its own tile.
const TINTS = ["#5b4ff0", "#1baf7a", "#eb6834", "#2a78d6", "#e87ba4", "#eda100", "#0891b2", "#9333ea"];
function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default async function AccountsPage() {
  await connection(); // always render per request
  const [items, accts] = await Promise.all([
    db.select().from(plaidItems).orderBy(asc(plaidItems.institutionName)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
  ]);
  const env = process.env.PLAID_ENV ?? "sandbox";
  const used = items.length;
  const full = used >= MAX_ITEMS;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Accounts"
        description="Banks and cards connected through Plaid."
        actions={
          <PlaidLinkButton
            mode="new"
            linkedInstitutionIds={items.flatMap((i) => (i.institutionId ? [i.institutionId] : []))}
            disabled={full}
          />
        }
      />

      {/* Connection budget */}
      <div className="surface mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Connections</p>
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-md px-1.5 text-[0.625rem] font-semibold tracking-wide uppercase",
                env === "production" ? "bg-positive/12 text-positive" : "bg-warning/15 text-amber-700 dark:text-warning",
              )}
            >
              Plaid {env}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {full
              ? "All connection slots are in use. Remove a bank to link another."
              : "Each linked bank uses one slot. Use Reconnect to fix a broken connection instead of re-linking."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: MAX_ITEMS }, (_, i) => (
              <span
                key={i}
                className={cn("h-6 w-2 rounded-full", i < used ? "bg-brand" : "bg-muted")}
              />
            ))}
          </div>
          <span className="num text-lg font-semibold">
            {used}
            <span className="text-muted-foreground">/{MAX_ITEMS}</span>
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={ShieldCheck}
            title="Link your first bank"
            description={
              <>
                Connections are read-only and your access tokens are encrypted at rest.
                {env === "sandbox" && (
                  <>
                    {" "}
                    In Sandbox, log in with <code className="font-mono text-foreground">user_good</code> /{" "}
                    <code className="font-mono text-foreground">pass_good</code>.
                  </>
                )}
              </>
            }
            className="py-16"
          />
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const name = item.institutionName ?? "Unknown institution";
            const status = STATUS[item.status];
            const tint = tintFor(name);
            const list = accts.filter((a) => a.itemId === item.id);
            return (
              <section key={item.id} className="surface overflow-hidden">
                <header className="flex items-center gap-3 p-4 sm:p-5">
                  <span
                    aria-hidden
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl font-heading text-sm font-bold"
                    style={{ backgroundColor: `color-mix(in oklab, ${tint} 14%, transparent)`, color: tint }}
                  >
                    {initials(name) || <Landmark className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-heading text-base font-semibold">{name}</h2>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className={cn("inline-flex items-center gap-1.5 font-medium", status.text)}>
                        <span className={cn("size-1.5 rounded-full", status.dot)} />
                        {status.label}
                      </span>
                      <span>·</span>
                      <span>Linked {formatDate(item.createdAt.toISOString().slice(0, 10))}</span>
                      <span>·</span>
                      <span>
                        {list.length} account{list.length === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.status !== "ok" && <PlaidLinkButton mode="update" itemId={item.id} />}
                    <RemoveItemButton itemId={item.id} name={name} />
                  </div>
                </header>

                {item.lastError && (
                  <div className="mx-4 mb-4 flex gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive sm:mx-5">
                    <CircleAlert className="mt-px size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{item.lastError}</span>
                  </div>
                )}

                <ul className="divide-y border-t">
                  {list.map((a) => {
                    const Icon = TYPE_ICON[a.type] ?? PiggyBank;
                    const isCredit = a.type === "credit";
                    const utilization =
                      isCredit && a.creditLimit && a.creditLimit > 0
                        ? Math.min((a.currentBalance ?? 0) / a.creditLimit, 1)
                        : null;
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 transition-opacity sm:px-5",
                          a.hidden && "opacity-55",
                        )}
                      >
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {a.name}
                            {a.mask && <span className="ml-1.5 font-mono text-xs text-muted-foreground">••{a.mask}</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {humanize(a.subtype ?? a.type)}
                            {a.hidden && " · Hidden"}
                            {utilization !== null && ` · ${Math.round(utilization * 100)}% of ${formatMoney(a.creditLimit!)} limit`}
                            {!isCredit && a.availableBalance !== null && a.availableBalance !== a.currentBalance &&
                              ` · ${formatMoney(a.availableBalance)} available`}
                          </p>
                          {utilization !== null && (
                            <div className="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  utilization > 0.3 ? "bg-warning" : "bg-positive",
                                )}
                                style={{ width: `${Math.max(utilization * 100, 2)}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="num text-sm font-semibold">
                            {a.currentBalance === null ? "—" : formatMoney(a.currentBalance)}
                          </p>
                          <p className="text-[0.6875rem] text-muted-foreground">{isCredit || a.type === "loan" ? "owed" : "balance"}</p>
                        </div>
                        <VisibleAccountSwitch accountId={a.id} hidden={a.hidden} name={a.name} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
