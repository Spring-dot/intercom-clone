import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishTyping, publishRead, publishPresence } from "@/lib/pusher";
import { checkSignalRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { widgetCorsHeaders } from "@/lib/cors";
import { countOnlineAgents } from "@/lib/presence-server";

/**
 * The visitor's realtime side-channel: typing indicators, read receipts, and
 * the presence heartbeat. One route rather than three because they share the
 * same authentication (the opaque visitorToken), the same rate-limit budget,
 * and the same "cheap, frequent, non-durable" character -- splitting them
 * would triple the boilerplate for no separation that matters.
 */

const VALID_TYPES = new Set(["typing", "read", "heartbeat"]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: widgetCorsHeaders });
}

export async function POST(request: NextRequest) {
  if (!(await checkSignalRateLimit(getClientIp(request)))) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: widgetCorsHeaders }
    );
  }

  const payload = await request.json().catch(() => null);
  const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : null;
  const visitorToken = typeof payload?.visitorToken === "string" ? payload.visitorToken : null;
  const type = typeof payload?.type === "string" ? payload.type : null;

  if (!conversationId || !visitorToken || !type || !VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: "conversationId, visitorToken, and a valid type are required" },
      { status: 400, headers: widgetCorsHeaders }
    );
  }

  // Same ownership check as /api/widget/messages: the conversation must be
  // resolvable back to THIS visitor's token, not just any id the caller sends.
  // Without it, anyone could broadcast typing indicators into a stranger's
  // conversation or mark it read on their behalf.
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, contact: { externalId: visitorToken } },
    select: { id: true, workspaceId: true, contactId: true },
  });
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404, headers: widgetCorsHeaders }
    );
  }

  if (type === "typing") {
    await publishTyping(conversation.id, "contact");
    return NextResponse.json({ ok: true }, { headers: widgetCorsHeaders });
  }

  if (type === "read") {
    const readAt = new Date();
    await db.conversation.update({
      where: { id: conversation.id },
      data: { contactLastReadAt: readAt },
    });
    await publishRead(conversation.id, "contact", readAt);
    return NextResponse.json({ ok: true, at: readAt }, { headers: widgetCorsHeaders });
  }

  // heartbeat: refresh the visitor's own presence and report back whether
  // anyone is on the other side, so the widget can say "we're online" without
  // a second round-trip.
  const seenAt = new Date();
  await db.contact.update({
    where: { id: conversation.contactId },
    data: { lastSeenAt: seenAt },
  });
  await publishPresence(conversation.id, "contact", true);

  const agentsOnline = await countOnlineAgents(conversation.workspaceId);
  return NextResponse.json({ ok: true, agentsOnline }, { headers: widgetCorsHeaders });
}
