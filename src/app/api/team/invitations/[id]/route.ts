import { NextResponse } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

/** Revokes a pending invitation. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { workspaceId, userId, role } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace admins can revoke invitations" },
      { status: 403 }
    );
  }

  // updateMany with workspaceId in the WHERE is what scopes this: an
  // invitation id from another workspace matches zero rows rather than being
  // fetched and then checked, so there's no window where the wrong row is
  // loaded in the first place.
  const { count } = await db.invitation.updateMany({
    where: { id, workspaceId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
