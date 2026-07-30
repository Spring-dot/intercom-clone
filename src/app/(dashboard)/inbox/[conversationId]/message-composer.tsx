"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TYPING_THROTTLE_MS } from "@/lib/presence";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTypingSentAt = useRef(0);

  // Throttled, not debounced: the visitor should see the indicator while the
  // agent is still typing, not once they stop.
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return;
    lastTypingSentAt.current = now;
    fetch(`/api/conversations/${conversationId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "typing" }),
    }).catch(() => {
      // Advisory only; the next keystroke re-sends it.
    });
  }

  async function handleSend() {
    const text = body.trim();
    if (!text) return;

    setIsSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to send message");
      }
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (e.target.value.trim()) notifyTyping();
        }}
        placeholder="Write a reply..."
        rows={3}
        className="rounded border border-gray-300 p-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSend}
        disabled={isSending || !body.trim()}
        className="self-start rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {isSending ? "Sending..." : "Send"}
      </button>
    </div>
  );
}
