import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishNewMessage } from "@/lib/pusher";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { widgetCorsHeaders } from "@/lib/cors";

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
  const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : null;
  const visitorToken = typeof payload?.visitorToken === "string" ? payload.visitorToken : null;
  const text = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!conversationId || !visitorToken || !text) {
    return NextResponse.json(
      { error: "conversationId, visitorToken, and body are required" },
      { status: 400, headers: widgetCorsHeaders }
    );
  }

  // The visitor-side equivalent of the workspace-ownership check: the
  // conversation's contact must be resolvable back to THIS visitor's opaque
  // token (minted in /api/widget/session), not just any conversation id the
  // caller happens to send.
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, contact: { externalId: visitorToken } },
    select: { id: true, workspaceId: true },
  });
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404, headers: widgetCorsHeaders }
    );
  }

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        senderType: "contact",
        body: text,
      },
    });
    await tx.conversation.update({ where: { id: conversation.id }, data: {} });
    return created;
  });

  await publishNewMessage(conversation.id, message);

  return NextResponse.json(message, { status: 201, headers: widgetCorsHeaders });
}
