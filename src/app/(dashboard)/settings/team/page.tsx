import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { isOnline } from "@/lib/presence";
import { TeamSettings } from "./team-settings";

export default async function TeamSettingsPage() {
  const { workspaceId, userId, role } = await ensureWorkspace();

  const [members, invitations] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    // Only invitations still capable of being redeemed. Accepted ones are
    // already visible as members, and revoked/expired rows are noise.
    db.invitation.findMany({
      where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-gray-600">
          Admins manage the team, custom domain, and settings. Agents work the
          inbox and knowledge base.
        </p>
      </div>

      <TeamSettings
        isAdmin={role === "admin"}
        currentUserId={userId}
        members={members.map((member) => ({
          userId: member.userId,
          name: member.user.name ?? member.user.email,
          email: member.user.email,
          role: member.role,
          online: isOnline(member.lastSeenAt),
        }))}
        invitations={invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt.toISOString(),
        }))}
      />
    </main>
  );
}
