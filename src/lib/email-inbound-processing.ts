import "server-only";
import type { GetReceivingEmailResponseSuccess } from "resend";
import { db } from "@/lib/db";
import { getHeader, extractMessageIds, normalizeMessageId } from "@/lib/email";
import { publishNewMessage } from "@/lib/pusher";

export type InboundProcessingResult =
  | { ok: true; conversationId: string; messageId: string; deduped?: true }
  | { ok: false; status: number; error: string };

/**
 * Everything that happens once we already trust a fully-fetched inbound
 * email (past signature verification): resolve the workspace from the "to"
 * address, thread it against an existing conversation if possible, write
 * the Message, and broadcast it. Split out from the route handler so it can
 * be exercised directly in tests without needing a live Resend account
 * behind the "fetch full email" call.
 */
export async function processInboundEmail(
  full: GetReceivingEmailResponseSuccess
): Promise<InboundProcessingResult> {
  const recipients = full.received_for?.length ? full.received_for : full.to;
  const workspaceSlug = recipients
    .map((address) => /^support\+([^@]+)@/i.exec(address)?.[1] ?? null)
    .find((slug): slug is string => Boolean(slug));

  if (!workspaceSlug) {
    console.error("[email-inbound] no recognizable workspace address among recipients", recipients);
    return { ok: false, status: 400, error: "Unrecognized recipient address" };
  }

  const workspace = await db.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) {
    return { ok: false, status: 404, error: "Unknown workspace" };
  }

  const inboundMessageId = full.message_id ? normalizeMessageId(full.message_id) : null;

  // Webhook redelivery is normal (timeouts, retries) -- dedupe by the
  // inbound email's own Message-ID rather than creating a second Message.
  if (inboundMessageId) {
    const existing = await db.message.findFirst({
      where: { workspaceId: workspace.id, emailMessageId: inboundMessageId },
      select: { id: true, conversationId: true },
    });
    if (existing) {
      return { ok: true, deduped: true, conversationId: existing.conversationId, messageId: existing.id };
    }
  }

  const fromEmail = full.from;
  const inReplyToHeader = getHeader(full.headers, "In-Reply-To");
  const referencesHeader = getHeader(full.headers, "References");
  const candidateIds = [...extractMessageIds(inReplyToHeader), ...extractMessageIds(referencesHeader)];

  const contact = await db.contact.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email: fromEmail } },
    update: {},
    create: { workspaceId: workspace.id, email: fromEmail, name: fromEmail },
  });

  // Thread matching: an existing Message in THIS workspace whose own
  // emailMessageId matches something in the inbound In-Reply-To/References
  // chain tells us which conversation this reply belongs to.
  let conversation = null;
  if (candidateIds.length > 0) {
    const matchedMessage = await db.message.findFirst({
      where: { workspaceId: workspace.id, emailMessageId: { in: candidateIds } },
      select: { conversationId: true },
    });
    if (matchedMessage) {
      conversation = await db.conversation.findUnique({ where: { id: matchedMessage.conversationId } });
    }
  }

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        channel: "email",
        status: "open",
        emailSubject: full.subject,
      },
    });
  }

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        senderType: "contact",
        body: full.text ?? full.html ?? "",
        emailMessageId: inboundMessageId,
        emailInReplyTo: inReplyToHeader,
      },
    });
    // A reply to a resolved/snoozed conversation should resurface it.
    await tx.conversation.update({ where: { id: conversation.id }, data: { status: "open" } });
    return created;
  });

  await publishNewMessage(conversation.id, message);

  return { ok: true, conversationId: conversation.id, messageId: message.id };
}
