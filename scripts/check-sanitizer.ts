import { sanitizeArticleHtml } from "../src/lib/sanitize-html";

/**
 * Run with `npx tsx scripts/check-sanitizer.ts`. Exits non-zero on failure.
 *
 * There's no test runner in this project, and adding one for a single pure
 * function felt like the wrong trade -- but a hand-written sanitizer is
 * exactly the kind of code that must not be trusted on inspection alone, so
 * its behaviour against known XSS vectors is asserted rather than assumed.
 * Each case below is a shape the knowledge-base editor could plausibly be
 * made to emit.
 */
const cases: [string, string][] = [
  ["<p>hello <strong>world</strong></p>", "<p>hello <strong>world</strong></p>"],
  ["<script>alert(1)</script><p>ok</p>", "<p>ok</p>"],
  ['<img src=x onerror="alert(1)">', ""],
  ['<a href="javascript:alert(1)">x</a>', '<a rel="noopener noreferrer nofollow" target="_blank">x</a>'],
  ['<a href="java\tscript:alert(1)">x</a>', '<a rel="noopener noreferrer nofollow" target="_blank">x</a>'],
  ['<a href="https://ok.com">x</a>', '<a href="https://ok.com" rel="noopener noreferrer nofollow" target="_blank">x</a>'],
  ['<p style="position:fixed">x</p>', "<p>x</p>"],
  ['<p onclick="alert(1)">x</p>', "<p>x</p>"],
  ["<style>body{display:none}</style><p>x</p>", "<p>x</p>"],
  ['<a href="/help">rel</a>', '<a href="/help" rel="noopener noreferrer nofollow" target="_blank">rel</a>'],
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = sanitizeArticleHtml(input);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(input)}\n      -> ${JSON.stringify(actual)}${ok ? "" : `\n  want  ${JSON.stringify(expected)}`}`);
}
console.log(failed === 0 ? "\nall passed" : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
