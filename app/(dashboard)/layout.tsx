import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { NavLinks } from "@/components/nav-links";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Second gate behind proxy.ts. Reading cookies also makes every page here
  // render per request, so financial data is never prerendered at build time.
  if (!verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            OS Wallet
          </Link>
          <NavLinks />
          <form action={logout} className="ml-auto">
            <Button variant="ghost" size="sm" type="submit">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
