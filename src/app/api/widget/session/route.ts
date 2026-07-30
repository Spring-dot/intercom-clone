import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkWidgetRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { widgetCorsHeaders } from "@/lib/cors";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: widgetCorsHeaders });
}

export async function POST(request: NextRequest) {
  const allowed = await checkWidgetRateLimit(getClientIp(request));
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
    update: {},
    create: { workspaceId, externalId: visitorToken, name: "Website Visitor" },
  });

  // Reuse an existing open chat conversation for this visitor rather than
  // spawning a new one every time the widget loads.
  let conversation = await db.conversation.findFirst({
    where: { workspaceId, contactId: contact.id, channel: "chat", status: "open" },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: { workspaceId, contactId: contact.id, channel: "chat", status: "open" },
    });
  }

  return NextResponse.json(
    { visitorToken, conversationId: conversation.id },
    { headers: widgetCorsHeaders }
  );
}
