import "server-only";
import { isAxiosError } from "axios";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export const MAX_ITEMS = 10;

let client: PlaidApi | undefined;

export function plaid(): PlaidApi {
  if (client) return client;
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  }
  client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
          "PLAID-SECRET": process.env.PLAID_SECRET,
        },
      },
    }),
  );
  return client;
}

export type PlaidErrorInfo = { code: string; message: string };

/** Extracts Plaid's error code/message without leaking the request (which holds the access token). */
export function plaidError(err: unknown): PlaidErrorInfo | null {
  if (isAxiosError(err) && err.response?.data?.error_code) {
    const data = err.response.data as { error_code: string; error_message?: string };
    return { code: data.error_code, message: data.error_message ?? data.error_code };
  }
  return null;
}

/** Safe, loggable description of any error thrown around Plaid calls. */
export function describeError(err: unknown): string {
  const p = plaidError(err);
  if (p) return `${p.code}: ${p.message}`;
  if (isAxiosError(err)) return `HTTP ${err.response?.status ?? "error"}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
