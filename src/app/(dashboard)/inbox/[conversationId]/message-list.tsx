"use client";

import { useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { TYPING_TTL_MS } from "@/lib/presence";

type MessageItem = {
  id: string;
  senderType: string;
  body: string;
  createdAt: string;
};

export function MessageList({
  conversationId,
  initialMessages,
  initialContactLastReadAt,
}: {
  conversationId: string;
  initialMessages: MessageItem[];
  initialContactLastReadAt: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [contactLastReadAt, setContactLastReadAt] = useState<number | null>(
    initialContactLastReadAt ? Date.parse(initialContactLastReadAt) : null
  );
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const pusherClient = getPusherClient();
    const channelName = `conversation-${conversationId}`;
    const channel = pusherClient.subscribe(channelName);

    // Marking the thread read is what puts a "Seen" under the visitor's
    // message in their widget, so it fires on open and on every inbound
    // message that lands while the agent is looking at it.
    function markRead() {
      fetch(`/api/conversations/${conversationId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "read" }),
      }).catch(() => {
        // Advisory only -- the next inbound message or page load re-sends it.
      });
    }

    function handleNewMessage(message: MessageItem) {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.senderType === "contact") {
        setIsContactTyping(false);
        markRead();
      }
    }

    function handleTyping(event: { side: string }) {
      if (event.side !== "contact") return;
      setIsContactTyping(true);
      // Expiry is local rather than waiting for a "stopped typing" event:
      // there's no such event to drop, and a closed tab decays on its own.
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setIsContactTyping(false), TYPING_TTL_MS);
    }

    function handleRead(event: { side: string; at: string }) {
      if (event.side !== "contact") return;
      const at = Date.parse(event.at);
      // Keep the later watermark -- an out-of-order event must never walk
      // "Seen" back off a message.
      setContactLastReadAt((prev) => (!Number.isNaN(at) && (prev === null || at > prev) ? at : prev));
    }

    channel.bind("new-message", handleNewMessage);
    channel.bind("typing", handleTyping);
    channel.bind("read", handleRead);
    markRead();

    return () => {
      channel.unbind("new-message", handleNewMessage);
      channel.unbind("typing", handleTyping);
      channel.unbind("read", handleRead);
      pusherClient.unsubscribe(channelName);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [conversationId]);

  // Receipt goes under the newest agent message only: "read" is a watermark,
  // so anything older is implied.
  const lastAgentIndex = messages.map((m) => m.senderType).lastIndexOf("agent");

  return (
    <ul className="flex flex-col gap-3 border-t border-gray-200 pt-4">
      {messages.map((message, index) => {
        const sentAt = Date.parse(message.createdAt);
        const isSeen =
          index === lastAgentIndex &&
          contactLastReadAt !== null &&
          !Number.isNaN(sentAt) &&
          contactLastReadAt >= sentAt;

        return (
          <li key={message.id} className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase text-gray-500">
              {message.senderType}
            </span>
            <p className="text-sm">{message.body}</p>
            {isSeen && <span className="text-xs text-gray-400">Seen by customer</span>}
          </li>
        );
      })}

      {isContactTyping && (
        <li className="text-xs italic text-gray-500">Customer is typing...</li>
      )}
    </ul>
  );
}
