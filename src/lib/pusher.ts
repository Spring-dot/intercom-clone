import "server-only";
import Pusher from "pusher";

const globalForPusher = globalThis as unknown as { pusher: Pusher | undefined };

export const pusher =
  globalForPusher.pusher ??
  new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPusher.pusher = pusher;
}

export function conversationChannel(conversationId: string) {
  return `conversation-${conversationId}`;
}

/**
 * Broadcasts a newly created message to anyone subscribed to that
 * conversation's channel -- the agent-reply route, the widget message
 * route, and (indirectly) every open dashboard tab and widget session all
 * go through this one function.
 */
export async function publishNewMessage(conversationId: string, message: unknown) {
  await publish(conversationId, "new-message", message);
}

export type ConversationSide = "agent" | "contact";

/**
 * "X is typing" -- fire-and-forget by design. These carry no state worth
 * persisting: the receiving end expires the indicator on its own timer
 * (TYPING_TTL_MS), so a dropped event self-heals within seconds and there's
 * nothing to reconcile. That's also why there's no "stopped typing" event to
 * lose.
 */
export async function publishTyping(conversationId: string, side: ConversationSide) {
  await publish(conversationId, "typing", { side });
}

/**
 * Read receipt. Carries the watermark itself rather than just "read", so a
 * client that receives events out of order can keep the later timestamp
 * instead of flickering a message back to unread.
 */
export async function publishRead(
  conversationId: string,
  side: ConversationSide,
  at: Date
) {
  await publish(conversationId, "read", { side, at: at.toISOString() });
}

/** Visitor arrived on / left the page, for the agent-side online dot. */
export async function publishPresence(
  conversationId: string,
  side: ConversationSide,
  online: boolean
) {
  await publish(conversationId, "presence", { side, online });
}

/**
 * Swallows its own errors: by the time this runs the durable part of the
 * request (the message row, the read watermark) is already committed, so a
 * Pusher outage should degrade to "no live update" rather than fail the whole
 * request. Callers deliberately don't get a success signal to branch on --
 * there is no useful recovery, and the next event or page load re-syncs.
 */
async function publish(conversationId: string, event: string, payload: unknown) {
  try {
    await pusher.trigger(conversationChannel(conversationId), event, payload);
  } catch (error) {
    console.error(`[pusher] failed to publish ${event} event`, error);
  }
}
