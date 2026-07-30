import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`,
// but Clerk's helper (which builds the underlying handler) is still
// called `clerkMiddleware`.
const isProtectedRoute = createRouteMatcher([
  "/inbox(.*)",
  "/settings(.*)",
  "/api/inbox(.*)",
  "/api/settings(.*)",
  "/api/conversations(.*)",
]);

// Called by anonymous website visitors through the embeddable widget --
// must never require a Clerk session. Listed explicitly (rather than just
// relying on it not being in isProtectedRoute) so it reads as a deliberate
// decision, not an oversight, and so a future edit to isProtectedRoute can't
// accidentally net-catch it via a broad matcher.
const isPublicWidgetRoute = createRouteMatcher(["/api/widget(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicWidgetRoute(req)) {
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
