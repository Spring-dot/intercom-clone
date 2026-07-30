import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimiterName = "action" | "signal";

const LIMITER_CONFIG: Record<LimiterName, { requests: number; window: "60 s"; prefix: string }> = {
  // Things that write durable state or cost money: sending a message, editing
  // an article, asking for a summary.
  action: { requests: 20, window: "60 s", prefix: "public-route-ratelimit" },
  // Ephemeral realtime signals -- typing, read receipts, presence heartbeats.
  // A single person typing normally emits a couple of events per second, so
  // holding these to the action budget would throttle ordinary use. They're
  // still bounded, just an order of magnitude looser, because each one is a
  // no-op broadcast or a single indexed timestamp write.
  signal: { requests: 240, window: "60 s", prefix: "signal-ratelimit" },
};

const limiters = new Map<LimiterName, Ratelimit | null>();

function getRatelimit(name: LimiterName): Ratelimit | null {
  const cached = limiters.get(name);
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set -- rate limiting is disabled (failing open)."
    );
    limiters.set(name, null);
    return null;
  }

  const config = LIMITER_CONFIG[name];
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    prefix: config.prefix,
  });
  limiters.set(name, limiter);
  return limiter;
}

/**
 * Returns true if the request should proceed. Used by every unauthenticated
 * route (widget session/messages, the inbound email webhook), keyed by IP,
 * and by authenticated write routes keyed by userId.
 * Fails open if Upstash isn't configured.
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  const rl = getRatelimit("action");
  if (!rl) return true;
  const { success } = await rl.limit(key);
  return success;
}

/** Same contract as checkRateLimit, on the looser budget for realtime signals. */
export async function checkSignalRateLimit(key: string): Promise<boolean> {
  const rl = getRatelimit("signal");
  if (!rl) return true;
  const { success } = await rl.limit(key);
  return success;
}
