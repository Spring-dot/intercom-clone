import Link from "next/link";
import { db } from "@/lib/db";

/**
 * A deliberately bare host page for the chat widget: it loads /widget.js as a
 * plain, unmanaged <script> tag (not next/script) so the widget proves it
 * works standing entirely outside the dashboard's own React tree -- exactly as
 * it would on a third-party site.
 *
 * The workspace comes from `?w=` rather than being hardcoded. A hardcoded id
 * only ever works against the database it was copied from, which means the
 * demo silently breaks on every deploy and for every other signup. The
 * dashboard's widget settings page links here with the right id already
 * attached.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { w } = await searchParams;
  const requestedId = typeof w === "string" ? w : null;

  // Verified before rendering the tag so a bad id shows a clear message here
  // instead of a silent console error inside the widget. This reveals only
  // whether a workspace id exists -- ids are already public by design (they
  // ship in the embed snippet on customers' own pages).
  const workspace = requestedId
    ? await db.workspace.findUnique({ where: { id: requestedId }, select: { id: true, name: true } })
    : null;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 640 }}>
      <h1>Widget demo host page</h1>

      {workspace ? (
        <>
          <p>
            This page embeds the chat widget for <strong>{workspace.name}</strong>{" "}
            exactly as a customer&apos;s website would. Open the bubble in the
            bottom-right and send a message -- it appears in that workspace&apos;s
            inbox live, and replies come back here without a reload.
          </p>
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script src="/widget.js" data-workspace-id={workspace.id}></script>
        </>
      ) : (
        <>
          <p>
            {requestedId
              ? "That workspace doesn't exist. "
              : "This page needs to know which workspace to chat with. "}
            Open{" "}
            <Link href="/settings/widget" style={{ color: "#2563eb" }}>
              Settings &rarr; Chat widget
            </Link>{" "}
            in the dashboard for your embed snippet and a link back here with
            the right workspace attached.
          </p>
        </>
      )}
    </main>
  );
}
