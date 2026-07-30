/**
 * Simulates Resend's `email.received` webhook against a locally-running dev
 * server, without needing a real inbound domain or a real Resend account.
 * Builds the same payload shape Resend actually sends and signs it with
 * RESEND_WEBHOOK_SECRET using the same `standardwebhooks` library Resend's
 * own SDK uses to verify -- so a valid run here proves the route's signature
 * verification and workspace-address resolution are wired correctly.
 *
 * What this DOESN'T prove: the webhook payload itself only carries metadata
 * (from/to/subject/message_id) -- the actual body and raw headers
 * (In-Reply-To, References) only come from a follow-up call to
 * `resend.emails.receiving.get(email_id)`, which needs a real RESEND_API_KEY
 * and a real inbound email id. Without those, expect this script to get past
 * signature verification and then fail with 502 "Failed to load inbound
 * email" -- that 502 (not a 401) is the actual pass condition here. The
 * threading/contact/message-creation logic downstream of that fetch is unit
 * tested directly against src/lib/email-inbound-processing.ts instead (see
 * the project notes for how).
 *
 * Usage: npx tsx scripts/simulate-inbound-email.ts [workspaceSlug]
 */
import "dotenv/config";
import { Webhook } from "standardwebhooks";

const APP_URL = process.env.SIMULATE_APP_URL ?? "http://localhost:3000";
const workspaceSlug = process.argv[2] ?? "REPLACE_WITH_A_REAL_WORKSPACE_SLUG";

const secret = process.env.RESEND_WEBHOOK_SECRET;
if (!secret) {
  console.error("RESEND_WEBHOOK_SECRET is not set in .env -- nothing to sign with.");
  process.exit(1);
}

const emailDomain = process.env.EMAIL_DOMAIN || "example.com";
const toAddress = `support+${workspaceSlug}@${emailDomain}`;

const payload = JSON.stringify({
  type: "email.received",
  created_at: new Date().toISOString(),
  data: {
    email_id: "EMAIL_ID", // a real inbound email id from Resend, once you have one
    created_at: new Date().toISOString(),
    from: "visitor@customer-example.com",
    to: [toAddress],
    bcc: [],
    cc: [],
    received_for: [toAddress],
    message_id: `<simulated-${Date.now()}@customer-example.com>`,
    subject: "Help with my order",
    attachments: [],
  },
});

const webhook = new Webhook(secret);
const id = `msg_${Date.now()}`;
const timestamp = new Date();
const signature = webhook.sign(id, timestamp, payload);

async function main() {
  const res = await fetch(`${APP_URL}/api/webhooks/email-inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": signature,
    },
    body: payload,
  });
  console.log("status:", res.status);
  console.log("body:", await res.text());
}

main();
