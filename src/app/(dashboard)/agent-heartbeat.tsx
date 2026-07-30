"use client";

import { useEffect } from "react";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence";

/**
 * Mounted once by the dashboard shell: while any agent has a dashboard tab
 * open, this keeps their WorkspaceMember.lastSeenAt fresh, which is what the
 * widget reads to tell visitors whether anyone is around to answer.
 *
 * Pauses while the tab is hidden -- a backgrounded tab isn't someone watching
 * the inbox, and letting it decay is the whole point of the TTL model.
 */
export function AgentHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function beat() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await fetch("/api/presence", { method: "POST" });
      } catch {
        // A missed beat is self-correcting: the next one re-marks us online,
        // and until then we simply read as offline. Nothing to recover.
      }
    }

    beat();
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
