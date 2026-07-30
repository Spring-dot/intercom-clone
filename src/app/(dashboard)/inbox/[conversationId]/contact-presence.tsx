"use client";

import { useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { PRESENCE_TTL_MS } from "@/lib/presence";

/**
 * Whether the visitor still has the chat open, for chat conversations.
 *
 * Seeded server-side from Contact.lastSeenAt so it's right on first paint,
 * then kept fresh by the visitor's heartbeat arriving over Pusher. The local
 * TTL timer is what turns it back off: the widget has no "goodbye" event to
 * send when a tab closes, so absence of a beat -- not a message -- is what
 * offline means.
 */
export function ContactPresence({
  conversationId,
  initialOnline,
}: {
  conversationId: string;
  initialOnline: boolean;
}) {
  const [online, setOnline] = useState(initialOnline);

  useEffect(() => {
    const pusherClient = getPusherClient();
    const channelName = `conversation-${conversationId}`;
    const channel = pusherClient.subscribe(channelName);
    let expiry: ReturnType<typeof setTimeout> | undefined;

    function handlePresence(event: { side: string; online: boolean }) {
      if (event.side !== "contact") return;
      setOnline(event.online);
      if (expiry) clearTimeout(expiry);
      if (event.online) {
        expiry = setTimeout(() => setOnline(false), PRESENCE_TTL_MS);
      }
    }

    // Same decay applies to the server-rendered value: without a follow-up
    // heartbeat it must not sit green forever.
    if (initialOnline) {
      expiry = setTimeout(() => setOnline(false), PRESENCE_TTL_MS);
    }

    channel.bind("presence", handlePresence);
    return () => {
      channel.unbind("presence", handlePresence);
      pusherClient.unsubscribe(channelName);
      if (expiry) clearTimeout(expiry);
    };
  }, [conversationId, initialOnline]);

  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-gray-300"}`}
        aria-hidden
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
