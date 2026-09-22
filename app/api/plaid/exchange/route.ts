import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db, plaidItems } from "@/lib/db";
import { MAX_ITEMS, describeError, plaid } from "@/lib/plaid";
import { syncItem } from "@/lib/sync";

export const maxDuration = 300; // initial sync can pull up to 2 years of history

const Body = z.object({
  public_token: z.string().min(1),
  institution_name: z.string().nullish(),
});

export async function POST(request: Request) {
  await requireAuth();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  let accessToken: string;
  let plaidItemId: string;
  try {
    const { data } = await plaid().itemPublicTokenExchange({
      public_token: parsed.data.public_token,
    });
    accessToken = data.access_token;
    plaidItemId = data.item_id;
  } catch (err) {
    console.error("public token exchange failed:", describeError(err));
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }

  // From here on a real Item exists at Plaid. If we can't keep it, remove it
  // so it doesn't silently consume one of the connections.
  const discard = async () => {
    await plaid()
      .itemRemove({ access_token: accessToken })
      .catch((err) => console.error("item/remove failed:", describeError(err)));
  };

  try {
    const { data } = await plaid().itemGet({ access_token: accessToken });
    const institutionId = data.item.institution_id ?? null;
    const institutionName = data.item.institution_name ?? parsed.data.institution_name ?? null;

    if (institutionId) {
      const [dupe] = await db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(eq(plaidItems.institutionId, institutionId));
      if (dupe) {
        await discard();
        return NextResponse.json(
          {
            error: `${institutionName ?? "This bank"} is already linked. The duplicate connection was removed. Use Reconnect on the existing one instead.`,
          },
          { status: 409 },
        );
      }
    }

    const [{ n }] = await db.select({ n: count() }).from(plaidItems);
    if (n >= MAX_ITEMS) {
      await discard();
      return NextResponse.json({ error: `All ${MAX_ITEMS} connections are in use.` }, { status: 409 });
    }

    const [item] = await db
      .insert(plaidItems)
      .values({
        itemId: plaidItemId,
        accessTokenEncrypted: encrypt(accessToken),
        institutionId,
        institutionName,
      })
      .returning();

    // Initial history may not be ready yet; the daily cron picks up the rest.
    let counts = { added: 0, modified: 0, removed: 0 };
    let syncError: string | null = null;
    try {
      counts = await syncItem(item);
    } catch (err) {
      syncError = describeError(err);
      console.error("initial sync failed:", syncError);
    }

    return NextResponse.json({ ok: true, institutionName, ...counts, syncError });
  } catch (err) {
    console.error("exchange failed:", describeError(err));
    await discard();
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}
