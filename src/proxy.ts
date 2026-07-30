import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`,
// but Clerk's helper (which builds the underlying handler) is still
// called `clerkMiddleware`.
const isProtectedRoute = createRouteMatcher([
  "/inbox(.*)",
  "/settings(.*)",
  "/api/inbox(.*)",
  "/api/settings(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
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
