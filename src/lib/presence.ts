/**
 * Presence is modelled as a heartbeat watermark, not a connect/disconnect
 * pair: each side writes `lastSeenAt` on a timer, and "online" means "wrote
 * one recently". A browser tab that dies, a laptop that sleeps, or a socket
 * that drops without a clean close all decay to offline on their own, with no
 * disconnect event to miss and no stuck-online rows to reconcile.
 *
 * TTL is deliberately ~3x the beat interval so one dropped or slow heartbeat
 * doesn't flicker a live user to offline.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const PRESENCE_TTL_MS = 90_000;

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const seen = typeof lastSeenAt === "string" ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < PRESENCE_TTL_MS;
}

/** How long a "X is typing" indicator stays up without a refreshing event. */
export const TYPING_TTL_MS = 4_000;
/** Minimum gap between typing events we send, so a fast typist sends ~2/sec. */
export const TYPING_THROTTLE_MS = 1_500;
