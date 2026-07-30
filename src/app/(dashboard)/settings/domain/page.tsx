import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { DomainSettings } from "./domain-settings";

export default async function DomainSettingsPage() {
  const { workspaceId, role } = await ensureWorkspace();

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { customDomain: true, customDomainVerified: true },
  });

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Custom domain</h1>
      <DomainSettings
        initialDomain={workspace?.customDomain ?? null}
        initialVerified={workspace?.customDomainVerified ?? false}
        isAdmin={role === "admin"}
      />
    </main>
  );
}
