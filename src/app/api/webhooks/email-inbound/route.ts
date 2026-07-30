import { NextResponse, type NextRequest } from "next/server";
import { getResend } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { processInboundEmail } from "@/lib/email-inbound-processing";

/**
 * ## What a real inbound setup requires (not wired up in this environment --
 * there's no verified custom domain to test against)
 *
 * 1. Verify a domain in Resend: dashboard -> Domains -> Add Domain, then add
 *    the MX record it gives you so mail addressed to that domain actually
 *    reaches Resend's inbound servers instead of bouncing.
 * 2. Resend dashboard -> Webhooks -> Add Webhook, subscribed to the
 *    `email.received` event, pointing at this route's public URL
 *    (https://your-deployed-app.com/api/webhooks/email-inbound).
 * 3. Copy that webhook's signing secret into RESEND_WEBHOOK_SECRET in .env --
 *    it's what lets `resend.webhooks.verify()` below reject forged requests.
 *    This is a DIFFERENT secret from RESEND_API_KEY.
 * 4. Recipients must be addressed as support+{workspace-slug}@{your-domain}
 *    (see inboundAddressForWorkspace() in src/lib/email.ts) so this route can
 *    resolve which workspace an inbound email belongs to -- a workspace's
 *    slug is visible wherever you'd wire up a settings page to display it;
 *    for now, look it up directly: `select slug from "Workspace"`.
 *
 * Until that's set up, POST a payload shaped like Resend's real
 * `email.received` webhook, signed with RESEND_WEBHOOK_SECRET -- see the
 * project notes for a script that builds and signs one against a
 * locally-running dev server without needing a real inbound domain at all.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[email-inbound] RESEND_WEBHOOK_SECRET is not set -- rejecting all inbound email");
    return NextResponse.json({ error: "Inbound email is not configured" }, { status: 503 });
  }

  let event;
  try {
    event = getResend().webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("webhook-id") ?? "",
        timestamp: request.headers.get("webhook-timestamp") ?? "",
        signature: request.headers.get("webhook-signature") ?? "",
      },
      webhookSecret,
    });
  } catch (error) {
    console.error("[email-inbound] signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    // If this webhook is ever subscribed to more than just email.received,
    // ack-and-ignore other event types rather than erroring.
    return NextResponse.json({ ok: true });
  }

  const allowed = await checkRateLimit(getClientIp(request));
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // The webhook payload itself only carries metadata (from/to/subject/ids);
  // the body and raw headers (In-Reply-To, References) need a follow-up call.
  const { data: full, error: fetchError } = await getResend().emails.receiving.get(event.data.email_id);
  if (fetchError || !full) {
    console.error("[email-inbound] failed to fetch full inbound email", fetchError);
    return NextResponse.json({ error: "Failed to load inbound email" }, { status: 502 });
  }

  const result = await processInboundEmail(full);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
