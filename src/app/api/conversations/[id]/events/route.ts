import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { publishTyping, publishRead } from "@/lib/pusher";
import { checkSignalRateLimit } from "@/lib/rate-limit";

/**
 * The agent-side mirror of /api/widget/events: typing indicators and read
 * receipts from the dashboard. Presence isn't here -- an agent's availability
 * is workspace-wide, not per-conversation, so it heartbeats once from the
 * dashboard shell via /api/presence instead of per open thread.
 */

const VALID_TYPES = new Set(["typing", "read"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const { workspaceId, userId } = await ensureWorkspace();

  if (!(await checkSignalRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const payload = await request.json().catch(() => null);
  const type = typeof payload?.type === "string" ? payload.type : null;
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  // workspaceId comes from the session, so a conversationId belonging to
  // another workspace simply isn't found here.
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (type === "typing") {
    await publishTyping(conversation.id, "agent");
    return NextResponse.json({ ok: true });
  }

  const readAt = new Date();
  await db.conversation.update({
    where: { id: conversation.id },
    data: { agentLastReadAt: readAt },
  });
  await publishRead(conversation.id, "agent", readAt);

  return NextResponse.json({ ok: true, at: readAt });
}
