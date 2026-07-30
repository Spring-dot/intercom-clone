import "server-only";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { db } from "@/lib/db";
import type { Message } from "@/generated/prisma/client";

// Lazy: constructing `new Resend()` eagerly with an empty key throws
// immediately, which would break `next build`'s page-data collection for
// every route that imports this module (it evaluates them at build time,
// before real env vars are necessarily meaningful).
let resendClient: Resend | undefined;
export function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY || "re_placeholder_key_not_configured");
  }
  return resendClient;
}

// No real domain is verified in Resend for this environment yet -- swap
// these for your actual verified sending domain once you have one. Until
// then, outbound sends will fail at Resend (unverified domain) and that's
// expected -- see the setup notes in api/webhooks/email-inbound/route.ts.
export const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "example.com";
export const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || `support@${EMAIL_DOMAIN}`;

/**
 * The address a workspace's inbound email should be forwarded/routed to.
 * Plus-addressing means only ONE verified domain + ONE inbound route needs
 * to exist in Resend no matter how many workspaces sign up -- the inbound
 * webhook recovers the workspace by parsing the slug back out of the "to"
 * address. The alternative (a dedicated address per workspace) would need
 * the email provider to route N different addresses to us instead of one.
 */
export function inboundAddressForWorkspace(slug: string): string {
  return `support+${slug}@${EMAIL_DOMAIN}`;
}

/** Case-insensitive lookup into a raw email headers map. */
export function getHeader(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

/** Pulls every `<...>`-wrapped Message-ID out of a raw In-Reply-To/References header value. */
export function extractMessageIds(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];
  return headerValue.match(/<[^>]+>/g) ?? [];
}

export function normalizeMessageId(id: string): string {
  return id.startsWith("<") ? id : `<${id}>`;
}

/**
 * Emails a team invitation link. Returns whether it actually went out rather
 * than throwing, because the invite does not depend on this succeeding: the
 * invited address is redeemed automatically when they sign in, and the admin
 * gets a copyable link either way. Until a sending domain is verified in
 * Resend this will fail every time, and that must not surface to the admin as
 * "inviting failed" when the invitation itself was created fine.
 */
export async function sendInvitationEmail({
  to,
  workspaceName,
  inviteUrl,
}: {
  to: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<boolean> {
  try {
    const { error } = await getResend().emails.send({
      from: EMAIL_FROM_ADDRESS,
      to,
      subject: `You've been invited to ${workspaceName}`,
      text: [
        `You've been invited to join ${workspaceName} on our support platform.`,
        "",
        `Accept the invitation: ${inviteUrl}`,
        "",
        "If you weren't expecting this, you can ignore this email.",
      ].join("\n"),
    });
    if (error) {
      console.error("[email] failed to send invitation", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] failed to send invitation", error);
    return false;
  }
}

/**
 * Sends an agent's reply as an email through Resend, threading it against
 * the conversation's prior email messages, then records it as a Message row.
 * `inReplyTo`/`references` are the caller's job to compute (usually: every
 * non-null `emailMessageId` seen so far in the conversation, oldest first) --
 * this function only knows how to mint ITS OWN Message-ID and send.
 */
export async function sendReplyEmail({
  to,
  subject,
  body,
  conversationId,
  workspaceId,
  authorId,
  inReplyTo,
  references,
}: {
  to: string;
  subject: string;
  body: string;
  conversationId: string;
  workspaceId: string;
  authorId: string;
  inReplyTo: string | null;
  references: string | null;
}): Promise<Message> {
  // Generated up front (rather than letting Prisma default the Message's id)
  // so it can be embedded in the Message-ID header before the row exists.
  const messageId = randomUUID();
  const ourEmailMessageId = `<conv-${conversationId}-${messageId}@${EMAIL_DOMAIN}>`;

  const headers: Record<string, string> = { "Message-ID": ourEmailMessageId };
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references) headers["References"] = references;

  const { error } = await getResend().emails.send({
    from: EMAIL_FROM_ADDRESS,
    to,
    subject,
    text: body,
    headers,
  });
  if (error) {
    throw new Error(`Failed to send reply email: ${error.message}`);
  }

  return db.message.create({
    data: {
      id: messageId,
      workspaceId,
      conversationId,
      senderType: "agent",
      authorId,
      body,
      emailMessageId: ourEmailMessageId,
      emailInReplyTo: inReplyTo,
    },
  });
}
