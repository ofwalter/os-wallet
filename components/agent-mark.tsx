import { cn } from "@/lib/utils";

export type AgentMood = "still" | "idle" | "thinking";

/**
 * Agent's face: an isometric voxel (a nod to the OS monogram's cubes) that
 * looks at you corner-first, one eye on each side face. Drawn on a 24-unit
 * grid in `currentColor` so it drops in wherever a lucide icon would.
 * `idle` blinks now and then; `thinking` glances side to side.
 */
export function AgentMark({
  className,
  strokeWidth = 1.75,
  mood = "still",
}: {
  className?: string;
  strokeWidth?: number;
  mood?: AgentMood;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
    >
      <path d="M12 2.5 20.5 7 12 11.5 3.5 7Z" fill="currentColor" fillOpacity={0.18} />
      <path d="M3.5 7v10l8.5 4.5 8.5-4.5V7M12 11.5v10" />
      <g
        className={cn(
          "agent-eyes",
          mood === "idle" && "agent-blink",
          mood === "thinking" && "agent-glance",
        )}
        fill="currentColor"
        stroke="none"
      >
        <ellipse cx="8.4" cy="14.6" rx="1.15" ry="1.7" />
        <ellipse cx="15.6" cy="14.6" rx="1.15" ry="1.7" />
      </g>
    </svg>
  );
}
