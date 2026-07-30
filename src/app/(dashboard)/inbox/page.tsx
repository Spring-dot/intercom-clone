import Link from "next/link";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { reopenElapsedSnoozes } from "@/lib/snooze";
import type { Prisma } from "@/generated/prisma/client";
import { InboxFilters } from "./inbox-filters";

const VALID_CHANNELS = new Set(["chat", "email"]);
const VALID_STATUSES = new Set(["open", "snoozed", "resolved"]);

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { workspaceId } = await ensureWorkspace();
  const { channel, status, assignee } = await searchParams;

  // Before reading the list, not after: a conversation whose snooze elapsed is
  // an open conversation, and the agent should never see a stale "snoozed"
  // sitting in a filter it no longer belongs to. Runs scoped to this
  // workspace, so it costs one indexed update regardless of how many other
  // tenants exist.
  await reopenElapsedSnoozes(workspaceId);

  // workspaceId comes from the authenticated session via ensureWorkspace()
  // above -- never from a client-supplied value -- so this query can only
  // ever return conversations belonging to the caller's own workspace. The
  // filter values below only ever narrow within that scope.
  const where: Prisma.ConversationWhereInput = { workspaceId };

  if (typeof channel === "string" && VALID_CHANNELS.has(channel)) {
    where.channel = channel as Prisma.ConversationWhereInput["channel"];
  }
  if (typeof status === "string" && VALID_STATUSES.has(status)) {
    where.status = status as Prisma.ConversationWhereInput["status"];
  }
  if (assignee === "unassigned") {
    where.assigneeId = null;
  } else if (typeof assignee === "string" && assignee !== "") {
    where.assigneeId = assignee;
  }

  const [conversations, members] = await Promise.all([
    db.conversation.findMany({
      where,
      include: {
        contact: true,
        assignee: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
    }),
  ]);

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Inbox</h1>

      <InboxFilters
        members={members.map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.email }))}
      />

      {conversations.length === 0 ? (
        <p className="text-sm text-gray-500">No conversations match these filters.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {conversations.map((conversation) => {
            const latestMessage = conversation.messages[0];
            // "Unread" is derived from the same read watermark the widget's
            // receipts use, rather than a separate flag that would need
            // keeping in sync: anything from the customer that landed after
            // the last time an agent opened the thread.
            const isUnread =
              latestMessage?.senderType === "contact" &&
              (!conversation.agentLastReadAt ||
                latestMessage.createdAt > conversation.agentLastReadAt);

            return (
              <li key={conversation.id}>
                <Link
                  href={`/inbox/${conversation.id}`}
                  className="-mx-2 flex flex-col gap-1 rounded px-2 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 text-sm">
                    {isUnread && (
                      <span
                        aria-label="Unread"
                        className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                      />
                    )}
                    <span className="text-xs font-medium uppercase text-gray-500">
                      {conversation.channel}
                    </span>
                    <span className="text-xs font-medium text-gray-500">
                      {conversation.status}
                    </span>
                    <span className={isUnread ? "font-semibold" : "font-medium"}>
                      {conversation.contact.name}
                    </span>
                    <span className="ml-auto truncate text-xs text-gray-500">
                      {conversation.assignee
                        ? (conversation.assignee.name ?? conversation.assignee.email)
                        : "Unassigned"}
                    </span>
                  </div>
                  <p
                    className={`truncate text-sm ${
                      isUnread ? "text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {latestMessage ? latestMessage.body : "No messages yet"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
