import { notFound } from "next/navigation";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { MessageComposer } from "./message-composer";
import { ConversationControls } from "./conversation-controls";
import { MessageList } from "./message-list";
import { ConversationSummaryPanel } from "./conversation-summary-panel";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { workspaceId } = await ensureWorkspace();

  // Scoping by workspaceId directly in the WHERE clause (not fetching by id
  // and checking ownership after) is what keeps this tenant-isolated: a
  // conversationId from another workspace simply won't match any row here.
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      contact: true,
      assignee: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) {
    notFound();
  }

  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
  });

  return (
    <main className="p-6 flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{conversation.contact.name}</h1>
          <p className="text-sm text-gray-500">
            {conversation.channel} · {conversation.contact.email}
          </p>
        </div>
      </div>

      <ConversationControls
        conversationId={conversation.id}
        status={conversation.status}
        assigneeId={conversation.assigneeId}
        snoozedUntil={conversation.snoozedUntil ? conversation.snoozedUntil.toISOString() : null}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.user.name ?? m.user.email,
        }))}
      />

      <ConversationSummaryPanel
        conversationId={conversation.id}
        messageCount={conversation.messages.length}
      />

      <MessageList
        conversationId={conversation.id}
        initialMessages={conversation.messages.map((message) => ({
          id: message.id,
          senderType: message.senderType,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
        }))}
      />

      <MessageComposer conversationId={conversation.id} />
    </main>
  );
}
