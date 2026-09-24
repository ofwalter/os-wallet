"use client";

import { History, MessageSquare, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteConversation } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ConversationSummary = { id: number; title: string; updatedAt: string };

export function ConversationList({
  conversations,
  activeId,
  onNavigate,
}: {
  conversations: ConversationSummary[];
  activeId: number | null;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = (id: number) =>
    startTransition(async () => {
      const res = await deleteConversation(id);
      if (!res.ok) toast.error(res.error);
      else if (id === activeId) router.replace("/agent");
    });

  return (
    <div className={cn("surface flex flex-col gap-1 p-2", pending && "opacity-60")}>
      <Link
        href="/agent"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "outline" }), "mb-1 w-full justify-start")}
      >
        <Plus />
        New chat
      </Link>
      {conversations.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">Your chats will show up here.</p>
      ) : (
        <>
          <p className="eyebrow mt-2 mb-1 px-2">Recent</p>
          <ul className="flex max-h-[60dvh] flex-col gap-0.5 overflow-y-auto">
            {conversations.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <Link
                    href={`/agent?c=${c.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg py-2 pr-9 pl-2.5 text-sm transition-colors hover:bg-muted/60",
                      active && "bg-muted",
                    )}
                  >
                    <MessageSquare
                      className={cn("mt-0.5 size-3.5 shrink-0", active ? "text-brand" : "text-muted-foreground")}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">{formatRelative(new Date(c.updatedAt))}</span>
                    </span>
                  </Link>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Delete chat"
                    disabled={pending}
                    onClick={() => remove(c.id)}
                    className="absolute top-2 right-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Chat history in a sheet, for screens without the side column. */
export function ConversationSheet({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" className="lg:hidden" />}>
        <History />
        Chats
      </SheetTrigger>
      <SheetContent side="left" className="gap-0">
        <SheetHeader>
          <SheetTitle>Chats</SheetTitle>
        </SheetHeader>
        <div className="px-2">
          <ConversationList conversations={conversations} activeId={activeId} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
