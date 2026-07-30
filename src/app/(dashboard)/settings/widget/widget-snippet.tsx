"use client";

import { useState } from "react";

/**
 * `origin` is resolved server-side and passed in, rather than read from
 * `window` in an effect: the snippet has to carry an absolute src so it works
 * pasted on someone else's domain, and rendering a blank one on the first
 * paint would let an admin copy a broken tag.
 */
export function WidgetSnippet({
  workspaceId,
  origin,
}: {
  workspaceId: string;
  origin: string;
}) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${origin}/widget.js" data-workspace-id="${workspaceId}"></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure context, permissions) --
      // the snippet is on screen and selectable either way.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <pre className="overflow-x-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="self-start rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        {copied ? "Copied" : "Copy snippet"}
      </button>
    </div>
  );
}
