"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function InboxFilters({
  members,
}: {
  members: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.push(`/inbox?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm mb-4">
      <label className="flex items-center gap-1">
        Channel
        <select
          value={searchParams.get("channel") ?? ""}
          onChange={(e) => updateParam("channel", e.target.value)}
          className="border border-gray-300 rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="chat">Chat</option>
          <option value="email">Email</option>
        </select>
      </label>

      <label className="flex items-center gap-1">
        Status
        <select
          value={searchParams.get("status") ?? ""}
          onChange={(e) => updateParam("status", e.target.value)}
          className="border border-gray-300 rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="snoozed">Snoozed</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>

      <label className="flex items-center gap-1">
        Assignee
        <select
          value={searchParams.get("assignee") ?? ""}
          onChange={(e) => updateParam("assignee", e.target.value)}
          className="border border-gray-300 rounded px-2 py-1"
        >
          <option value="">All</option>
          <option value="unassigned">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
