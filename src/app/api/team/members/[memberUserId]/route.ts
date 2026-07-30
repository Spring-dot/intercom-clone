import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_ROLES = new Set(["admin", "agent"]);

/**
 * Guards against a workspace ending up with nobody who can administer it --
 * demoting or removing the last admin would leave the team unable to invite,
 * change roles, or manage the custom domain, with no in-app way back.
 */
async function isLastAdmin(workspaceId: string, memberUserId: string): Promise<boolean> {
  const target = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
    select: { role: true },
  });
  if (target?.role !== "admin") return false;

  const adminCount = await db.workspaceMember.count({
    where: { workspaceId, role: "admin" },
  });
  return adminCount <= 1;
}

/** Changes a member's role. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberUserId: string }> }
) {
  const { memberUserId } = await params;
  const { workspaceId, userId, role } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace admins can change roles" },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => null);
  const nextRole = typeof payload?.role === "string" ? payload.role : null;
  if (!nextRole || !VALID_ROLES.has(nextRole)) {
    return NextResponse.json({ error: "Role must be admin or agent" }, { status: 400 });
  }

  if (nextRole === "agent" && (await isLastAdmin(workspaceId, memberUserId))) {
    return NextResponse.json(
      { error: "This workspace needs at least one admin" },
      { status: 409 }
    );
  }

  const { count } = await db.workspaceMember.updateMany({
    where: { workspaceId, userId: memberUserId },
    data: { role: nextRole as "admin" | "agent" },
  });

  if (count === 0) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, role: nextRole });
}

/** Removes a member from the workspace. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ memberUserId: string }> }
) {
  const { memberUserId } = await params;
  const { workspaceId, userId, role } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace admins can remove members" },
      { status: 403 }
    );
  }

  if (await isLastAdmin(workspaceId, memberUserId)) {
    return NextResponse.json(
      { error: "This workspace needs at least one admin" },
      { status: 409 }
    );
  }

  // Conversations assigned to this member fall back to unassigned rather than
  // disappearing with them -- Conversation.assigneeId is optional precisely so
  // an open customer conversation survives an agent leaving the team.
  //
  // Their old Invitation row is deliberately left in place: it's already
  // stamped acceptedAt, and redeemPendingInvitations only ever considers
  // unaccepted ones, so it can't silently re-add them. Keeping it also means
  // re-inviting later refreshes that row instead of racing a fresh insert
  // against the (workspaceId, email) uniqueness constraint.
  await db.$transaction([
    db.conversation.updateMany({
      where: { workspaceId, assigneeId: memberUserId },
      data: { assigneeId: null },
    }),
    db.workspaceMember.deleteMany({ where: { workspaceId, userId: memberUserId } }),
  ]);

  return NextResponse.json({ ok: true });
}
