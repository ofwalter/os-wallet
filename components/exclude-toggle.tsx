"use client";

import { useOptimistic, useTransition } from "react";
import { setExcluded } from "@/app/actions";

export function ExcludeToggle({ transactionId, excluded }: { transactionId: number; excluded: boolean }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(excluded);
  return (
    <input
      type="checkbox"
      aria-label="Exclude from totals"
      title="Exclude from totals"
      className="size-4 accent-primary"
      checked={checked}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.checked;
        startTransition(async () => {
          setChecked(next);
          await setExcluded(transactionId, next);
        });
      }}
    />
  );
}
