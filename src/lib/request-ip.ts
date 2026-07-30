import type { NextRequest } from "next/server";

/**
 * Next.js dropped `NextRequest#ip`; the platform's edge/proxy layer (Vercel,
 * or whatever reverse proxy sits in front of this app) is expected to set
 * `x-forwarded-for` instead.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}
