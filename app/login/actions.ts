"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/session";

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = String(formData.get("password") ?? "");
  const hash = process.env.DASHBOARD_PASSWORD_HASH;
  if (!hash) return "DASHBOARD_PASSWORD_HASH is not set.";

  if (!password || !(await bcrypt.compare(password, hash))) {
    await new Promise((r) => setTimeout(r, 750)); // slow down guessing
    return "Incorrect password.";
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: true, // browsers accept Secure cookies on http://localhost
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // Only allow same-site relative redirects.
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
