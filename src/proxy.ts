import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`,
// but Clerk's helper (which builds the underlying handler) is still
// called `clerkMiddleware`.

// Called by anonymous website visitors (the embeddable widget), by
// third-party providers (the inbound-email webhook), or by the scheduler
// (the snooze sweep) -- none of which can ever have a Clerk session. These
// routes still authenticate their caller: the widget via its opaque
// visitorToken, the webhook via resend.webhooks.verify(), cron via
// CRON_SECRET -- just not through Clerk.
const isPublicApiRoute = createRouteMatcher([
  "/api/widget(.*)",
  "/api/webhooks(.*)",
  "/api/kb-search(.*)",
  "/api/cron(.*)",
]);

// Everything under /api that isn't explicitly public is session-gated, and
// the dashboard page routes with it. Stated as "protect by default, opt out
// explicitly" rather than an allowlist of protected prefixes: a new API route
// added later is then secure unless someone deliberately opts it out, instead
// of being wide open until someone remembers to add it here.
const isProtectedRoute = createRouteMatcher([
  "/inbox(.*)",
  "/settings(.*)",
  "/kb(.*)",
  // An invitation link is only meaningful for a signed-in person -- gating it
  // here is what sends a first-time invitee through sign-up and back.
  "/invite(.*)",
  "/api/(.*)",
]);

// Hosts that serve the app itself rather than a workspace's vanity help-center
// domain. Anything else reaching this deployment must have been pointed here
// by a workspace admin's CNAME, so it gets rewritten into the custom-domain
// help center (see src/app/(public)/custom-domain/[host]/page.tsx).
function isAppOwnHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  // Covers both the production *.vercel.app URL and every preview deployment.
  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) return true;
  const primary = process.env.NEXT_PUBLIC_APP_HOST?.toLowerCase();
  return Boolean(primary) && hostname === primary;
}

function customDomainRewrite(req: NextRequest): NextResponse | null {
  const hostname = req.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!hostname || isAppOwnHost(hostname)) return null;

  const path = req.nextUrl.pathname;
  // API routes, assets, and the widget bundle must keep working verbatim on a
  // custom domain -- only the human-facing pages get remapped.
  if (path.startsWith("/api") || path.startsWith("/_next") || path.includes(".")) {
    return null;
  }

  // The host travels as a path segment rather than being re-read from the
  // header downstream, so the page resolves the same workspace whether it was
  // reached by rewrite or requested directly -- one code path, no hidden
  // dependency on header preservation through the rewrite.
  const url = req.nextUrl.clone();
  url.pathname = `/custom-domain/${hostname}${path === "/" ? "" : path}`;
  return NextResponse.rewrite(url);
}

export default clerkMiddleware(async (auth, req) => {
  const rewrite = customDomainRewrite(req);
  if (rewrite) return rewrite;

  if (isPublicApiRoute(req)) {
    return;
  }
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
  ],
};
