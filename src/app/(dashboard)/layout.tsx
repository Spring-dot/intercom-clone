import { UserButton } from "@clerk/nextjs";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { AgentHeartbeat } from "./agent-heartbeat";
import { DashboardNav } from "./dashboard-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Every dashboard page renders inside this shell, so calling ensureWorkspace()
// here is also what guarantees a workspace exists (and any pending invite is
// redeemed) before any child page queries against workspaceId.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspaceId, role, memberships } = await ensureWorkspace();

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AgentHeartbeat />

      <aside className="flex shrink-0 flex-col gap-6 border-b border-gray-200 bg-gray-50 p-4 md:min-h-screen md:w-56 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workspace?.name ?? "Workspace"}</p>
            <p className="text-xs capitalize text-gray-500">{role}</p>
          </div>
          <UserButton />
        </div>

        {memberships.length > 1 && (
          <WorkspaceSwitcher memberships={memberships} activeWorkspaceId={workspaceId} />
        )}

        <DashboardNav />
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
