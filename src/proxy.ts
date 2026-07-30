import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`,
// but Clerk's helper (which builds the underlying handler) is still
// called `clerkMiddleware`.
const isProtectedRoute = createRouteMatcher([
  "/inbox(.*)",
  "/settings(.*)",
  "/kb(.*)",
  "/api/inbox(.*)",
  "/api/settings(.*)",
  "/api/conversations(.*)",
  "/api/articles(.*)",
  "/api/categories(.*)",
  "/api/domain(.*)",
]);

// Called by anonymous website visitors (the embeddable widget) or by
// third-party providers (the inbound-email webhook) -- must never require a
// Clerk session. Listed explicitly (rather than just relying on it not being
// in isProtectedRoute) so it reads as a deliberate decision, not an
// oversight, and so a future edit to isProtectedRoute can't accidentally
// net-catch it via a broad matcher. These routes still authenticate their
// caller -- the widget via its opaque visitorToken, the webhook via
// resend.webhooks.verify() -- just not through Clerk.
const isPublicRoute = createRouteMatcher([
  "/api/widget(.*)",
  "/api/webhooks(.*)",
  "/api/kb-search(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
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
