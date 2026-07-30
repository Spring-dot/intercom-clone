"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "agent";
  online: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: "admin" | "agent";
  expiresAt: string;
};

export function TeamSettings({
  isAdmin,
  currentUserId,
  members,
  invitations,
}: {
  isAdmin: boolean;
  currentUserId: string;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown after a successful invite: the invited person is added automatically
  // when they sign in with this address, but the link is what an admin can
  // paste into Slack when email delivery isn't set up.
  const [lastInvite, setLastInvite] = useState<{ url: string; emailed: boolean } | null>(null);

  async function send(url: string, init: RequestInit) {
    setIsBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong");
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setLastInvite(null);
    const data = await send("/api/team/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    if (data) {
      setEmail("");
      setLastInvite({ url: data.inviteUrl, emailed: Boolean(data.emailed) });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Invite a teammate</h2>
          <form onSubmit={handleInvite} className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-w-56 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "agent")}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={isBusy || !email.trim()}
              className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Send invite
            </button>
          </form>

          {lastInvite && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="font-medium">Invitation created.</p>
              <p className="mt-1 text-gray-600">
                {lastInvite.emailed
                  ? "We emailed them a link. They're also added automatically the first time they sign in with that address."
                  : "Email delivery isn't configured, so send them this link. They're also added automatically the first time they sign in with that address."}
              </p>
              <code className="mt-2 block break-all rounded bg-white p-2 text-xs">
                {lastInvite.url}
              </code>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Members</h2>
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span
                aria-label={member.online ? "Online" : "Offline"}
                title={member.online ? "Online" : "Offline"}
                className={`h-2 w-2 shrink-0 rounded-full ${
                  member.online ? "bg-green-500" : "bg-gray-300"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{member.name}</span>
                {member.userId === currentUserId && (
                  <span className="ml-1 text-xs text-gray-500">(you)</span>
                )}
                <span className="block truncate text-xs text-gray-500">{member.email}</span>
              </span>

              {isAdmin ? (
                <>
                  <select
                    value={member.role}
                    disabled={isBusy}
                    onChange={(e) =>
                      send(`/api/team/members/${member.userId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ role: e.target.value }),
                      })
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      send(`/api/team/members/${member.userId}`, { method: "DELETE" })
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-xs uppercase text-gray-500">{member.role}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Pending invitations</h2>
          {invitations.length === 0 ? (
            <p className="text-sm text-gray-500">No pending invitations.</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded border border-gray-200">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{invitation.email}</span>
                    <span className="text-xs text-gray-500">
                      {invitation.role} &middot; expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      send(`/api/team/invitations/${invitation.id}`, { method: "DELETE" })
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
