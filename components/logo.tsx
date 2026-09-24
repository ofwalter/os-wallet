"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { MONOGRAM_FACES } from "@/components/logo-paths";

/**
 * OS Wallet mark: the isometric "OS" monogram, drawn in `currentColor` on a
 * transparent background so it follows the theme (black on light, white on
 * dark). The line art is painted into a luminance mask, black faces over
 * white edges, which hides occluded edges without needing a background fill.
 * The source files use a 5-unit stroke, which disappears at sidebar size, so
 * the default is heavier; pass a thinner `strokeWidth` for large renders.
 * Ids are per-instance so a hidden copy (e.g. the desktop sidebar on mobile)
 * never breaks the mask of a visible one.
 */
export function LogoMark({ className, strokeWidth = 12 }: { className?: string; strokeWidth?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="16 16 328 376" aria-hidden className={cn("size-8 shrink-0", className)}>
      <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="408">
        <rect width="360" height="408" fill="#000" />
        {MONOGRAM_FACES.map(([face, edges], i) => (
          <g key={i}>
            <path d={face} fill="#000" stroke="#000" strokeWidth={1} />
            <path d={edges} fill="none" stroke="#fff" strokeWidth={strokeWidth} strokeLinecap="round" />
          </g>
        ))}
      </mask>
      <rect width="360" height="408" fill="currentColor" mask={`url(#${id}-m)`} />
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
