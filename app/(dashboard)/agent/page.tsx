import { connection } from "next/server";
import { conversationMessages, listConversations } from "@/lib/ai/agent";
import { PageHeader } from "@/components/page-header";
import { Chat } from "./chat";
import { ConversationList, ConversationSheet } from "./conversation-list";

export const metadata = { title: "Agent" };

export default async function AgentPage({ searchParams }: PageProps<"/agent">) {
  await connection(); // always render per request
  const sp = await searchParams;
  const raw = Array.isArray(sp.c) ? sp.c[0] : sp.c;
  const conversations = await listConversations();
  const active = raw && /^\d+$/.test(raw) ? conversations.find((c) => c.id === Number(raw)) : undefined;
  const messages = active ? await conversationMessages(active.id) : [];
  const list = conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));

  return (
    <div>
      <PageHeader
        eyebrow="Agent"
        title="Ask about your money"
        description="Spending, merchants, balances, bills, and your budget, in plain answers."
        actions={<ConversationSheet conversations={list} activeId={active?.id ?? null} />}
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="hidden lg:block">
          <ConversationList conversations={list} activeId={active?.id ?? null} />
        </div>
        <Chat key={active?.id ?? "new"} conversationId={active?.id ?? null} initialMessages={messages} />
      </div>
    </div>
  );
}
