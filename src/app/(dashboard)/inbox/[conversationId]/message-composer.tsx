"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply..."
        rows={3}
        className="border border-gray-300 rounded p-2 text-sm"
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
