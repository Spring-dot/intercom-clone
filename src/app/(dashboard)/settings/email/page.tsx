import { ensureWorkspace } from "@/lib/ensure-workspace";
import { db } from "@/lib/db";
import { inboundAddressForWorkspace, EMAIL_FROM_ADDRESS } from "@/lib/email";

export default async function EmailSettingsPage() {
  const { workspaceId } = await ensureWorkspace();

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });

  const inboundAddress = workspace ? inboundAddressForWorkspace(workspace.slug) : null;

  return (
    <main className="flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Email channel</h1>
        <p className="mt-1 text-sm text-gray-600">
          Mail sent to your workspace address becomes a conversation in the same
          inbox as your chats. Replies you send from a conversation go back out
          over email, threaded with the customer&apos;s original message.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Your inbound address</h2>
        <code className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          {inboundAddress}
        </code>
        <p className="text-sm text-gray-600">
          Forward your existing support address here, or hand this out directly.
          The workspace is recovered from the <code>+{workspace?.slug}</code>{" "}
          part, so every workspace shares one verified domain and one inbound
          route rather than needing its own.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Replies are sent from</h2>
        <code className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          {EMAIL_FROM_ADDRESS}
        </code>
      </section>

      <section className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium">Before this works end to end</p>
        <p className="mt-1 text-gray-700">
          A sending domain has to be verified in Resend, its MX record pointed
          at Resend&apos;s inbound servers, and the inbound webhook aimed at{" "}
          <code>/api/webhooks/email-inbound</code>. Until then the parsing,
          threading, and conversation-matching logic is exercised by{" "}
          <code>scripts/simulate-inbound-email.ts</code>, which posts a properly
          signed synthetic payload at that webhook.
        </p>
      </section>
    </main>
  );
}
