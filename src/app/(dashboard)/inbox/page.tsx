import Link from "next/link";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
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
      <h1 className="text-xl font-semibold mb-4">Inbox</h1>

      <InboxFilters
        members={members.map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.email }))}
      />

      {conversations.length === 0 ? (
        <p className="text-sm text-gray-500">No conversations match these filters.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {conversations.map((conversation) => {
            const latestMessage = conversation.messages[0];
            return (
              <li key={conversation.id}>
                <Link
                  href={`/inbox/${conversation.id}`}
                  className="py-3 flex flex-col gap-1 hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="uppercase text-xs font-medium text-gray-500">
                      {conversation.channel}
                    </span>
                    <span className="text-xs font-medium text-gray-500">
                      {conversation.status}
                    </span>
                    <span className="font-medium">{conversation.contact.name}</span>
                  </div>
                  <p className="text-sm text-gray-700 truncate">
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
