"use client";

import { useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";

type MessageItem = {
  id: string;
  senderType: string;
  body: string;
  createdAt: string;
};

export function MessageList({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: MessageItem[];
}) {
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    const pusherClient = getPusherClient();
    const channelName = `conversation-${conversationId}`;
    const channel = pusherClient.subscribe(channelName);

    function handleNewMessage(message: MessageItem) {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }

    channel.bind("new-message", handleNewMessage);
    return () => {
      channel.unbind("new-message", handleNewMessage);
      pusherClient.unsubscribe(channelName);
    };
  }, [conversationId]);

  return (
    <ul className="flex flex-col gap-3 border-t border-gray-200 pt-4">
      {messages.map((message) => (
        <li key={message.id} className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-gray-500 uppercase">
            {message.senderType}
          </span>
          <p className="text-sm">{message.body}</p>
        </li>
      ))}
    </ul>
  );
}
