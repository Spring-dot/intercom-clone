import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendInvitationEmail } from "@/lib/email";

const VALID_ROLES = new Set(["admin", "agent"]);
const INVITE_TTL_DAYS = 7;
// Rough shape check only. Deliverability is not this route's job to predict --
// the invite is redeemed by matching the address Clerk itself verified at
// sign-up, so a typo'd invite simply never matches and expires.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const { workspaceId, userId, role } = await ensureWorkspace();

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Tenant scoping is the workspaceId from ensureWorkspace() -- the caller's
  // own active workspace. There's no id param here for a caller to swap out,
  // so this can only ever invite into a workspace they're an admin of.
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Only workspace admins can invite team members" },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => null);
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const invitedRole = typeof payload?.role === "string" ? payload.role : "agent";

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!VALID_ROLES.has(invitedRole)) {
    return NextResponse.json({ error: "Role must be admin or agent" }, { status: 400 });
  }

  const alreadyMember = await db.workspaceMember.findFirst({
    where: { workspaceId, user: { email } },
    select: { id: true },
  });
  if (alreadyMember) {
    return NextResponse.json(
      { error: "That person is already a member of this workspace" },
      { status: 409 }
    );
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Upsert rather than insert: re-inviting the same address is how an admin
  // resends after a typo'd role or an expiry, and it should refresh the one
  // pending invite instead of accumulating rows the revoke UI then has to
  // disambiguate. Clearing acceptedAt/revokedAt is what makes re-inviting
  // someone who was previously removed work.
  const invitation = await db.invitation.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    update: {
      role: invitedRole as "admin" | "agent",
      token,
      expiresAt,
      invitedById: userId,
      acceptedAt: null,
      revokedAt: null,
    },
    create: {
      workspaceId,
      email,
      role: invitedRole as "admin" | "agent",
      token,
      expiresAt,
      invitedById: userId,
    },
  });

  const inviteUrl = `${request.nextUrl.origin}/invite/${invitation.token}`;

  // Best effort: the invite is also redeemed automatically when the invited
  // address signs in (see redeemPendingInvitations), and the dashboard shows
  // the link for copying -- so a mail failure must not fail the request or
  // leave the admin thinking no invite exists.
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  const emailed = await sendInvitationEmail({
    to: email,
    workspaceName: workspace?.name ?? "the workspace",
    inviteUrl,
  });

  return NextResponse.json(
    {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviteUrl,
      emailed,
    },
    { status: 201 }
  );
}
