/**
 * Allowlist sanitizer for knowledge-base article HTML.
 *
 * Article bodies are authored in Tiptap by workspace members and then
 * rendered with dangerouslySetInnerHTML on public, unauthenticated pages.
 * Even though authors are semi-trusted today, an agent (or anyone who gets an
 * agent's session) could otherwise store script that runs for every visitor to
 * the help center -- and once custom domains are live, that script runs on the
 * customer's own hostname. So the boundary is enforced at render, not assumed
 * from who can reach the editor.
 *
 * Deliberately an allowlist, not a blocklist: the tag/attribute set below is
 * exactly what Tiptap's StarterKit can emit, and anything outside it (script,
 * iframe, style, event handlers, javascript: URLs, data: URLs) is dropped
 * rather than escaped-and-hoped-about. Written by hand rather than pulling in
 * DOMPurify/sanitize-html because the accepted grammar is this small and
 * fixed; if the editor ever gains embeds or tables, prefer swapping in a
 * maintained library over widening this list piecemeal.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "code", "pre",
  "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "a",
]);

// Per-tag attribute allowlist. Nothing global -- no class/style/id passthrough,
// since `style` alone is enough for clickjacking-style overlays.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

const SAFE_URL_SCHEME = /^(https?:|mailto:|\/|#)/i;

// Control characters and spaces are ignored by browsers *inside* a URL scheme,
// so "java\tscript:alert(1)" navigates fine while sailing past a naive
// startsWith("javascript:") check. Strip them before testing.
const URL_NOISE = new RegExp("[\u0000-\u0020]", "g");

function isSafeHref(value: string): boolean {
  return SAFE_URL_SCHEME.test(value.replace(URL_NOISE, "").toLowerCase());
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeAttributes(tag: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";

  const out: string[] = [];
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;

  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(rawAttrs)) !== null) {
    const name = match[1].toLowerCase();
    if (!allowed.has(name)) continue;

    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name === "href" && !isSafeHref(value)) continue;

    out.push(`${name}="${escapeAttribute(value)}"`);
  }

  // Outbound links from a public help center open in a new tab; rel closes the
  // reverse-tabnabbing hole that comes with target="_blank".
  if (tag === "a") {
    out.push('rel="noopener noreferrer nofollow"', 'target="_blank"');
  }

  return out.length > 0 ? ` ${out.join(" ")}` : "";
}

export function sanitizeArticleHtml(html: string): string {
  // Drop the entire contents of raw-text elements, not just their tags:
  // removing `<script>` alone would leave `alert(1)` behind as visible text,
  // and for `<style>` it would leak CSS source into the page body.
  const withoutRawText = html.replace(
    /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi,
    ""
  );

  return withoutRawText.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_full, rawTag: string, rawAttrs: string, offset: number, source: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";

      const isClosing = source[offset + 1] === "/";
      if (isClosing) return `</${tag}>`;

      return `<${tag}${sanitizeAttributes(tag, rawAttrs)}>`;
    }
  );
}
