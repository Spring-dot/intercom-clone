import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";

export default async function InboxPage() {
  const { workspaceId } = await ensureWorkspace();

  // workspaceId comes from the authenticated session via ensureWorkspace()
  // above -- never from a client-supplied value -- so this query can only
  // ever return conversations belonging to the caller's own workspace.
  const conversations = await db.conversation.findMany({
    where: { workspaceId },
    include: {
      contact: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Inbox</h1>
      {conversations.length === 0 ? (
        <p className="text-sm text-gray-500">No conversations yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {conversations.map((conversation) => {
            const latestMessage = conversation.messages[0];
            return (
              <li key={conversation.id} className="py-3 flex flex-col gap-1">
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
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
