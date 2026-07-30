import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Vercel assigns a UNIQUE CNAME target per project+domain -- e.g.
 * `d1d4fc829fe7bc7c.vercel-dns-017.com` -- rather than one fixed global
 * hostname (verified directly against Vercel's current docs on
 * 2026-07-30; the commonly-remembered "cname.vercel-dns.com" is stale).
 * That means there is no single expected value we can store and compare
 * the resolved CNAME against exactly. Instead, this checks that the
 * resolved target looks like ANY Vercel-managed DNS target -- a
 * "vercel-dns" substring match, which covers both that legacy form and the
 * newer per-project versioned ones. This is a real sanity check (it will
 * reject a CNAME pointing anywhere else), not a rubber stamp -- it's just
 * not a byte-exact comparison, because Vercel doesn't give us one fixed
 * value to compare against.
 */
const VERCEL_CNAME_PATTERN = /vercel-dns/i;

export async function POST() {
  const { workspaceId, userId, role } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // No id param to target another workspace's domain with -- this always
  // verifies the caller's own workspace (from ensureWorkspace()).
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace admins can verify the custom domain" },
      { status: 403 }
    );
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { customDomain: true },
  });

  if (!workspace?.customDomain) {
    return NextResponse.json(
      { error: "No custom domain is set for this workspace yet" },
      { status: 400 }
    );
  }

  let verified = false;
  let reason: string | null = null;

  try {
    const records = await dns.resolveCname(workspace.customDomain);
    verified = records.some((target) => VERCEL_CNAME_PATTERN.test(target));
    if (!verified) {
      reason =
        records.length > 0
          ? `Found a CNAME, but it doesn't point at Vercel yet (currently: ${records[0]}).`
          : "No CNAME record found for this domain.";
    }
  } catch (error) {
    // Covers ENOTFOUND / ENODATA (no CNAME record -- including apex domains,
    // which use an A record instead and will always fail a CNAME lookup)
    // and genuine resolver failures alike.
    reason =
      error instanceof Error
        ? `DNS lookup failed: ${error.message}`
        : "DNS lookup failed.";
  }

  await db.workspace.update({
    where: { id: workspaceId },
    data: { customDomainVerified: verified },
  });

  return NextResponse.json({ verified, reason });
}
