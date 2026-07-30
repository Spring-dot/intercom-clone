import "server-only";
import { db } from "@/lib/db";
import { PRESENCE_TTL_MS } from "@/lib/presence";

/**
 * "Is anyone there to answer?" -- a count of workspace members whose dashboard
 * heartbeat is still fresh. The freshness cutoff is applied in the query
 * rather than by loading members and calling isOnline() per row, so this stays
 * a single indexed count no matter how big the team gets.
 */
export async function countOnlineAgents(workspaceId: string): Promise<number> {
  return db.workspaceMember.count({
    where: {
      workspaceId,
      lastSeenAt: { gt: new Date(Date.now() - PRESENCE_TTL_MS) },
    },
  });
}
