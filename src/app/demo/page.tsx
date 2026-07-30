// Deliberately bare: this page's only job is to load /widget.js as a plain,
// unmanaged <script> tag (not next/script) so the widget proves it works
// standing entirely outside the dashboard's own React tree -- exactly as it
// would on a third-party site.
export default function DemoPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Widget demo host page</h1>
      <p>This page embeds the chat widget exactly as a customer&apos;s website would.</p>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="/widget.js" data-workspace-id="cms7q0gqz0000u77ob86emi05"></script>
    </main>
  );
}
