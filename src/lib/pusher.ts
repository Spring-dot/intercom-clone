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
 *
 * Swallows its own errors: the message is already committed to the database
 * by the time this runs, so a Pusher outage (or, before real credentials are
 * configured, an auth failure) should degrade to "no live update" rather
 * than fail the whole request.
 */
export async function publishNewMessage(conversationId: string, message: unknown) {
  try {
    await pusher.trigger(conversationChannel(conversationId), "new-message", message);
  } catch (error) {
    console.error("[pusher] failed to publish new-message event", error);
  }
}
