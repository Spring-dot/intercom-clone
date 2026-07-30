import "server-only";
import { db } from "@/lib/db";

/**
 * Flips snoozed conversations whose snooze has elapsed back to open.
 *
 * Called two ways, deliberately:
 *
 *  - Lazily, when an agent loads the inbox (scoped to their workspace). This
 *    is what makes snooze correct with no infrastructure at all -- the only
 *    moment the status matters is when someone is looking at the list, and by
 *    then it's already been fixed.
 *  - From /api/cron/reopen-snoozed on a schedule (unscoped), so a workspace
 *    nobody has open still resurfaces its due conversations for anything that
 *    reads them without a page load.
 *
 * The `status: "snoozed"` predicate is what keeps this safe to run
 * concurrently from both: a conversation an agent has since resolved by hand
 * no longer matches, so a sweep can't undo their action.
 */
export async function reopenElapsedSnoozes(workspaceId?: string): Promise<number> {
  const { count } = await db.conversation.updateMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      status: "snoozed",
      snoozedUntil: { lte: new Date() },
    },
    data: { status: "open", snoozedUntil: null },
  });
  return count;
}
