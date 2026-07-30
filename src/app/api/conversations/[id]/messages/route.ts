import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { publishNewMessage } from "@/lib/pusher";
import { sendReplyEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Message } from "@/generated/prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const { workspaceId, userId } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
    include: { contact: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  let message: Message;

  if (conversation.channel === "email") {
    if (!conversation.contact.email) {
      return NextResponse.json(
        { error: "This contact has no email address on file" },
        { status: 400 }
      );
    }

    // Thread against every email Message seen so far in this conversation:
    // In-Reply-To is the most recent one, References is the full chain --
    // matches what the inbound webhook stores on each side.
    const priorEmails = await db.message.findMany({
      where: { conversationId, emailMessageId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { emailMessageId: true },
    });
    const referenceChain = priorEmails.map((m) => m.emailMessageId!);
    const inReplyTo = referenceChain.length > 0 ? referenceChain[referenceChain.length - 1] : null;

    try {
      message = await sendReplyEmail({
        to: conversation.contact.email,
        subject: conversation.emailSubject ? `Re: ${conversation.emailSubject}` : "Re: your message",
        body: text,
        conversationId,
        workspaceId,
        authorId: userId,
        inReplyTo,
        references: referenceChain.length > 0 ? referenceChain.join(" ") : null,
      });
    } catch (error) {
      console.error("[email] failed to send reply", error);
      return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
    }

    // Bumps `updatedAt` (via @updatedAt) so the conversation resurfaces to
    // the top of the inbox list.
    await db.conversation.update({ where: { id: conversationId }, data: {} });
  } else {
    message = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          workspaceId,
          conversationId,
          senderType: "agent",
          authorId: userId,
          body: text,
        },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: {} });
      return created;
    });
  }

  await publishNewMessage(conversationId, message);

  return NextResponse.json(message, { status: 201 });
}
