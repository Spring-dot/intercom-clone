import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null | undefined;

function getRatelimit(): Ratelimit | null {
  if (ratelimit !== undefined) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set -- public-route rate limiting is disabled (failing open)."
    );
    ratelimit = null;
    return ratelimit;
  }

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "public-route-ratelimit",
  });
  return ratelimit;
}

/**
 * Returns true if the request should proceed. Used by every unauthenticated
 * route (widget session/messages, the inbound email webhook), keyed by IP.
 * Fails open if Upstash isn't configured.
 */
export async function checkRateLimit(ip: string): Promise<boolean> {
  const rl = getRatelimit();
  if (!rl) return true;
  const { success } = await rl.limit(ip);
  return success;
}
