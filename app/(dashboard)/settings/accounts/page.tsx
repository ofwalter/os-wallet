import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { db, accounts, plaidItems, type PlaidItem } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { MAX_ITEMS } from "@/lib/plaid";
import { HideAccountSwitch, RemoveItemButton } from "./account-controls";

export const maxDuration = 300; // Reconnect runs a sync

const STATUS_LABEL: Record<PlaidItem["status"], string> = {
  ok: "Connected",
  login_required: "Login required",
  error: "Error",
};

export default async function AccountsPage() {
  await connection(); // always render per request
  const [items, accts] = await Promise.all([
    db.select().from(plaidItems).orderBy(asc(plaidItems.institutionName)),
    db.select().from(accounts).orderBy(asc(accounts.name)),
  ]);
  const env = process.env.PLAID_ENV ?? "sandbox";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Connections: {items.length}/{MAX_ITEMS} · Plaid {env}
          </p>
        </div>
        <PlaidLinkButton
          mode="new"
          linkedInstitutionIds={items.flatMap((i) => (i.institutionId ? [i.institutionId] : []))}
          disabled={items.length >= MAX_ITEMS}
        />
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No banks linked yet.
          {env === "sandbox" && " In Sandbox, log in with user_good / pass_good."}
        </p>
      )}

      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {item.institutionName ?? "Unknown institution"}
                <Badge variant={item.status === "ok" ? "secondary" : "destructive"}>
                  {STATUS_LABEL[item.status]}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Linked {formatDateTime(item.createdAt)}
              </p>
              {item.lastError && <p className="text-xs text-destructive">{item.lastError}</p>}
            </div>
            <div className="flex items-start gap-2">
              {item.status !== "ok" && <PlaidLinkButton mode="update" itemId={item.id} />}
              <RemoveItemButton itemId={item.id} name={item.institutionName ?? "this bank"} />
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {accts
                .filter((a) => a.itemId === item.id)
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <div className={a.hidden ? "text-muted-foreground" : undefined}>
                      <div>
                        {a.name}
                        {a.mask && <span className="text-muted-foreground"> ••{a.mask}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.subtype ?? a.type}
                        {a.currentBalance !== null && ` · ${formatMoney(a.currentBalance)}`}
                      </div>
                    </div>
                    <HideAccountSwitch accountId={a.id} hidden={a.hidden} />
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
