"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * OS Wallet mark: an "O" ring on a violet gradient tile, with a spark cut
 * into its shoulder. Ids are per-instance so a hidden copy (e.g. the desktop
 * sidebar on mobile) never breaks the gradient of a visible one.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="2" y1="1" x2="30" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C6BFF" />
          <stop offset="0.55" stopColor="#5B4FF0" />
          <stop offset="1" stopColor="#3A2FB8" />
        </linearGradient>
        <radialGradient
          id={`${id}-glow`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(24 6) rotate(135) scale(22)"
        >
          <stop stopColor="#E8B8FF" stopOpacity="0.75" />
          <stop offset="1" stopColor="#E8B8FF" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-cut`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <rect width="32" height="32" fill="#fff" />
          <circle cx="22.5" cy="9.5" r="5.4" fill="#000" />
        </mask>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect width="32" height="32" rx="9" fill={`url(#${id}-glow)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="#fff" strokeOpacity="0.18" />
      <circle cx="14.5" cy="17.5" r="7" stroke="#fff" strokeWidth="3.4" mask={`url(#${id}-cut)`} />
      <path
        d="M22.5 5.2c.33 2.55 1.2 3.42 3.75 3.75-2.55.33-3.42 1.2-3.75 3.75-.33-2.55-1.2-3.42-3.75-3.75 2.55-.33 3.42-1.2 3.75-3.75Z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="font-heading text-[1.0625rem] font-semibold tracking-tight">
        OS <span className="text-muted-foreground">Wallet</span>
      </span>
    </span>
  );
}
