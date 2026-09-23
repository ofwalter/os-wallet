"use client";

import {
  ArrowLeftRight,
  Inbox,
  Landmark,
  LayoutGrid,
  Tags,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; short?: string; icon: LucideIcon; badge?: "review" };

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Home", icon: LayoutGrid },
  { href: "/transactions", label: "Transactions", short: "Activity", icon: ArrowLeftRight },
  { href: "/review", label: "Review", icon: Inbox, badge: "review" },
  { href: "/settings/accounts", label: "Accounts", icon: Landmark },
  { href: "/settings/categories", label: "Categories", icon: Tags },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] font-semibold text-brand-foreground tabular-nums",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Vertical nav for the desktop sidebar. */
export function SidebarNav({ reviewCount }: { reviewCount: number }) {
  const isActive = useIsActive();
  return (
    <nav className="flex flex-col gap-0.5">
      <p className="eyebrow mb-1.5 px-3">Menu</p>
      {NAV.map(({ href, label, icon: Icon, badge }, i) => {
        const active = isActive(href);
        return (
          <div key={href}>
            {i === 3 && <p className="eyebrow mt-5 mb-1.5 px-3">Manage</p>}
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                active && "bg-sidebar-accent text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-[1.05rem] transition-colors",
                  active ? "text-brand" : "text-muted-foreground group-hover:text-foreground",
                )}
                strokeWidth={active ? 2.25 : 2}
              />
              <span className="flex-1">{label}</span>
              {badge === "review" && <CountBadge n={reviewCount} />}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar for phones. */
export function MobileTabBar({ reviewCount }: { reviewCount: number }) {
  const isActive = useIsActive();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV.map(({ href, label, short, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors",
                  active && "text-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("size-5", active && "text-brand")}
                    strokeWidth={active ? 2.25 : 1.9}
                  />
                  {badge === "review" && (
                    <CountBadge n={reviewCount} className="absolute -top-1.5 -right-2.5" />
                  )}
                </span>
                {short ?? label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
