"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Membership = { workspaceId: string; workspaceName: string; role: string };

/**
 * Only rendered when someone actually belongs to more than one workspace,
 * which happens when an admin invites a person who already had their own.
 * A single-workspace user never sees a control that can't do anything.
 */
export function WorkspaceSwitcher({
  memberships,
  activeWorkspaceId,
}: {
  memberships: Membership[];
  activeWorkspaceId: string;
}) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function switchTo(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;
    setIsBusy(true);
    try {
      await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      // Full refresh rather than a client-side state swap: every dashboard
      // page is server-rendered against the active workspace, so the server
      // has to re-run for the switch to mean anything.
      router.push("/inbox");
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <select
      aria-label="Active workspace"
      value={activeWorkspaceId}
      disabled={isBusy}
      onChange={(e) => switchTo(e.target.value)}
      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
    >
      {memberships.map((membership) => (
        <option key={membership.workspaceId} value={membership.workspaceId}>
          {membership.workspaceName}
        </option>
      ))}
    </select>
  );
}
