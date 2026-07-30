"use client";

import { useEffect, useState } from "react";

type PanelState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | {
      kind: "ok";
      whatUserWants: string;
      whatsBeenTried: string;
      currentStatus: string;
      stale: boolean;
    };

/**
 * Fetches (and, server-side, lazily regenerates) the AI summary when the
 * conversation is opened. Entirely self-contained -- its own fetch, own
 * try/catch, own state -- so a slow or failing summarize call can never
 * block the message thread or composer from rendering/working.
 */
export function ConversationSummaryPanel({
  conversationId,
  messageCount,
}: {
  conversationId: string;
  messageCount: number;
}) {
  const [state, setState] = useState<PanelState>(
    messageCount >= 4 ? { kind: "loading" } : { kind: "hidden" }
  );

  useEffect(() => {
    if (messageCount < 4) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/summarize`, {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "unavailable" });
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "ok") {
          setState({
            kind: "ok",
            whatUserWants: data.summary.whatUserWants,
            whatsBeenTried: data.summary.whatsBeenTried,
            currentStatus: data.summary.currentStatus,
            stale: Boolean(data.stale),
          });
        } else {
          setState({ kind: "unavailable" });
        }
      } catch {
        if (!cancelled) setState({ kind: "unavailable" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, messageCount]);

  if (state.kind === "hidden") return null;

  return (
    <div className="border border-gray-200 rounded p-3 text-sm bg-gray-50">
      <h3 className="text-xs font-medium uppercase text-gray-500 mb-2">AI summary</h3>
      {state.kind === "loading" && <p className="text-gray-500">Summarizing...</p>}
      {state.kind === "unavailable" && <p className="text-gray-500">Summary unavailable.</p>}
      {state.kind === "ok" && (
        <div className="flex flex-col gap-1.5">
          {state.stale && (
            <p className="text-xs text-amber-600">Showing a previous summary -- refresh failed.</p>
          )}
          <p>
            <span className="font-medium">Wants:</span> {state.whatUserWants}
          </p>
          <p>
            <span className="font-medium">Tried:</span> {state.whatsBeenTried}
          </p>
          <p>
            <span className="font-medium">Status:</span> {state.currentStatus}
          </p>
        </div>
      )}
    </div>
  );
}
