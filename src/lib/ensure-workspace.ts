import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export type EnsuredWorkspace = {
  workspaceId: string;
  userId: string;
  role: "admin" | "agent";
};

/**
 * Gets the signed-in Clerk user, mirrors them into our `User` table, and makes
 * sure they belong to a workspace -- creating one (as admin) on their very
 * first call if they don't. Safe to call on every dashboard request.
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

  const existingMembership = await db.workspaceMember.findFirst({
    where: { userId: user.id },
  });

  if (existingMembership) {
    return {
      workspaceId: existingMembership.workspaceId,
      userId: user.id,
      role: existingMembership.role,
    };
  }

  // No membership yet: this is the user's first time in the app, so spin up
  // their own workspace. Wrapped in a transaction, and re-checked for an
  // existing membership inside it, so concurrent requests on first sign-in
  // can't create two workspaces for the same user.
  const membership = await db.$transaction(async (tx) => {
    const raceCheck = await tx.workspaceMember.findFirst({
      where: { userId: user.id },
    });
    if (raceCheck) return raceCheck;

    const workspace = await tx.workspace.create({
      data: { name: name ? `${name}'s Workspace` : "My Workspace" },
    });

    return tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "admin",
      },
    });
  });

  return {
    workspaceId: membership.workspaceId,
    userId: user.id,
    role: membership.role,
  };
}
