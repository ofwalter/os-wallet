import { createHmac, timingSafeEqual } from "node:crypto";

// Session cookie value: "<expiresAtMs>.<hmac-sha256 hex>". There's only one
// user, so the signed expiry is all the session needs to carry.

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken(now = Date.now()): string {
  const expires = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expires}.${sign(expires)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || !/^\d+$/.test(expires)) return false;
  const expected = Buffer.from(sign(expires), "hex");
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(expires) > now;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
