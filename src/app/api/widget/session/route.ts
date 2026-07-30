import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { widgetCorsHeaders } from "@/lib/cors";
import { countOnlineAgents } from "@/lib/presence-server";

// How much backlog the widget gets on open. Enough that a returning visitor
// sees the conversation they remember, bounded so a long-running thread can't
// turn every widget load into a huge payload.
const HISTORY_LIMIT = 50;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: widgetCorsHeaders });
}

export async function POST(request: NextRequest) {
  const allowed = await checkRateLimit(getClientIp(request));
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: widgetCorsHeaders }
    );
  }

  const payload = await request.json().catch(() => null);
  const workspaceId = typeof payload?.workspaceId === "string" ? payload.workspaceId : null;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400, headers: widgetCorsHeaders }
    );
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json(
      { error: "Unknown workspace" },
      { status: 404, headers: widgetCorsHeaders }
    );
  }

  const visitorToken =
    typeof payload?.visitorToken === "string" && payload.visitorToken ? payload.visitorToken : randomUUID();

  const contact = await db.contact.upsert({
    where: { workspaceId_externalId: { workspaceId, externalId: visitorToken } },
    update: { lastSeenAt: new Date() },
    create: {
      workspaceId,
      externalId: visitorToken,
      name: "Website Visitor",
      lastSeenAt: new Date(),
    },
  });

  // Reuse an existing open chat conversation for this visitor rather than
  // spawning a new one every time the widget loads. Resolved chat threads
  // deliberately don't get reopened here -- a returning visitor with a new
  // question starts a new conversation, and still sees the old one's history
  // only if it's the one that's open.
  let conversation = await db.conversation.findFirst({
    where: { workspaceId, contactId: contact.id, channel: "chat", status: "open" },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: { workspaceId, contactId: contact.id, channel: "chat", status: "open" },
    });
  }

  // The backlog that makes chat history survive a page reload or a return
  // visit days later: the visitorToken in localStorage identifies the contact,
  // and the contact's open conversation carries the messages. Taken newest-first
  // so the LIMIT keeps the *recent* end of a long thread, then flipped back
  // into reading order.
  const recentMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { id: true, senderType: true, body: true, createdAt: true },
  });

  const agentsOnline = await countOnlineAgents(workspaceId);

  return NextResponse.json(
    {
      visitorToken,
      conversationId: conversation.id,
      messages: recentMessages.reverse(),
      agentsOnline,
      // So the widget can mark the visitor's own delivered messages as seen
      // without waiting for the next live `read` event.
      agentLastReadAt: conversation.agentLastReadAt,
    },
    { headers: widgetCorsHeaders }
  );
}
