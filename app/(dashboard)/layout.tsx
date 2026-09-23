import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileHeader, SidebarFooter, type SyncStatus } from "@/components/app-chrome";
import { Logo } from "@/components/logo";
import { MobileTabBar, SidebarNav } from "@/components/nav-links";
import { formatRelative } from "@/lib/format";
import { lastSyncRun, reviewCount } from "@/lib/queries";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Second gate behind proxy.ts. Reading cookies also makes every page here
  // render per request, so financial data is never prerendered at build time.
  if (!verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");

  const [toReview, lastRun] = await Promise.all([reviewCount(), lastSyncRun()]);
  const sync: SyncStatus = lastRun
    ? { status: lastRun.status, relative: formatRelative(lastRun.finishedAt ?? lastRun.startedAt) }
    : { status: "never", relative: null };

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar px-4 py-5 lg:flex">
        <Link href="/" className="mb-8 px-2" aria-label="OS Wallet home">
          <Logo />
        </Link>
        <SidebarNav reviewCount={toReview} />
        <div className="mt-auto">
          <SidebarFooter sync={sync} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <MobileHeader sync={sync} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14">
          {children}
        </main>
      </div>

      <MobileTabBar reviewCount={toReview} />
    </div>
  );
}
