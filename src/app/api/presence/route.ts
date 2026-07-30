import { NextResponse } from "next/server";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";

/**
 * Agent heartbeat (see src/lib/presence.ts for the model). Deliberately NOT
 * rate-limited by the shared public limiter: it fires on a fixed 30s timer
 * per open tab, and an agent with the inbox open in three tabs is normal, not
 * abuse. The write it performs is a single indexed update of the caller's own
 * membership row.
 */
export async function POST() {
  const { workspaceId, userId } = await ensureWorkspace();

  await db.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
