import { NextResponse, type NextRequest } from "next/server";
import { reopenElapsedSnoozes } from "@/lib/snooze";

/**
 * Scheduled sweep that reopens elapsed snoozes across every workspace. Wired
 * up in vercel.json; Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
 *
 * Fails CLOSED when CRON_SECRET is unset, unlike the rate limiter's
 * fail-open: an unauthenticated endpoint that mutates conversation status
 * across every tenant is worth refusing to run rather than degrading. Nothing
 * breaks if it never runs -- the inbox sweeps its own workspace on load.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set -- refusing to run the snooze sweep");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reopened = await reopenElapsedSnoozes();
  return NextResponse.json({ reopened });
}
