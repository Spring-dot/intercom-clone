"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DomainSettings({
  initialDomain,
  initialVerified,
  isAdmin,
}: {
  initialDomain: string | null;
  initialVerified: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = domain.trim();
    if (!trimmed) return;

    setIsSaving(true);
    setError(null);
    setVerifyMessage(null);
    try {
      const res = await fetch("/api/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save domain");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save domain");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVerify() {
    setIsVerifying(true);
    setVerifyMessage(null);
    try {
      const res = await fetch("/api/domain/verify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Verification failed");
      setVerifyMessage(data.verified ? "Verified!" : (data.reason ?? "Not verified yet."));
      router.refresh();
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-2 text-sm max-w-lg">
        <p className="text-gray-500">Only workspace admins can change the custom domain.</p>
        {initialDomain ? (
          <p>
            Current domain: <span className="font-medium">{initialDomain}</span> --{" "}
            {initialVerified ? "verified" : "pending verification"}
          </p>
        ) : (
          <p>No custom domain configured.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg text-sm">
      <form onSubmit={handleSave} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          Custom domain
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="help.yourcompany.com"
            className="border border-gray-300 rounded px-2 py-1"
          />
        </label>
        <p className="text-xs text-gray-500">
          Use a subdomain (e.g. help.yourcompany.com), not your bare root domain -- root
          domains need a different DNS record type (A/ALIAS) that Vercel's dashboard will
          show you separately.
        </p>
        <button
          type="submit"
          disabled={isSaving || !domain.trim()}
          className="self-start rounded bg-black px-3 py-1.5 text-white disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save domain"}
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </form>

      {initialDomain && (
        <div className="border border-gray-200 rounded p-3 flex flex-col gap-2">
          <p>
            Status:{" "}
            <span className={initialVerified ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
              {initialVerified ? "Verified" : "Pending"}
            </span>
          </p>

          <div className="bg-gray-50 rounded p-2 font-mono text-xs">
            CNAME {initialDomain} -&gt; (the target Vercel shows you for this exact domain)
          </div>
          <p className="text-gray-500">
            Vercel assigns a unique CNAME target per domain -- there&apos;s no single fixed
            value to print here. Add this domain in your Vercel project (Settings &rarr;
            Domains &rarr; Add) to see the exact target for your DNS provider. Once that
            record is in place, DNS attachment and TLS are both handled by Vercel
            automatically -- click &quot;Check now&quot; below once you&apos;ve added the record.
          </p>

          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying}
            className="self-start rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          >
            {isVerifying ? "Checking..." : "Check now"}
          </button>
          {verifyMessage && <p className="text-gray-600">{verifyMessage}</p>}
        </div>
      )}
    </div>
  );
}
