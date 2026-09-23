"use client";

import { ArrowRight, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
          Password
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={!!error || undefined}
            className="h-11 rounded-xl bg-background pr-10 pl-9 dark:bg-input/30"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="group h-11 w-full rounded-xl bg-brand text-sm text-brand-foreground shadow-[0_8px_24px_-8px] shadow-brand/60 hover:bg-brand/90"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            Checking…
          </>
        ) : (
          <>
            Unlock dashboard
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </form>
  );
}
