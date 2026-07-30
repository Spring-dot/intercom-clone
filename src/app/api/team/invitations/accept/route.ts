import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/ensure-workspace";

/**
 * Redeems an invitation from its link. The token alone is not sufficient: the
 * signed-in user's Clerk-verified email must equal the invited address, so a
 * forwarded or leaked link can't put a stranger inside someone's workspace.
 *
 * Most invitations never reach this route -- signing in with the invited
 * address redeems them automatically (see redeemPendingInvitations). This
 * exists for the explicit link-click path, and to give a person who signed in
 * with the *wrong* account a clear error instead of a silently empty
 * workspace.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to accept this invitation" }, { status: 401 });
  }

  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) {
    return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const token = typeof payload?.token === "string" ? payload.token : null;
  if (!token) {
    return NextResponse.json({ error: "Missing invitation token" }, { status: 400 });
  }

  const invitation = await db.invitation.findUnique({ where: { token } });

  if (
    !invitation ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date() ||
    invitation.email.toLowerCase() !== email.toLowerCase()
  ) {
    // One message for every failure mode on purpose: distinguishing "expired"
    // from "not yours" from "no such token" would let someone probe which
    // addresses have been invited to which workspaces.
    return NextResponse.json(
      { error: "This invitation isn't valid for your account." },
      { status: 403 }
    );
  }

  await db.user.upsert({
    where: { id: user.id },
    update: { email },
    create: {
      id: user.id,
      email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    },
  });

  await db.$transaction([
    db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
      update: {},
      create: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role,
      },
    }),
    db.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  // Land them in the workspace they just accepted into, not whichever one
  // happens to sort first among their memberships.
  const response = NextResponse.json({ ok: true, workspaceId: invitation.workspaceId });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, invitation.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
