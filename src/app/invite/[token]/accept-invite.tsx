"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setIsBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to accept invitation");
      router.push("/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={accept}
        disabled={isBusy}
        className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isBusy ? "Joining..." : "Accept invitation"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
