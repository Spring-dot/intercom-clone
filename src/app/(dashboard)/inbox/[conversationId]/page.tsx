import { notFound } from "next/navigation";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { isOnline } from "@/lib/presence";
import { MessageComposer } from "./message-composer";
import { ConversationControls } from "./conversation-controls";
import { MessageList } from "./message-list";
import { ConversationSummaryPanel } from "./conversation-summary-panel";
import { ContactPresence } from "./contact-presence";

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
    <main className="flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{conversation.contact.name}</h1>
          <p className="truncate text-sm text-gray-500">
            {conversation.channel}
            {conversation.contact.email ? ` · ${conversation.contact.email}` : ""}
          </p>
        </div>
        {/* Presence is only meaningful for chat -- an email contact isn't
            "on the page", and a permanently grey dot would just read as
            broken. */}
        {conversation.channel === "chat" && (
          <ContactPresence
            conversationId={conversation.id}
            initialOnline={isOnline(conversation.contact.lastSeenAt)}
          />
        )}
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
        initialContactLastReadAt={
          conversation.contactLastReadAt ? conversation.contactLastReadAt.toISOString() : null
        }
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
