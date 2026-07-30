import "server-only";
import { cookies } from "next/headers";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

export const ACTIVE_WORKSPACE_COOKIE = "ic-active-workspace";

export type WorkspaceMembershipSummary = {
  workspaceId: string;
  workspaceName: string;
  role: "admin" | "agent";
};

export type EnsuredWorkspace = {
  workspaceId: string;
  userId: string;
  role: "admin" | "agent";
  /** Every workspace this user belongs to, oldest first -- powers the switcher. */
  memberships: WorkspaceMembershipSummary[];
};

/**
 * Gets the signed-in Clerk user, mirrors them into our `User` table, redeems
 * any invitation waiting on their email address, and makes sure they belong to
 * a workspace -- creating one (as admin) on their very first call if nothing
 * else applies. Safe to call on every dashboard request.
 */
export async function ensureWorkspace(): Promise<EnsuredWorkspace> {
  const user = await currentUser();
  if (!user) {
    throw new Error("ensureWorkspace() called without an authenticated user");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error("Signed-in Clerk user has no email address");
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  await db.user.upsert({
    where: { id: user.id },
    update: { email, name },
    create: { id: user.id, email, name },
  });

  await redeemPendingInvitations(user.id, email);

  let memberships = await db.workspaceMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: { select: { name: true } } },
  });

  if (memberships.length === 0) {
    await createOwnWorkspace(user.id, name);
    memberships = await db.workspaceMember.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { workspace: { select: { name: true } } },
    });
  }

  // The cookie is a *preference*, not an authorization: it only selects among
  // memberships this user provably has. A tampered value simply doesn't match
  // anything and falls back to their first workspace -- it can never point at
  // a workspace they aren't a member of.
  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active =
    memberships.find((m) => m.workspaceId === preferredId) ?? memberships[0];

  return {
    workspaceId: active.workspaceId,
    userId: user.id,
    role: active.role,
    memberships: memberships.map((m) => ({
      workspaceId: m.workspaceId,
      workspaceName: m.workspace.name,
      role: m.role,
    })),
  };
}

/**
 * Turns any live invitation addressed to this user's Clerk email into real
 * membership. Matching on the email Clerk already verified is what makes this
 * safe to do without the user clicking anything -- and what makes invitations
 * work at all in an environment where outbound email isn't deliverable yet.
 *
 * Idempotent: `skipDuplicates` plus the acceptedAt stamp mean a second call
 * (or two concurrent requests on the same sign-in) can't double-join anyone.
 */
async function redeemPendingInvitations(userId: string, email: string): Promise<void> {
  const pending = await db.invitation.findMany({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, workspaceId: true, role: true },
  });

  if (pending.length === 0) return;

  await db.$transaction([
    db.workspaceMember.createMany({
      data: pending.map((invitation) => ({
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      })),
      skipDuplicates: true,
    }),
    db.invitation.updateMany({
      where: { id: { in: pending.map((invitation) => invitation.id) } },
      data: { acceptedAt: new Date() },
    }),
  ]);
}

async function createOwnWorkspace(userId: string, name: string | null): Promise<void> {
  // Re-checked for an existing membership inside the transaction so concurrent
  // requests on first sign-in can't create two workspaces for the same user.
  await db.$transaction(async (tx) => {
    const raceCheck = await tx.workspaceMember.findFirst({ where: { userId } });
    if (raceCheck) return;

    const workspaceName = name ? `${name}'s Workspace` : "My Workspace";
    const workspace = await tx.workspace.create({
      data: { name: workspaceName, slug: await uniqueSlug(tx, workspaceName) },
    });

    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId, role: "admin" },
    });
  });
}

/**
 * Workspace slugs are unique (they're the public help-center URL and the
 * inbound-email plus-address), but two people named the same thing signing up
 * is entirely ordinary -- so collide-and-suffix rather than letting the
 * insert throw on someone's very first request.
 */
async function uniqueSlug(
  tx: { workspace: { findUnique: (args: { where: { slug: string } }) => Promise<unknown> } },
  name: string
): Promise<string> {
  const base = slugify(name) || "workspace";
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await tx.workspace.findUnique({ where: { slug: candidate } }))) {
      return candidate;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}
