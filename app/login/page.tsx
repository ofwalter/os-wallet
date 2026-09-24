import { ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
      {/* Backdrop: soft brand glow over a faint grid. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-1/2 h-[36rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px] dark:bg-brand/25" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-16" strokeWidth={9} />
          <h1 className="mt-5 text-2xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to OS Wallet</p>
        </div>

        <div className="rounded-2xl bg-card/80 p-6 shadow-xl ring-1 ring-border backdrop-blur-xl">
          <LoginForm next={typeof next === "string" ? next : "/"} />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Read-only bank access · tokens encrypted at rest
        </p>
      </div>
    </main>
  );
}
