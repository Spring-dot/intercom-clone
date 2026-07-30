import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace, ACTIVE_WORKSPACE_COOKIE } from "@/lib/ensure-workspace";

/**
 * Sets which of the caller's workspaces the dashboard is looking at. The
 * cookie is only ever a preference -- ensureWorkspace() re-checks it against
 * that user's real memberships on every request, so writing an arbitrary value
 * here grants nothing. We still validate up front so a bad request reports an
 * error instead of silently doing nothing.
 */
export async function POST(request: NextRequest) {
  const { memberships } = await ensureWorkspace();

  const payload = await request.json().catch(() => null);
  const workspaceId = typeof payload?.workspaceId === "string" ? payload.workspaceId : null;

  if (!workspaceId || !memberships.some((m) => m.workspaceId === workspaceId)) {
    return NextResponse.json({ error: "Not a member of that workspace" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, workspaceId });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
