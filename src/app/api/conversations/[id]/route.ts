import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const VALID_STATUSES = new Set(["open", "snoozed", "resolved"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const { workspaceId } = await ensureWorkspace();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Scoped by workspaceId derived from the session -- a conversationId from
  // another workspace will not match and is treated as not found.
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const data: Prisma.ConversationUpdateInput = {};

  if ("status" in payload) {
    if (typeof payload.status !== "string" || !VALID_STATUSES.has(payload.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = payload.status as Prisma.ConversationUpdateInput["status"];
  }

  if ("assigneeId" in payload) {
    if (payload.assigneeId === null) {
      data.assignee = { disconnect: true };
    } else if (typeof payload.assigneeId === "string") {
      // The assignee must be a member of this same workspace -- otherwise a
      // client could assign a conversation to an arbitrary user id.
      const member = await db.workspaceMember.findFirst({
        where: { workspaceId, userId: payload.assigneeId },
        select: { userId: true },
      });
      if (!member) {
        return NextResponse.json(
          { error: "Assignee must be a member of this workspace" },
          { status: 400 }
        );
      }
      data.assignee = { connect: { id: payload.assigneeId } };
    } else {
      return NextResponse.json({ error: "Invalid assigneeId" }, { status: 400 });
    }
  }

  if ("snoozedUntil" in payload) {
    if (payload.snoozedUntil === null) {
      data.snoozedUntil = null;
    } else if (typeof payload.snoozedUntil === "string" && !Number.isNaN(Date.parse(payload.snoozedUntil))) {
      data.snoozedUntil = new Date(payload.snoozedUntil);
    } else {
      return NextResponse.json({ error: "Invalid snoozedUntil" }, { status: 400 });
    }
  }

  const updated = await db.conversation.update({
    where: { id: conversationId },
    data,
    include: { contact: true, assignee: true },
  });

  return NextResponse.json(updated);
}
