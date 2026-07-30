import Link from "next/link";
import { headers } from "next/headers";
import { ensureWorkspace } from "@/lib/ensure-workspace";
import { WidgetSnippet } from "./widget-snippet";

export default async function WidgetSettingsPage() {
  const { workspaceId } = await ensureWorkspace();

  // Built from the request rather than an env var so the snippet is correct on
  // localhost, on preview deployments, and in production without configuration.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return (
    <main className="flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Chat widget</h1>
        <p className="mt-1 text-sm text-gray-600">
          Paste this before the closing <code>&lt;/body&gt;</code> tag on any
          page you want the chat bubble on. It loads a self-contained script --
          no framework, no build step, and it renders inside a shadow root so
          your own CSS can&apos;t collide with it.
        </p>
      </div>

      <WidgetSnippet workspaceId={workspaceId} origin={origin} />

      <div className="rounded border border-gray-200 p-4 text-sm">
        <p className="font-medium">Try it first</p>
        <p className="mt-1 text-gray-600">
          The demo page embeds this exact snippet on a page outside the
          dashboard, the same way a customer&apos;s own site would. Messages you
          send there show up in your inbox live.
        </p>
        <Link
          href={`/demo?w=${workspaceId}`}
          className="mt-3 inline-block rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          Open the demo page
        </Link>
      </div>
    </main>
  );
}
