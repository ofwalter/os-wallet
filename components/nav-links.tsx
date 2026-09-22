"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/transactions", label: "Transactions" },
  { href: "/review", label: "Review" },
  { href: "/settings/accounts", label: "Accounts" },
  { href: "/settings/categories", label: "Categories" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-4 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              active && "font-medium text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
