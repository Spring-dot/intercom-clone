import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { publishNewMessage } from "@/lib/pusher";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const { workspaceId, userId } = await ensureWorkspace();

  const payload = await request.json().catch(() => null);
  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }

  // The workspaceId in this WHERE clause comes from the session (via
  // ensureWorkspace), not from the client -- a conversationId belonging to
  // another workspace will not be found here.
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        workspaceId,
        conversationId,
        senderType: "agent",
        authorId: userId,
        body: text,
      },
    });
    // Bumps `updatedAt` (via @updatedAt) so the conversation resurfaces to
    // the top of the inbox list.
    await tx.conversation.update({ where: { id: conversationId }, data: {} });
    return created;
  });

  await publishNewMessage(conversationId, message);

  return NextResponse.json(message, { status: 201 });
}
