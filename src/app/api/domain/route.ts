import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { Prisma } from "@/generated/prisma/client";

/**
 * ## What actually serving the help center on a custom domain requires
 * (deliberately NOT built in this pass -- documented per the timeline
 * trade-off, not an oversight)
 *
 * Setting Workspace.customDomain and DNS-verifying it (this route +
 * src/app/api/domain/verify/route.ts) is necessary but NOT sufficient to
 * make https://help.theircompany.com/ actually serve that workspace's help
 * center. Three more things are needed, none of which this pass builds:
 *
 * 1. **Attach the domain to this Vercel project.** Either:
 *    - Manually: Vercel dashboard -> this project -> Settings -> Domains ->
 *      Add Domain -> enter the same hostname the admin saved here. This is
 *      also where the admin gets the *exact* CNAME target to put in their
 *      DNS -- see VERCEL_CNAME_PATTERN in ./verify/route.ts for why we
 *      can't just print one fixed value in our own UI (Vercel assigns a
 *      unique CNAME target per domain, not a single global constant).
 *    - Or programmatically, later: Vercel's Domains API
 *      (`POST /v10/projects/{projectId}/domains` with a Vercel API token)
 *      can attach it for the admin instead of sending them to the
 *      dashboard. Deferred -- not wired up here.
 * 2. **TLS/SSL**: automatic once (1) is done and DNS resolves correctly --
 *    Vercel provisions a Let's Encrypt certificate for the domain on its
 *    own. We do not (and should not) implement certificate handling
 *    ourselves.
 * 3. **Host-based routing inside this app.** Even with (1) and (2) done,
 *    Vercel will happily serve *this* Next.js app at
 *    https://help.theircompany.com/ -- but every route in this app is
 *    still written assuming the URL shape /help-center/{workspaceSlug}/...
 *    Making the custom domain's root path resolve to the right workspace's
 *    help center needs Host-header-aware routing (e.g. reading `host` in
 *    src/proxy.ts, looking up the Workspace by customDomain, and rewriting
 *    to /help-center/{slug}/...). That routing logic is NOT built in this
 *    pass -- it's a distinct, separable piece of work from DNS capture +
 *    verification, and is called out here explicitly so it isn't mistaken
 *    for already-done.
 */

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export async function POST(request: NextRequest) {
  const { workspaceId, userId, role } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Tenant scoping comes from ensureWorkspace()'s workspaceId (the caller's
  // own workspace, same as every other route) -- there's no id param here
  // for a caller to substitute another workspace's id into, so this can
  // only ever change the caller's own workspace's domain.
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace admins can change the custom domain" },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => null);
  const domain = typeof payload?.domain === "string" ? payload.domain.trim().toLowerCase() : "";

  if (!domain || !DOMAIN_PATTERN.test(domain)) {
    return NextResponse.json(
      { error: "Enter a valid domain, e.g. help.yourcompany.com" },
      { status: 400 }
    );
  }

  try {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { customDomain: domain, customDomainVerified: false },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "That domain is already in use by another workspace" },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ domain, verified: false });
}
