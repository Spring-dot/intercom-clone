"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationStatus } from "@/generated/prisma/client";

const STATUS_OPTIONS: ConversationStatus[] = ["open", "snoozed", "resolved"];
const SNOOZE_MINUTES = 1;

export function ConversationControls({
  conversationId,
  status,
  assigneeId,
  snoozedUntil,
  members,
}: {
  conversationId: string;
  status: ConversationStatus;
  assigneeId: string | null;
  snoozedUntil: string | null;
  members: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(data: Record<string, unknown>) {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update conversation");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update conversation");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSnooze() {
    const snoozedUntilDate = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
    patch({ status: "snoozed", snoozedUntil: snoozedUntilDate.toISOString() });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-1">
        Status
        <select
          value={status}
          disabled={isSaving}
          onChange={(e) => patch({ status: e.target.value })}
          className="border border-gray-300 rounded px-2 py-1"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1">
        Assignee
        <select
          value={assigneeId ?? ""}
          disabled={isSaving}
          onChange={(e) => patch({ assigneeId: e.target.value === "" ? null : e.target.value })}
          className="border border-gray-300 rounded px-2 py-1"
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={handleSnooze}
        disabled={isSaving}
        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
      >
        Snooze {SNOOZE_MINUTES}m
      </button>

      {snoozedUntil && status === "snoozed" && (
        <span className="text-xs text-gray-500">
          Reopens at {new Date(snoozedUntil).toLocaleTimeString()}
        </span>
      )}

      {error && <p className="text-sm text-red-600 w-full">{error}</p>}
    </div>
  );
}
