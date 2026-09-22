import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { db, plaidItems } from "@/lib/db";
import { MAX_ITEMS, describeError, plaid } from "@/lib/plaid";

const Body = z.object({ itemId: z.number().int().optional() });

export async function POST(request: Request) {
  await requireAuth();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { itemId } = parsed.data;

  const base: LinkTokenCreateRequest = {
    user: { client_user_id: "owner" },
    client_name: "OS Wallet",
    country_codes: [CountryCode.Us],
    language: "en",
  };

  let req: LinkTokenCreateRequest;
  if (itemId !== undefined) {
    // Update mode: repairs an existing Item's login without creating a new Item.
    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, itemId));
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    req = { ...base, access_token: decrypt(item.accessTokenEncrypted) };
  } else {
    const [{ n }] = await db.select({ n: count() }).from(plaidItems);
    if (n >= MAX_ITEMS) {
      return NextResponse.json(
        { error: `All ${MAX_ITEMS} connections are in use. Remove one before linking another.` },
        { status: 409 },
      );
    }
    req = {
      ...base,
      products: [Products.Transactions],
      transactions: { days_requested: 730 },
    };
  }

  try {
    const { data } = await plaid().linkTokenCreate(req);
    return NextResponse.json({ link_token: data.link_token });
  } catch (err) {
    console.error("link-token failed:", describeError(err));
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
