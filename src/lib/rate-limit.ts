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
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set -- widget rate limiting is disabled (failing open)."
    );
    ratelimit = null;
    return ratelimit;
  }

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "widget-ratelimit",
  });
  return ratelimit;
}

/** Returns true if the request should proceed. Fails open if Upstash isn't configured. */
export async function checkWidgetRateLimit(ip: string): Promise<boolean> {
  const rl = getRatelimit();
  if (!rl) return true;
  const { success } = await rl.limit(ip);
  return success;
}
