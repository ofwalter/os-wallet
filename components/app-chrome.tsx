"use client";

import { Landmark, LogOut, MoreHorizontal, Tags } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { SyncNowButton } from "@/components/sync-now-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SyncStatus = {
  status: "running" | "success" | "partial" | "error" | "never";
  relative: string | null;
};

const STATUS_DOT: Record<SyncStatus["status"], string> = {
  success: "bg-positive",
  partial: "bg-warning",
  error: "bg-negative",
  running: "bg-brand animate-pulse",
  never: "bg-muted-foreground/40",
};

export function SyncStatusLine({ sync, className }: { sync: SyncStatus; className?: string }) {
  const text =
    sync.status === "never"
      ? "Never synced"
      : sync.status === "running"
        ? "Syncing…"
        : `Synced ${sync.relative}${sync.status === "partial" ? " · partial" : sync.status === "error" ? " · failed" : ""}`;
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[sync.status])} />
      {text}
    </span>
  );
}

export function SidebarFooter({ sync }: { sync: SyncStatus }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
        <SyncStatusLine sync={sync} />
        <SyncNowButton variant="icon" className="-mr-1.5" />
      </div>
      <div className="flex items-center justify-between">
        <ThemeToggle />
        <form action={logout}>
          <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
            <LogOut />
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}

export function MobileHeader({ sync }: { sync: SyncStatus }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/" aria-label="OS Wallet home">
          <Logo markClassName="size-7" />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <SyncNowButton variant="icon" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="icon-sm" variant="ghost" aria-label="More" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-2">
              <DropdownMenuLabel className="px-1 py-1">
                <SyncStatusLine sync={sync} />
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/settings/accounts" />}>
                <Landmark />
                Accounts
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings/categories" />}>
                <Tags />
                Categories
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-1 py-1.5 text-sm">
                Theme
                <ThemeToggle />
              </div>
              <DropdownMenuSeparator />
              <form action={logout}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                >
                  <LogOut />
                  Log out
                </Button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
